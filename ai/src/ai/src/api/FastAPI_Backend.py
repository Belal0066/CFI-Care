"""
Minimal Demo Backend (FastAPI) for MedGemma RAG.
Implements 'Hub-and-Spoke' architecture:
- Data Source: Remote Redis (via Tailscale)
- Embeddings: CPU (ModernPubMedBERT)
- Vector DB: Local Qdrant
- Inference: MedGemma (GPU via llama.cpp)
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import redis
import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from sentence_transformers import SentenceTransformer
from openai import AsyncOpenAI
from prometheus_fastapi_instrumentator import Instrumentator

# Import FHIR Resources for parsing
from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from fhir.resources.condition import Condition
from fhir.resources.encounter import Encounter
from src.agent.query_rewriter import query_rewriter
from src.agent.confidence import (
    compute_generation_confidence,
    compute_validation_confidence,
    compute_overall_confidence,
    build_confidence_block,
    confidence_label,
)
from src.retrieval.query_understanding import IntentClassifier

# MCP classification categories (mirrors mcps/router.py)
MCP_CATEGORIES = {
    "A": "General Medical Query",
    "B": "Reference Ranges",
    "C": "Drug Interactions",
    "D": "Treatment Guidelines",
    "E": "Differential Diagnosis",
    "F": "Patient Education",
    "G": "Insufficient Evidence / Off-topic / Harmful",
}

# Import TOON Normalizer from project
try:
    from src.ingestion.toon import ToonNormalizer, toon_encode, extract_observation_values
except ImportError:
    logging.warning("ToonNormalizer not found, will use raw JSON fallback.")
    ToonNormalizer = None
    toon_encode = None
    extract_observation_values = None

# ============================================================================
# Configuration
# ============================================================================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FastAPI_Backend")

# Import Core Infrastructure
from src.shared.db_clients import qdrant_client
from src.ingestion.service import IngestionService
from src.shared.config import config

# Connect to Remote Redis (Cloud)
REDIS_HOST = os.getenv("REDIS_HOST", "redis-19534.c275.us-east-1-4.ec2.cloud.redislabs.com") 
REDIS_PORT = int(os.getenv("REDIS_PORT", 19534))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "yIFQU6QWucdTKlfNsy9hbVKDNBkXSdbl")

# LLM Backend — uses config singleton (set by launch.sh --local / --lightning)
LLAMA_API_BASE = config.active_llm_base_url + "/v1" if not config.active_llm_base_url.endswith("/v1") else config.active_llm_base_url
LLAMA_API_KEY = config.active_llm_api_key
MODEL_NAME = config.active_llm_model

# MCP Server (Internet Mode)
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8002")

# ============================================================================
# App Initialization & State
# ============================================================================
from contextlib import asynccontextmanager

class AppState:
    redis_client: Optional[redis.Redis] = None
    llm_client: Optional[AsyncOpenAI] = None
    reset_context: bool = False

state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Demo Backend...")
    
    # 1. Initialize Redis
    try:
        state.redis_client = redis.Redis(
            host=REDIS_HOST, 
            port=REDIS_PORT, 
            password=REDIS_PASSWORD,
            username="default",
            decode_responses=True,
            socket_connect_timeout=2
        )
        state.redis_client.ping()
        logger.info(f" Connected to Remote Redis at {REDIS_HOST}")
    except Exception as e:
        logger.error(f"️ Could not connect to Redis at {REDIS_HOST}: {e}")

    # 2. Check Qdrant (Core client handles connection)
    try:
        if qdrant_client.health_check():
            logger.info(f" Connected to Qdrant at {config.qdrant_host}:{config.qdrant_port}")
            logger.info(f"Using Collection: {qdrant_client.collection_name}")
        else:
            logger.error(" Qdrant health check failed")
    except Exception as e:
        logger.error(f" Qdrant error: {e}")

    # 3. LLM Client
    state.llm_client = AsyncOpenAI(base_url=LLAMA_API_BASE, api_key=LLAMA_API_KEY)
    logger.info(" LLM Client Initialized")
    yield

app = FastAPI(title="MedGemma Demo Backend", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)

# ============================================================================
# Models
# ============================================================================
class ChatRequest(BaseModel):
    query: str
    history: Optional[List[Dict[str, str]]] = []
    mode: str = "rag"  # "rag" for local Qdrant, "mcp" for internet MCP
    score_threshold: float = 0.65 # Adaptive-K: Score-based filtering
    top_k: int = 10 # Safety cap
    temperature: float = 0.2

class IngestResponse(BaseModel):
    status: str
    processed_count: int
    errors: List[str]

# ============================================================================
# Helpers
# ============================================================================
async def get_mcp_data(query: str) -> Dict[str, Any]:
    """Call the MCP server for internet-based retrieval."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{MCP_SERVER_URL}/mcp/query",
                json={"query": query}
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"MCP call failed: {e}")
        return {
            "query_id": "error",
            "clinical_summary": f"MCP server error: {str(e)}",
            "evidence_level": "N/A",
            "recommendation": "Retry or use local RAG mode",
            "confidence_score": 0.0,
            "references": [],
            "warnings": [str(e)]
        }

async def _run_agent_graph(request: "ChatRequest") -> StreamingResponse:
    """
    Invoke the compiled LangGraph agent with mode='auto'.
    The graph classifies intent and routes to RAG, MCP, or visualization internally.
    """
    from langchain_core.messages import HumanMessage, AIMessage
    from src.agent.graph.workflow import app as agent_app

    # Build conversation history as LangChain messages
    messages = []
    for msg in (request.history or [])[-6:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=request.query))

    state_input = {
        "messages": messages,
        "patient_id": None,
        "patient_state": {},
        "documents": [],
        "intent": "",
        "intent_confidence": 0.0,
        "rewritten_query": None,
        "encounter_groups": [],
        "internet_evidence": [],
        "retrieval_confidence": 0.0,
        "retrieval_avg_top3": 0.0,
        "has_insufficient_data": False,
        "retrieval_threshold": 0.15,
        "clinical_response": None,
        "audit_passed": True,
        "audit_failures": [],
        "audit_retry_count": 0,
        "generation_confidence": 0.0,
        "validation_confidence": 1.0,
        "overall_confidence": 0.0,
        "needs_drug_check": False,
        "mode": "auto",
        "needs_guidelines": False,
        "is_mcp_query": False,
        "viz_result": None,
    }

    try:
        result_state = await agent_app.ainvoke(state_input)
    except Exception as e:
        logger.error(f"Agent graph failed: {e}")
        async def err_gen():
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    # Extract final response from last AIMessage
    msgs = result_state.get("messages", [])
    final_text = ""
    for m in reversed(msgs):
        if hasattr(m, "content") and isinstance(m.content, str) and m.content.strip():
            final_text = m.content
            break

    if not final_text:
        final_text = "No response generated by the agent graph."

    async def agent_event_generator():
        # Emit retrieved contexts so the UI can display them
        encounter_groups = result_state.get("encounter_groups", [])
        internet_evidence = result_state.get("internet_evidence", [])
        contexts = []
        for eg in encounter_groups:
            for chunk in (eg.chunks if hasattr(eg, "chunks") else eg.get("chunks", [])):
                content = chunk.anchor_content if hasattr(chunk, "anchor_content") else chunk.get("anchor_content", "")
                score = chunk.score if hasattr(chunk, "score") else chunk.get("score", 0.0)
                contexts.append({"content": content, "score": score, "source": "rag"})
        for ev in internet_evidence:
            contexts.append({"content": ev.get("content", ""), "source": ev.get("source", "mcp")})
        if contexts:
            yield f"data: {json.dumps({'type': 'context', 'content': contexts})}\n\n"

        # Stream response as tokens (split into ~50-char chunks for smooth display)
        chunk_size = 50
        for i in range(0, len(final_text), chunk_size):
            yield f"data: {json.dumps({'type': 'token', 'content': final_text[i:i+chunk_size]})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(agent_event_generator(), media_type="text/event-stream")


def normalize_fhir_json(json_str: str) -> str:
    """Safely convert FHIR JSON to full-fidelity TOON format."""
    try:
        data = json.loads(json_str)
        
        if toon_encode:
            return toon_encode(data)
        
        # Fallback to old normalizer if toon_encode not available
        res_type = data.get("resourceType")
        if ToonNormalizer:
            if res_type == "Patient":
                return ToonNormalizer.normalize_patient(Patient(**data))
            elif res_type == "Observation":
                return ToonNormalizer.normalize_observation(Observation(**data))
            elif res_type == "Condition":
                return ToonNormalizer.normalize_condition(Condition(**data))
            elif res_type == "Encounter":
                return ToonNormalizer.normalize_encounter(Encounter(**data))
        
        # Fallback for unknown types or if parser fails
        return f"{res_type}: {json.dumps(data)}"
        
    except Exception as e:
        return f"Raw Data: {json_str[:200]}..."

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health")
def health_check():
    return {"status": "operational", "mode": "demo", "gpu_llm": True, "cpu_embed": True}

@app.post("/ingest", response_model=IngestResponse)
def trigger_ingestion():
    """
    Pull data from Remote Redis -> Standard Ingestion Service (Twin Engine)
    Uses IngestionService to ensure consistency with the rest of the RAG system.
    """
    if not state.redis_client:
        raise HTTPException(503, "Redis not connected")
    
    logger.info("Starting ingestion from Remote Redis...")
    keys = state.redis_client.keys("*")
    if not keys:
        return {"status": "empty_source", "processed_count": 0, "errors": []}
    
    encoded_count = 0
    errors = []
    
    for key in keys:
        try:
            raw_val = state.redis_client.get(key)
            if not raw_val: 
                continue

            # 1. Parse JSON to generic data
            data = json.loads(raw_val)
            
            # UNWRAP BUNDLES: Check if this is a FHIR Bundle and process entries
            resources_to_process = []
            if data.get("resourceType") == "Bundle" and "entry" in data:
                logger.info(f"Unwrapping Bundle from key: {key}")
                for entry in data["entry"]:
                    if "resource" in entry:
                        resources_to_process.append(entry["resource"])
            else:
                resources_to_process.append(data)

            for res_data in resources_to_process:
                res_type = res_data.get("resourceType")
                
                # 2. Use Raw Dictionary directly (Bypassing strict FHIR validation)
                if res_type not in ["Patient", "Observation", "Condition", "Encounter"]:
                    logger.warning(f"Skipping unsupported resource type: {res_type}")
                    continue

                # 3. Use standard IngestionService
                # Now accepts raw dictionaries
                success = IngestionService.ingest_resource(res_data)
                if success:
                    encoded_count += 1
                else:
                    errors.append(f"Key {key} (Type {res_type}): IngestionService returned False")
            
        except Exception as e:
            logger.error(f"Failed to ingest key {key}: {e}")
            errors.append(f"Key {key}: {str(e)}")

    return {
        "status": "success",
        "processed_count": encoded_count,
        "errors": errors[:10]
    }

@app.get("/patient/{patient_id}")
def get_patient(patient_id: str):
    """
    Retrieve raw FHIR data directly from Redis.
    """
    if not state.redis_client:
        raise HTTPException(503, "Redis not connected")
    
    raw_val = state.redis_client.get(patient_id)
    if not raw_val:
        raise HTTPException(404, f"Patient {patient_id} not found in Redis")
    
    try:
        return json.loads(raw_val)
    except:
        return {"raw": raw_val}

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    RAG Chat with Mode Toggle:
    - mode="rag":  Local Qdrant retrieval + MedGemma
    - mode="mcp":  Internet-based MCP server (PubMed/OpenFDA)
    - mode="auto": Full agentic pipeline — intent classification routes to RAG, MCP, or visualization
    """
    # 0. Context Resolution via Query Rewriting
    if request.history:
        original_query = request.query
        request.query = await query_rewriter.rewrite(request.query, request.history)
        if request.query != original_query:
            logger.info(f"Context Resolution: '{original_query}' -> '{request.query}'")

    # Auto-detect visualization intent (any mode)
    intent, _ = IntentClassifier.classify(request.query)
    if intent.value == "visualization":
        logger.info(f"Auto-detected visualization intent for: {request.query} (mode={request.mode})")
        viz_req = _VizChatRequest(query=request.query)
        return await _call_viz_endpoint(viz_req)

    # Agent Graph Mode: full agentic pipeline with intent-based routing
    if request.mode == "auto":
        return await _run_agent_graph(request)

    # MCP Mode: Get internet data then reason with MedGemma
    if request.mode == "mcp":
        logger.info(f"MCP Mode: Querying internet sources for: {request.query}")
        mcp_result = await get_mcp_data(request.query)
        
        # Check if MCP retrieval was successful
        if "error" in mcp_result or mcp_result.get("classification") == "G":
            async def error_generator():
                error_msg = mcp_result.get("raw_data", [{}])[0].get("content", "MCP retrieval failed")
                yield f"data: {{\"type\": \"context\", \"content\": [{{\"source\": \"MCP Error\", \"summary\": \"{error_msg}\"}}]}}\n\n"
                yield f"data: {{\"type\": \"token\", \"content\": \"Error: {error_msg}\"}}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(error_generator(), media_type="text/event-stream")
        
        # Format MCP data for MedGemma reasoning
        raw_data = mcp_result.get("raw_data", [])
        sources = mcp_result.get("sources", [])
        classification = mcp_result.get("classification", "Unknown")
        entities = mcp_result.get("entities", [])
        
        # Build context from MCP raw data
        context_str = f"Classification: {classification}\nEntities: {', '.join(entities)}\n\n"
        context_str += "Retrieved Data from Internet Sources:\n\n"
        
        for i, item in enumerate(raw_data, 1):
            source = item.get("source", "Unknown")
            content = item.get("content", "")
            context_str += f"[{i}] {source}:\n{content}\n\n"
        
        # Construct prompt for MedGemma
        system_prompt = (
            "You are MedGemma, an AI assistant specialized in clinical reasoning.\n"
            "You have been provided with authoritative medical data from PubMed, OpenFDA, and NIH sources.\n"
            "Analyze this data and provide:\n"
            "1. Clinical Summary\n"
            "2. Evidence-based Recommendation\n"
            "3. Key Considerations\n"
            "Base your response ONLY on the provided sources."
        )
        
        user_prompt = f"Question: {request.query}\n\n{context_str}"
        
        async def mcp_medgemma_generator():
            # Send MCP sources as context (full content for UI display)
            context_items = [
                {
                    "source": item.get("source", "Unknown"),
                    "content": item.get("content", ""),
                    "url": item.get("url", ""),
                    "pmid": item.get("pmid", ""),
                }
                for item in raw_data
            ]
            yield f"data: {json.dumps({'type': 'context', 'content': context_items})}\n\n"

            token_logprobs = []
            
            try:
                # Build messages with history for multi-turn context
                messages = [{"role": "system", "content": system_prompt}]
                if request.history:
                    messages.extend(request.history[-6:])
                messages.append({"role": "user", "content": user_prompt})

                extra_kwargs = {}
                if state.reset_context:
                    extra_kwargs["extra_body"] = {"cache_prompt": False}
                    state.reset_context = False
                    logger.info("Flushing LLM KV cache for context reset")

                # Stream MedGemma's clinical reasoning
                stream = await state.llm_client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    temperature=request.temperature,
                    max_tokens=1500,
                    stream=True,
                    logprobs=True,
                    **extra_kwargs,
                )
                
                async for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                    if hasattr(chunk.choices[0], "logprobs") and chunk.choices[0].logprobs:
                        for item in (chunk.choices[0].logprobs.content or []):
                            if item.logprob is not None:
                                token_logprobs.append(item.logprob)

                # ── Compute and yield confidence block ──
                retrieval_conf = min(1.0, len(raw_data) / 5.0)
                gen_conf = compute_generation_confidence(
                    token_logprobs=token_logprobs if token_logprobs else None,
                )
                val_conf = compute_validation_confidence(
                    total_claims=len(raw_data),
                    supported_claims=len(raw_data),
                )
                overall = compute_overall_confidence(
                    routing=retrieval_conf,
                    retrieval=retrieval_conf,
                    generation=gen_conf,
                    validation=val_conf,
                )
                confidence_block = (
                    f"\n\n---\n*Confidence Assessment:*\n"
                    f"- Intent Routing: {MCP_CATEGORIES.get(classification, classification)} ({retrieval_conf:.2f} - {confidence_label(retrieval_conf)})\n"
                    f"- Evidence Quality: {retrieval_conf:.2f} ({confidence_label(retrieval_conf)})\n"
                    f"- Response Consistency: {gen_conf:.2f} ({confidence_label(gen_conf)})\n"
                    f"- Factual Verification: {val_conf:.2f} ({confidence_label(val_conf)})\n"
                    f"- **Overall: {overall:.2f} ({confidence_label(overall)})**"
                )
                yield f"data: {json.dumps({'type': 'token', 'content': confidence_block})}\n\n"
                yield "data: [DONE]\n\n"
                
            except Exception as e:
                logger.error(f"MedGemma streaming failed: {e}")
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        
        return StreamingResponse(mcp_medgemma_generator(), media_type="text/event-stream")
    
    # RAG Mode: Local retrieval
    if not state.llm_client:
        raise HTTPException(503, "LLM Client not initialized")

    # 1. Embed Query (CPU via FastEmbed)
    query_vector = IngestionService.get_embedding(request.query)
    
    # 2. Retrieve Context (Updated for Hybrid/Named Vectors)
    q_cli = qdrant_client.connect()
    
    # We must search using the 'text-dense' named vector
    from qdrant_client.models import NamedVector
    
    search_result = q_cli.search(
        collection_name=qdrant_client.collection_name,
        query_vector=("text-dense", query_vector),
        score_threshold=request.score_threshold,
        limit=request.top_k
    )
    
    context_str = "\n\n".join([
        f"- {hit.payload.get('toon_content', '')}" for hit in search_result
    ])
    
    # 3. Construct Prompt
    system_prompt = (
        "You are MedGemma, an AI assistant for clinical reasoning.\n"
        "Answer the query based ONLY on the provided context.\n"
        "If the answer is not in the context, say so."
    )
    
    user_prompt = f"Context:\n{context_str}\n\nQuery: {request.query}"
    
    async def event_generator():
        # First, send the retrieved context for UI display
        contexts = [
            {
                "content": h.payload.get("toon_content", ""),
                "score": h.score,
                "patient_id": h.payload.get("patient_id", "unknown"),
                "resource_type": h.payload.get("resource_type", "unknown")
            } 
            for h in search_result
        ]
        yield f"data: {json.dumps({'type': 'context', 'content': contexts})}\n\n"

        token_logprobs = []

        try:
            messages = [{"role": "system", "content": system_prompt}]
            if request.history:
                messages.extend(request.history[-6:])
            messages.append({"role": "user", "content": user_prompt})

            extra_kwargs = {}
            if state.reset_context:
                extra_kwargs["extra_body"] = {"cache_prompt": False}
                state.reset_context = False
                logger.info("Flushing LLM KV cache for context reset")

            stream = await state.llm_client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=request.temperature,
                max_tokens=1000,
                stream=True,
                logprobs=True,
                **extra_kwargs,
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                # Accumulate logprobs from each chunk
                if hasattr(chunk.choices[0], "logprobs") and chunk.choices[0].logprobs:
                    for item in (chunk.choices[0].logprobs.content or []):
                        if item.logprob is not None:
                            token_logprobs.append(item.logprob)

            # ── Compute and yield confidence block ──
            intent, intent_conf = IntentClassifier.classify(request.query)
            qdrant_scores = [h.score for h in search_result]
            retrieval_conf = max(qdrant_scores) if qdrant_scores else 0.0
            gen_conf = compute_generation_confidence(
                token_logprobs=token_logprobs if token_logprobs else None,
            )
            val_conf = compute_validation_confidence(
                total_claims=len(search_result),
                supported_claims=len(search_result),
            )
            overall = compute_overall_confidence(
                routing=intent_conf,
                retrieval=retrieval_conf,
                generation=gen_conf,
                validation=val_conf,
            )
            confidence_block = (
                f"\n\n---\n*Confidence Assessment:*\n"
                f"- Intent Routing: {intent.value} ({intent_conf:.2f} - {confidence_label(intent_conf)})\n"
                f"- Evidence Quality: {retrieval_conf:.2f} ({confidence_label(retrieval_conf)})\n"
                f"- Response Consistency: {gen_conf:.2f} ({confidence_label(gen_conf)})\n"
                f"- Factual Verification: {val_conf:.2f} ({confidence_label(val_conf)})\n"
                f"- **Overall: {overall:.2f} ({confidence_label(overall)})**"
            )
            yield f"data: {json.dumps({'type': 'token', 'content': confidence_block})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ============================================================================
# Visualization Helpers (internal, no route — invoked by auto-detect in /chat)
# ============================================================================

class _VizChatRequest(BaseModel):
    query: str = Field(..., description="Clinician query driving the visualization")
    patient_data: Optional[List[Dict[str, Any]]] = Field(
        None, description="Structured clinical observations. If omitted, fetches from Qdrant."
    )
    patient_id: Optional[str] = Field(None, description="Patient ID for Qdrant lookup")


async def _call_viz_endpoint(request: _VizChatRequest):
    """Internal viz logic — called by auto-detect in /chat, not exposed as a route."""
    patient_data = request.patient_data

    if not patient_data:
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            q_cli = qdrant_client.connect()
            query_vector = IngestionService.get_embedding(request.query)
            query_filter = Filter(
                must=[FieldCondition(key="patient_id", match=MatchValue(value=request.patient_id))]
            ) if request.patient_id else None

            results = q_cli.search(
                collection_name=qdrant_client.collection_name,
                query_vector=("text-dense", query_vector),
                limit=50,
                query_filter=query_filter,
            )
            patient_data = []
            for r in results:
                payload = getattr(r, "payload", {}) or {}
                ts = payload.get("date_issued") or payload.get("date_normalized", "")
                toon = payload.get("toon_content", "")
                event = payload.get("event", "")
                phase = payload.get("phase", "")
                clinical_status = payload.get("clinical_status", "")
                
                # Extract measurements using shared utility
                measurements = {}
                if extract_observation_values and toon:
                    measurements = extract_observation_values(toon)

                has_phase_or_event = bool(phase or event)
                if measurements or has_phase_or_event:
                    patient_data.append({
                        "timestamp": ts,
                        "type": "observation",
                        "event": event or None,
                        "phase": phase or None,
                        "clinical_status": clinical_status or None,
                        "measurements": measurements,
                        "text_summary": toon[:200],
                    })
        except Exception as e:
            logger.warning(f"Qdrant fetch for viz failed: {e}")

    if not patient_data:
        return {
            "image_base64": None,
            "caption": "No patient data available to generate a chart.",
            "summary": "No data.",
            "chart_type": None,
        }

    logger.info(f"Viz request: {len(patient_data)} entries, query='{request.query}'")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            mcp_resp = await client.post(
                f"{MCP_SERVER_URL}/mcp/viz/render",
                json={"patient_data": patient_data, "query": request.query},
            )
            if mcp_resp.status_code != 200:
                logger.error(f"MCP viz render failed ({mcp_resp.status_code}): {mcp_resp.text[:500]}")
                return {
                    "image_base64": None,
                    "caption": f"MCP render error: {mcp_resp.status_code}",
                    "summary": "MCP error.",
                    "chart_type": None,
                }
            mcp_result = mcp_resp.json()
    except Exception as e:
        logger.error(f"MCP viz call failed: {e}")
        return {
            "image_base64": None,
            "caption": f"Visualization service error: {str(e)}",
            "summary": "Service error.",
            "chart_type": None,
        }

    image_b64 = mcp_result.get("image_base64")
    summary = mcp_result.get("summary", "")

    caption = summary
    if state.llm_client and image_b64:
        try:
            data_summary_lines = []
            for d in patient_data[:15]:
                ts = d.get("timestamp", "")[:10]
                m = d.get("measurements", {})
                parts = [ts]
                if m:
                    parts.append(", ".join(f"{k}={v}" for k, v in m.items()))
                data_summary_lines.append(" | ".join(parts))

            caption_prompt = (
                "You are a clinical caption writer. Given patient observations and a clinician query, "
                "write a concise 2-4 sentence clinical caption describing the trend over time.\n\n"
                "Rules:\n- Focus on changes over time and key events.\n"
                "- Mention specific values where relevant.\n"
                "- Do NOT invent data not shown.\n"
                "- Keep it professional and factual.\n\n"
                f"Clinician query: {request.query}\n\n"
                f"Observations:\n" + "\n".join(data_summary_lines) + "\n\nCaption:"
            )
            llm_resp = await state.llm_client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "user", "content": caption_prompt}],
                temperature=0.1,
                max_tokens=200,
            )
            caption = llm_resp.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Caption generation failed: {e}")

    return {
        "image_base64": image_b64,
        "caption": caption,
        "summary": summary,
        "chart_type": mcp_result.get("chart_type"),
    }


async def chat_reset():
    """Reset the LLM context (KV cache) for the next request."""
    state.reset_context = True
    logger.info("Chat context reset requested — KV cache will be flushed on next query")
    return {"status": "ok", "message": "Context will be reset on next query"}


# ============================================================================
# Test Data Ingestion
# ============================================================================

MOCK_DATA_PATH = os.path.join(os.path.dirname(__file__), "../../mcps/mockData/history.txt")


@app.post("/testFetch", response_model=IngestResponse)
def trigger_test_fetch():
    """
    Ingest mock clinical timeline data from history.txt into Qdrant.
    Parses YAML-like format, builds TOON content, and embeds + upserts each entry.
    """
    import yaml

    path = os.path.abspath(MOCK_DATA_PATH)
    if not os.path.exists(path):
        raise HTTPException(404, f"Mock data file not found at {path}")

    with open(path) as f:
        raw = f.read()

    # Strip header line like "[10]:" — it breaks YAML parsing
    lines = raw.splitlines()
    if lines and lines[0].strip().startswith("[") and lines[0].strip().endswith(":"):
        lines = lines[1:]
    stripped = "\n".join(lines)

    try:
        entries = yaml.safe_load(stripped)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse mock data: {e}")

    if not isinstance(entries, list):
        raise HTTPException(400, "Expected a list of entries in mock data file")

    processed = 0
    errors = []

    for entry in entries:
        try:
            eid = entry.get("id", f"mock-{processed}")
            ts = entry.get("timestamp", "unknown")
            phase = entry.get("phase", "")
            etype = entry.get("type", "")
            status = entry.get("clinical_status", "")
            event = entry.get("event", "")
            measurements = entry.get("measurements", {}) or {}
            text_summary = entry.get("text_summary", "")

            meas_str = ", ".join(f"{k}={v}" for k, v in measurements.items()) if measurements else "none"
            toon_str = (
                f"[{ts}] {etype}: {event}. "
                f"Phase: {phase}. Clinical Status: {status}. "
                f"Measurements: {meas_str}. {text_summary}"
            )

            patient_id = "pat-mock-001"
            point_id = f"mock-clinical-{eid}"

            vector = IngestionService.get_embedding(toon_str)
            sparse_data = IngestionService.get_sparse_embedding(toon_str)
            sparse_indices = sparse_data["indices"] if sparse_data else None
            sparse_values = sparse_data["values"] if sparse_data else None

            payload = {
                "id": point_id,
                "patient_id": patient_id,
                "resource_type": "Observation",
                "toon_content": toon_str,
                "fhir_raw": json.dumps(entry),
                "chunk_index": 0,
                "parent_node_id": eid,
                "date_issued": ts,
                "event": event,
                "clinical_status": status,
                "measurements": json.dumps(measurements),
                "is_diagnosis": status == "Confirmed Diagnosis",
                "is_medication": etype == "Medication",
                "is_allergy": False,
                "is_symptom": etype == "Consultation",
                "is_outcome": status in ("Recovery", "Resolved"),
            }

            qdrant_client.upsert_point(
                point_id=point_id,
                vector=vector,
                sparse_indices=sparse_indices,
                sparse_values=sparse_values,
                payload=payload,
            )
            processed += 1

        except Exception as e:
            logger.error(f"Failed to ingest mock entry {entry.get('id', '?')}: {e}")
            errors.append(f"Entry {entry.get('id', '?')}: {str(e)}")

    return IngestResponse(
        status="success" if not errors else "partial",
        processed_count=processed,
        errors=errors[:10],
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
