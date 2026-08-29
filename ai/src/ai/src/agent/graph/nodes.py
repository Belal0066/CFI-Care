from typing import Dict, Any, List, Optional
import asyncio
import logging
import json
import os
import time
import httpx
from openai import OpenAI
from langchain_core.messages import HumanMessage, AIMessage

from src.agent.graph.state import ClinicalAgentState
from src.retrieval.query_understanding import IntentClassifier, QueryContext, QueryIntent
from src.retrieval.context_retrieval import RetrievalContext
from src.retrieval.service import HybridRetriever
from src.retrieval.config import retriever_config
from src.agent.clinical_reasoning import ClinicalReasoner
from src.agent.verification import ClaimVerifier
from src.agent.react import MCPReActStep
from src.agent.confidence import (
    compute_generation_confidence,
    compute_validation_confidence,
    compute_overall_confidence,
    build_confidence_block,
)
from src.ingestion.patient_state import PatientState
from src.shared.config import config

logger = logging.getLogger(__name__)

# LLM Backend — uses config singleton (set by launch.sh --local / --lightning)
# Append /v1 path for OpenAI-compatible endpoint; avoids double path when
# the base URL already ends with /v1 (handles trailing-slash edge case too).
BASE = config.active_llm_base_url
if BASE.endswith("/v1") or BASE.endswith("/v1/"):
    LLAMA_API_BASE = BASE.rstrip("/")
else:
    LLAMA_API_BASE = BASE + "/v1"
LLAMA_MODEL_NAME = config.active_llm_model

# MCP Classification Categories
CATEGORIES = {
    "A": "General Medical Query",
    "B": "Reference Ranges",
    "C": "Drug Interactions",
    "D": "Treatment Guidelines",
    "E": "Differential Diagnosis",
    "F": "Patient Education",
    "G": "Insufficient Evidence / Off-topic / Harmful"
}

# MCP Question Type Policies - CRITICAL FOR SAFETY
MCP_QUESTION_TYPES = {
    "drug_contraindications": {
        "patterns": ["contraindication", "contraindicated", "should not take", "avoid", "not recommended"],
        "allowed_output": ["conditions", "warnings", "hypersensitivity"],
        "forbidden_output": ["dosing", "treatment protocol", "diagnostic criteria", "regimen"],
        "max_tokens": 300,
        "system_prompt": (
            "You are a clinical pharmacology assistant. Answer ONLY the drug safety question.\n\n"
            "RULES:\n"
            "- List ONLY contraindications (conditions where the drug should NOT be used)\n"
            "- Include: hypersensitivity, organ impairment warnings, drug class allergies\n"
            "- DO NOT include: dosing, treatment protocols, disease descriptions\n"
            "- Keep response SHORT and factual\n"
            "- Format: Bullet list of contraindications with brief explanation"
        )
    },
    "drug_interactions": {
        "patterns": ["interaction", "interact with", "combine with", "together with", "concomitant"],
        "allowed_output": ["drug names", "mechanism", "severity"],
        "forbidden_output": ["dosing", "treatment protocol", "disease descriptions"],
        "max_tokens": 400,
        "system_prompt": (
            "You are a clinical pharmacology assistant. Answer ONLY the drug interaction question.\n\n"
            "RULES:\n"
            "- List ONLY drug-drug interactions\n"
            "- Include: interacting drugs, mechanism, clinical significance\n"
            "- DO NOT include: dosing, treatment protocols, unrelated conditions\n"
            "- Keep response SHORT and factual"
        )
    },
    "drug_side_effects": {
        "patterns": ["side effect", "adverse effect", "adverse reaction", "adverse event"],
        "allowed_output": ["symptoms", "frequency", "severity"],
        "forbidden_output": ["dosing", "treatment protocol", "disease descriptions"],
        "max_tokens": 400,
        "system_prompt": (
            "You are a clinical pharmacology assistant. Answer ONLY the side effects question.\n\n"
            "RULES:\n"
            "- List ONLY adverse effects/side effects of the medication\n"
            "- Categorize by: Common, Serious, Rare\n"
            "- DO NOT include: dosing, treatment protocols, disease management\n"
            "- Keep response SHORT and factual"
        )
    },
    "treatment_guidelines": {
        "patterns": ["guideline", "first-line", "treatment for", "how to treat", "management of", "therapy for"],
        "allowed_output": ["clinical summary", "recommendations", "drug classes", "dosing references"],
        "forbidden_output": ["invented doses", "fabricated protocols"],
        "max_tokens": 800,
        "system_prompt": (
            "You are a Clinical Pharmacology Assistant. Synthesize a comprehensive answer from the Evidence.\n\n"
            "STRUCTURE:\n"
            "1. **Clinical Summary**: 2-3 sentences summarizing the primary treatment approach found in the sources.\n"
            "2. **Key Recommendations**: Bullet points of specific drugs, classes, or interventions cited.\n"
            "3. **Evidence Strength**: Note if sources are guidelines (strong) or single studies (weak).\n"
            "4. **Contraindications/Notes**: Mention significantly flagged warnings.\n\n"
            "ABSOLUTE RULES:\n"
            "- If specifics (doses) are missing, refer to 'authoritative protocols' rather than guessing.\n"
            "- Cite the provided sources (e.g., [1], [2]) for every claim.\n"
            "- Maintain the narrative detail provided in the source summaries."
        )
    },
    "general": {
        "patterns": [],
        "allowed_output": [],
        "forbidden_output": [],
        "max_tokens": 600,
        "system_prompt": (
            "You are a Clinical AI Assistant. Synthesize medical information from the evidence.\n"
            "Be factual and concise. Cite sources."
        )
    }
}


def classify_mcp_question_type(query: str) -> str:
    """
    Classifies the MCP question type to apply appropriate safety policies.
    This is CRITICAL for preventing domain leakage in drug safety queries.
    """
    query_lower = query.lower()
    
    # Check in priority order (most specific first)
    for qtype, config in MCP_QUESTION_TYPES.items():
        if qtype == "general":
            continue
        for pattern in config["patterns"]:
            if pattern in query_lower:
                return qtype
    
    return "general"

def get_llm_client():
    """Get a fresh LLM client connection."""
    return OpenAI(
        base_url=LLAMA_API_BASE,
        api_key="sk-no-key"
    )


def _extract_drug_name(query: str) -> str:
    """
    Extract the drug name from a query about drug safety.
    Uses pattern matching - no LLM needed for deterministic extraction.
    """
    import re
    query_lower = query.lower()
    
    # Common patterns: "contraindications for X", "X contraindications", "interactions with X"
    patterns = [
        r"contraindications?\s+(?:for|of)\s+(\w+)",
        r"(\w+)\s+contraindications?",
        r"interactions?\s+(?:for|of|with)\s+(\w+)",
        r"(\w+)\s+interactions?",
        r"side effects?\s+(?:for|of)\s+(\w+)",
        r"(\w+)\s+side effects?",
        r"adverse (?:effects?|reactions?)\s+(?:for|of|to)\s+(\w+)",
    ]
    
    # Common non-drug words to filter out
    stop_words = {'the', 'a', 'an', 'this', 'that', 'what', 'are', 'is', 'for', 'of', 
                  'with', 'to', 'drug', 'main', 'common', 'major', 'serious', 'any',
                  'guidelines', 'treatment', 'treating', 'tell', 'about', 'me', 'how'}
    
    for pattern in patterns:
        match = re.search(pattern, query_lower)
        if match:
            drug = match.group(1).strip()
            if drug not in stop_words:
                return drug.capitalize()
    
    # Fallback: look for capitalized words that might be drug names
    # Drug names often end in specific suffixes
    drug_suffixes = ['mycin', 'cillin', 'pril', 'olol', 'statin', 'prazole', 'sartan', 
                     'formin', 'oxacin', 'azole', 'dipine', 'etine', 'amine']
    
    words = query.split()
    for word in words:
        clean_word = word.strip('?.,!').lower()
        if clean_word in stop_words:
            continue
        # Check for drug-like suffixes
        for suffix in drug_suffixes:
            if clean_word.endswith(suffix):
                return clean_word.capitalize()
    
    # Last resort: look for capitalized words > 5 chars (likely proper nouns = drug names)
    for word in words:
        clean_word = word.strip('?.,!')
        if clean_word[0].isupper() and len(clean_word) > 5 and clean_word.lower() not in stop_words:
            return clean_word
    
    return ""


def _construct_drug_safety_query(raw_query: str, question_type: str) -> str:
    """
    Constructs a deterministic, focused PubMed query for drug safety and treatment questions.
    This prevents domain leakage by avoiding LLM-based query expansion.
    """
    drug_name = _extract_drug_name(raw_query)
    
    # For treatment guidelines, extract the condition instead of drug
    if question_type == "treatment_guidelines":
        # Try to extract the condition from common patterns
        import re
        condition_patterns = [
            r'treatment for\s+(.+?)(?:\?|$)',
            r'treat\s+(.+?)(?:\?|$)',
            r'guidelines?\s+for\s+(.+?)(?:\?|$)',
            r'managing?\s+(.+?)(?:\?|$)',
            r'therapy for\s+(.+?)(?:\?|$)',
        ]
        condition = ""
        query_lower = raw_query.lower()
        for pattern in condition_patterns:
            match = re.search(pattern, query_lower)
            if match:
                condition = match.group(1).strip()
                break
        
        if not condition:
            # Fallback: look for disease-like words
            words = raw_query.split()
            for word in words:
                clean = word.strip('?.,!').lower()
                if any(s in clean for s in ['pneumonia', 'diabetes', 'infection', 'disease', 'syndrome', 'failure']):
                    condition = ' '.join(w.strip('?.,!') for w in words if w.strip('?.,!').lower() not in ['what', 'are', 'the', 'current', 'guidelines', 'for', 'treating', 'treatment', 'of'])
                    break
        
        if condition:
            # Simplified query - let PubMed's relevance ranking work
            # Too many keywords can over-constrain the search
            return f"{condition} treatment guideline"
        else:
            return raw_query + " treatment guideline"
    
    if not drug_name:
        # Fallback to raw query if we can't extract drug name
        return raw_query
    
    # Construct focused, safety-specific queries
    if question_type == "drug_contraindications":
        return f"{drug_name} contraindications adverse reactions pharmacology"
    elif question_type == "drug_interactions":
        return f"{drug_name} drug interactions pharmacokinetics"
    elif question_type == "drug_side_effects":
        return f"{drug_name} adverse effects side effects safety"
    
    return f"{drug_name} pharmacology"


MCP_MAX_RETRIES = 2
MCP_RETRY_BACKOFF_BASE_SEC = 1.0


def _run_async_from_sync(coro):
    """
    Runs an async coroutine from a sync graph node.

    Every node in this module is a plain `def`, but the compiled graph is
    invoked both synchronously (app.invoke, from Streamlit) and
    asynchronously (app.ainvoke, from FastAPI_Backend.py's /chat). LangGraph
    is expected to run sync nodes in a worker thread even under ainvoke —
    but that's an assumption about LangGraph's internals, not something
    verified here against a live server. Guard it explicitly instead of
    letting an unverified assumption crash the /chat path: if this thread
    already has a running loop, run the coroutine in its own thread instead
    of calling asyncio.run() directly (which raises if a loop is running).
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _call_mcp_endpoint(original_query: str, optimized_query: str) -> Dict[str, Any]:
    """
    Calls the MCP endpoint with the optimized query.
    Extracted for reuse in both drug safety and general query paths.

    Uses the real MCP protocol by default (MCPToolManager, an SSE-based
    mcp.ClientSession calling the MedMCP server's get_medical_data tool) —
    this is a genuine host/client call, not a REST bypass of the protocol
    the server actually exposes. Set MCP_TRANSPORT=rest to roll back to the
    previous direct-HTTP call if the protocol path misbehaves; that path is
    kept, unchanged, specifically for that rollback.
    """
    if os.getenv("MCP_TRANSPORT", "mcp") == "rest":
        return _call_mcp_endpoint_rest(original_query, optimized_query)
    return _call_mcp_endpoint_protocol(original_query, optimized_query)


def _call_mcp_endpoint_protocol(original_query: str, optimized_query: str) -> Dict[str, Any]:
    from src.agent.mcp_client import mcp_manager

    logger.info(f"Calling MedMCP tool 'get_medical_data' via MCP protocol for: {optimized_query[:80]}...")

    last_error: Optional[Exception] = None
    for attempt in range(MCP_MAX_RETRIES + 1):
        try:
            content = _run_async_from_sync(
                mcp_manager.call_tool("get_medical_data", {"query": optimized_query})
            )
            data = _parse_mcp_tool_result(content)
            logger.info(f"MCP returned classification: {data.get('classification', 'N/A')}")
            data["original_query"] = original_query
            data["optimized_query"] = optimized_query
            return {"internet_evidence": [data]}
        except Exception as e:
            last_error = e
            if attempt < MCP_MAX_RETRIES:
                backoff = MCP_RETRY_BACKOFF_BASE_SEC * (2 ** attempt)
                logger.warning(
                    f"MCP tool call failed (attempt {attempt + 1}/{MCP_MAX_RETRIES + 1}): "
                    f"{e} — retrying in {backoff:.1f}s"
                )
                time.sleep(backoff)
            else:
                logger.error(f"MCP tool call failed after {MCP_MAX_RETRIES + 1} attempts: {e}")

    return {"internet_evidence": [{"error": f"MCP tool call failed: {last_error}"}]}


def _parse_mcp_tool_result(content: Any) -> Dict[str, Any]:
    """
    Parses a CallToolResult.content list (what MCPToolManager.call_tool
    returns) back into the same dict shape the REST endpoint used to
    return (RetrievalDataSchema's fields), so callers don't need to know
    which transport served the call.

    FastMCP serializes a Pydantic-model tool return as a TextContent block
    whose .text is the JSON-encoded model — this is the documented
    behavior this parsing relies on. It has not been exercised against a
    live server in this change; re-verify against the actual installed
    mcp/fastmcp versions before removing the MCP_TRANSPORT=rest fallback.
    """
    if not content:
        raise ValueError("MCP tool returned no content")

    for block in content:
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                continue

    raise ValueError(f"Could not parse MCP tool result content: {content!r}")


async def _render_chart_protocol(patient_data: List[Dict[str, Any]], sub_query: str) -> Dict[str, Any]:
    """VizMCP's render_clinical_viz tool, called via the real MCP protocol."""
    from src.agent.mcp_client import mcp_manager

    content = await mcp_manager.call_tool(
        "render_clinical_viz", {"patient_data": patient_data, "query": sub_query}
    )
    return _parse_mcp_tool_result(content)


async def _render_chart_rest(
    client: httpx.AsyncClient, mcp_server_url: str, patient_data: List[Dict[str, Any]], sub_query: str
) -> Dict[str, Any]:
    """Rollback path — direct HTTP POST, bypassing the MCP protocol."""
    resp = await client.post(
        f"{mcp_server_url}/mcp/viz/render",
        json={"patient_data": patient_data, "query": sub_query},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"MCP error {resp.status_code}")
    return resp.json()


def _call_mcp_endpoint_rest(original_query: str, optimized_query: str) -> Dict[str, Any]:
    """Rollback path — direct HTTP POST to the MCP server's REST wrapper, bypassing the MCP protocol."""
    MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8002/mcp/query")

    logger.info(f"Querying MCP at {MCP_SERVER_URL} for: {optimized_query[:80]}...")

    with httpx.Client() as client:
        try:
            resp = client.post(MCP_SERVER_URL, json={"query": optimized_query}, timeout=60.0)
            if resp.status_code == 200:
                data = resp.json()
                logger.info(f"MCP returned classification: {data.get('classification', 'N/A')}")
                data["original_query"] = original_query
                data["optimized_query"] = optimized_query
                return {"internet_evidence": [data]}
            else:
                logger.error(f"MCP returned status {resp.status_code}")
                return {"internet_evidence": [{"error": f"MCP Error {resp.status_code}"}]}
        except httpx.ConnectError as e:
            logger.error(f"MCP Connection failed: {e}")
            return {"internet_evidence": [{"error": "MCP Server not reachable"}]}
        except Exception as e:
            logger.error(f"MCP query failed: {e}")
            return {"internet_evidence": [{"error": str(e)}]}


MAX_AUDIT_RETRIES = 2


def audit_claims(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Two-tier claim audit, deliberately kept as two distinct questions:

    Tier 1 (citation attribution): does every cited ID actually exist among
    the retrieved evidence? Cheap, deterministic, always on — unchanged from
    before.

    Tier 2 (semantic support): does the text at that citation actually
    entail the claim, rather than merely existing? Runs a local NLI model
    (see src/agent/verification.py) only if
    retriever_config.semantic_verification_enabled is set, and only affects
    audit_passed/validation_confidence if
    retriever_config.semantic_verification_gating_enabled is also set —
    otherwise it runs in shadow mode: computed and returned via
    claim_verifications for observability, without changing pass/fail.

    Forms a self-correction loop with the generate node.
    """
    clinical_resp = state.get("clinical_response")
    encounter_groups = state.get("encounter_groups", [])

    if not clinical_resp or not encounter_groups:
        return {
            "audit_passed": True,
            "audit_failures": [],
            "validation_confidence": 1.0,
            "claim_verifications": [],
        }

    # Build valid IDs (tier 1) and evidence text lookup (tier 2) from encounter groups
    valid_ids = set()
    evidence_by_id: Dict[str, str] = {}
    for eg in encounter_groups:
        valid_ids.add(eg.encounter_id)
        for chunk in eg.chunks:
            valid_ids.add(chunk.anchor_id)
            evidence_by_id[chunk.anchor_id] = chunk.anchor_content

    if not valid_ids:
        return {
            "audit_passed": True,
            "audit_failures": [],
            "validation_confidence": 1.0,
            "claim_verifications": [],
        }

    failures = []
    claim_verifications = []
    claims = clinical_resp.get("claims", [])
    verifier = ClaimVerifier() if retriever_config.semantic_verification_enabled else None

    for i, claim in enumerate(claims):
        if isinstance(claim, dict):
            claim_text = claim.get("claim", "")
            cited = claim.get("source_node_ids", [])
        else:
            claim_text = getattr(claim, "claim", "")
            cited = claim.source_node_ids if hasattr(claim, "source_node_ids") else []

        for cid in cited:
            if cid not in valid_ids:
                failures.append({
                    "claim_index": i,
                    "cited_id": cid,
                    "type": "citation_missing",
                    "message": f"Claim {i} cites non-existent ID: {cid}",
                })

        if verifier is not None:
            result = verifier.verify_claim(i, claim_text, cited, evidence_by_id)
            claim_verifications.append(result.model_dump())
            if (
                retriever_config.semantic_verification_gating_enabled
                and result.semantically_supported is False
            ):
                failures.append({
                    "claim_index": i,
                    "cited_ids": cited,
                    "type": "unsupported_by_evidence",
                    "message": f"Claim {i}: {result.reason}",
                })

    passed = len(failures) == 0
    if passed:
        logger.info("Audit passed: all claim citations reference valid documents")
    else:
        logger.warning(f"Audit failed: {len(failures)} citation/support error(s) found")

    total_claims = len(claims)
    supported_claims = total_claims - len(set(f["claim_index"] for f in failures))
    validation_confidence = compute_validation_confidence(total_claims, supported_claims)

    return {
        "audit_passed": passed,
        "audit_failures": failures,
        "validation_confidence": validation_confidence,
        "claim_verifications": claim_verifications,
    }

def classify_intent(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Classifies the user's intent to route the query.
    Also sets the retrieval threshold based on intent.
    """
    from src.retrieval.query_understanding import IntentClassifier, QueryRewriter

    messages = state["messages"]
    last_message = messages[-1]
    prompt = last_message.content
    
    classifier = IntentClassifier()
    intent, confidence = classifier.classify(prompt)
    
    # Determine retrieval threshold based on intent
    retrieval_threshold = QueryRewriter.determine_retrieval_threshold(intent)
    
    # Detect drug safety review → needs RAG first (to get patient meds) then MCP (external evidence)
    _DRUG_SAFETY_KEYWORDS = [
        "adverse effect", "adverse effects", "drug-related risk", "drug risk",
        "side effect", "side effects", "potential risk", "medication review",
        "drug safety", "drug-related", "renal risk", "nephrotoxic",
    ]
    prompt_lower = prompt.lower()
    needs_drug_check = any(kw in prompt_lower for kw in _DRUG_SAFETY_KEYWORDS)
    # Broader catch: medication intent + review/risk/adverse language
    if intent.value == "medication" and any(kw in prompt_lower for kw in ["risk", "adverse", "review", "potential", "concern"]):
        needs_drug_check = True

    logger.info(f"Classified intent: {intent} with confidence {confidence}, threshold={retrieval_threshold}, needs_drug_check={needs_drug_check}")

    return {
        "intent": intent.value,
        "intent_confidence": confidence,
        "rewritten_query": prompt,
        "retrieval_threshold": retrieval_threshold,
        "needs_drug_check": needs_drug_check,
    }

def route_retrieval(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Decides whether to use Local RAG or Query MCP based on intent/flags.
    This logic can be in the graph edges, but setting a flag here helps.
    """
    # Simple logic: By default use RAG (local). 
    # If explicitly asked for general info or internet, could toggle.
    # For now, we follow the graph structure: Intent -> RAG or MCP.
    # We will let the graph conditional edges handle this based on 'intent'.
    
    # If intent is 'unknown' or specific external types, we might flag is_mcp_query
    # But for now, we assume RAG first as per the 'Clinical Agent Graph' diagram:
    # IntentRouter --> |Summary/Trends| RAG
    # IntentRouter --> |General Med Info| MCP
    
    # We'll default to RAG for clinical intents.
    return {}


def _grade_retrieval(avg_top3: float) -> Optional[str]:
    """
    Grades a retrieval score into sufficient/ambiguous/insufficient when
    retriever_config.graded_retrieval_evaluator_enabled is on; returns None
    when off (route_after_retrieval then falls back to the plain
    has_insufficient_data threshold check, unchanged from before).
    """
    if not retriever_config.graded_retrieval_evaluator_enabled:
        return None
    if avg_top3 >= retriever_config.retrieval_gatekeeper_threshold:
        return "sufficient"
    if avg_top3 >= retriever_config.retrieval_insufficient_threshold:
        return "ambiguous"
    return "insufficient"


def retrieve_patient_context(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Retrieves patient-specific documents using HybridRetriever (Qdrant vector search).
    Returns encounter-level groups instead of flat chunk list.
    """
    from src.shared.models import EncounterGroup

    intent = state["intent"]
    prompt = state["messages"][-1].content
    documents = state["documents"]
    patient_state_data = state["patient_state"]
    

    patient_id = state.get("patient_id") or (patient_state_data.get("eoc_id", "") if patient_state_data else "") or ""
    
    # Get configurable threshold from state (set by classify_intent)
    threshold = state.get("retrieval_threshold", retriever_config.retrieval_gatekeeper_threshold)

    retrieval_confidence = 0.0
    retrieval_avg_top3 = 0.0
    has_insufficient_data = False

    # ── Path A: Qdrant HybridRetriever (primary) ──
    try:
        hybrid = HybridRetriever()
        encounter_groups = hybrid.search_by_encounter(
            patient_id=patient_id,
            query=prompt,
            threshold=threshold,
            intent=intent,
        )

        # Compute retrieval confidence from encounter scores
        if encounter_groups:
            scores = [eg.score for eg in encounter_groups]
            retrieval_confidence = max(scores) if scores else 0.0
            top3 = scores[:3]
            retrieval_avg_top3 = sum(top3) / len(top3) if top3 else 0.0
        
        has_insufficient_data = (
            retrieval_avg_top3 < retriever_config.retrieval_gatekeeper_threshold
        )
        logger.info(
            f"Encounter retrieval: {len(encounter_groups)} groups, "
            f"confidence: max={retrieval_confidence:.3f}, "
            f"avg_top3={retrieval_avg_top3:.3f}, "
            f"insufficient={has_insufficient_data}"
        )

        if encounter_groups:
            return {
                "encounter_groups": encounter_groups,
                "retrieval_confidence": retrieval_confidence,
                "retrieval_avg_top3": retrieval_avg_top3,
                "has_insufficient_data": has_insufficient_data,
                "retrieval_grade": _grade_retrieval(retrieval_avg_top3),
            }

    except Exception as e:
        logger.warning(f"HybridRetriever failed ({e}), falling back to ContextRetriever")

    # ── Path B: ContextRetriever fallback (requires local documents) ──
    if documents:
        from src.retrieval.context_retrieval import ContextRetriever
        from src.ingestion.patient_state import PatientState

        patient_state_obj = patient_state_data
        if isinstance(patient_state_data, dict):
            try:
                patient_state_obj = PatientState(**patient_state_data)
            except Exception:
                patient_state_obj = patient_state_data

        retriever = ContextRetriever(documents, patient_state_obj)
        
        query_context = QueryContext(
            original_query=prompt,
            intent=QueryIntent(intent),
            rewritten_query=prompt,
            confidence=state.get("intent_confidence", 0.0),
            patient_state_summary="",
            requires_diagnosis_filter=intent in ("diagnosis", "differential"),
            requires_temporal_ordering=intent in ("change_tracking", "timeline", "trend_analysis"),
            requires_graph_expansion=intent in ("differential", "rationale"),
        )
        
        max_docs = retriever_config.agent_max_docs
        retrieved_docs = retriever.retrieve(query_context, max_docs=max_docs)

        # Group fallback results by node_id
        encounter_map: Dict[str, list] = {}
        for doc in retrieved_docs:
            node_id = getattr(doc, "node_id", None) or getattr(doc, "doc_id", "")
            if node_id not in encounter_map:
                encounter_map[node_id] = []
            encounter_map[node_id].append(doc)

        encounter_groups = []
        for enc_id, docs in encounter_map.items():
            best_score = max(getattr(d, "score", 0.5) for d in docs)
            if best_score >= threshold:
                encounter_groups.append(EncounterGroup(
                    encounter_id=enc_id,
                    score=best_score,
                    chunks=[],  # Fallback path doesn't have RetrievedContext
                    father_id=getattr(docs[0], "father_id", None),
                    date_issued=getattr(docs[0], "date_issued", None),
                ))
        
        encounter_groups.sort(key=lambda x: x.score, reverse=True)

        return {
            "encounter_groups": encounter_groups,
            "retrieval_confidence": retrieval_confidence,
            "retrieval_avg_top3": retrieval_avg_top3,
            "has_insufficient_data": has_insufficient_data,
            "retrieval_grade": _grade_retrieval(retrieval_avg_top3),
        }

    return {
        "encounter_groups": [],
        "retrieval_confidence": 0.0,
        "retrieval_avg_top3": 0.0,
        "has_insufficient_data": True,
        "retrieval_grade": _grade_retrieval(0.0),
    }


def reformulate_query(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    The model-controlled branch of the graded retrieval evaluator ("Agentic
    RAG" in the narrow, defensible sense): reached only when
    retriever_config.graded_retrieval_evaluator_enabled is on and
    retrieval_grade == "ambiguous". Asks the LLM to produce an actual
    reformulated search query given the original question and the weak
    matches found, rather than just relaxing a score threshold (which is
    what the plain retry_retrieval path still does when this flag is off).

    Bounded by the same retrieval_iterations / max_retrieval_retries
    counter the threshold-retry path uses — no separate, additional budget.
    """
    iterations = state.get("retrieval_iterations", 0) + 1
    original_query = state["messages"][-1].content
    encounter_groups = state.get("encounter_groups", [])

    weak_evidence_summary = "; ".join(
        f"{eg.encounter_id} (score={eg.score:.2f})" for eg in encounter_groups[:3]
    ) or "no matching encounters found"

    system_prompt = (
        "You are a clinical search query reformulator. The following patient-"
        "record search returned only low-confidence matches. Rewrite the "
        "query to be more likely to match relevant clinical documentation — "
        "broaden or rephrase medical terminology, but do not change what is "
        "being asked.\nRespond with ONLY the reformulated query text."
    )
    user_prompt = f"Original query: {original_query}\nWeak matches found: {weak_evidence_summary}"

    reformulated = original_query
    try:
        llm_client = get_llm_client()
        response = llm_client.chat.completions.create(
            model=LLAMA_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=120,
        )
        candidate = (response.choices[0].message.content or "").strip()
        if candidate:
            reformulated = candidate
    except Exception as e:
        logger.warning(f"Query reformulation failed, retrying with the original query: {e}")

    logger.info(f"Agentic retrieval reformulation (attempt {iterations}): {original_query!r} -> {reformulated!r}")

    messages = list(state.get("messages", []))
    if messages:
        messages[-1] = HumanMessage(content=reformulated)

    return {
        "messages": messages,
        "retrieval_iterations": iterations,
    }


def handle_insufficient_evidence(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    The deterministic branch of the graded retrieval evaluator ("Corrective
    RAG" in the sense of a genuine corrective action per grade, not just
    "try harder"): reached when retrieval_grade == "insufficient" — the
    query plainly doesn't match this patient's record, and another
    same-patient retrieval attempt is unlikely to help.

    This decision itself is deterministic. If the query's intent could be
    answered from general medical knowledge instead of this patient's
    record, route onward to mcp_search with general_knowledge_fallback set,
    so the eventual answer is labeled as general guidance rather than
    blended with patient-specific claims. Otherwise, route to the existing
    abstain node — reusing the one abstention message format already
    built, not inventing a second one.
    """
    intent = state.get("intent", "unknown")
    general_knowledge_intents = {"diagnosis", "differential", "medication", "rationale", "allergy"}

    if intent in general_knowledge_intents:
        logger.info(
            f"Retrieval insufficient for intent={intent} — falling back to "
            "general medical knowledge via MCP (no matching patient record found)"
        )
        return {"general_knowledge_fallback": True, "is_mcp_query": True}

    logger.info(f"Retrieval insufficient for intent={intent} — no general-knowledge fallback applies, abstaining")
    return {"abstain_reason": "no_matching_patient_data"}


def run_deterministic_reasoning(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Runs the ClinicalReasoner on the retrieved encounter groups.
    """
    from src.retrieval.indexing import ClinicalDocument
    
    encounter_groups = state.get("encounter_groups", [])
    intent = state["intent"]
    prompt = state["messages"][-1].content
    patient_state_data = state["patient_state"]

    patient_state_obj = patient_state_data
    if isinstance(patient_state_data, dict):
        try:
            patient_state_obj = PatientState(**patient_state_data)
        except Exception:
            patient_state_obj = patient_state_data
    
    # Flatten encounter groups into ClinicalDocuments for the reasoner
    retrieved_docs = []
    for eg in encounter_groups:
        for chunk in eg.chunks:
            # Convert RetrievedContext-like chunk to ClinicalDocument
            doc_data = {
                "doc_id": chunk.anchor_id,
                "node_id": chunk.anchor_id,
                "eoc_id": state.get("patient_id", ""),
                "content": chunk.anchor_content,
                "content_primary": chunk.anchor_content,
                "content_details": "",
                "date_issued": chunk.date_issued or "",
                "date_unix": 0,
                "category": "",
                "event_tag": "",
                "is_diagnosis": False,
                "normality": "Normal",
                "priority": "Medium",
                "father_id": chunk.father_id,
            }
            try:
                retrieved_docs.append(ClinicalDocument(**doc_data))
            except Exception:
                pass
    
    query_context = QueryContext(
        original_query=prompt,
        intent=QueryIntent(intent),
        rewritten_query=prompt,
        confidence=state.get("intent_confidence", 0.0),
        patient_state_summary="",
        requires_diagnosis_filter=intent in ("diagnosis", "differential"),
        requires_temporal_ordering=intent in ("change_tracking", "timeline", "trend_analysis"),
        requires_graph_expansion=intent in ("differential", "rationale"),
    )
    
    retrieval_context = RetrievalContext(
        query_context=query_context,
        retrieved_documents=retrieved_docs,
        patient_state=patient_state_obj
    )
    
    reasoner = ClinicalReasoner(retrieval_context)
    response = reasoner.reason()
    
    return {"clinical_response": response.dict()}

def _extract_drugs_from_state(state: Dict) -> List[str]:
    """
    Extract medication names from RAG encounter groups and conversation history.
    Used to enrich MCP drug safety queries with the patient's actual drug list.
    """
    import re
    drugs: set = set()

    # Match "DrugName Xmg" patterns (captures the word before a numeric dose)
    dose_re = re.compile(r'\b([A-Za-z][a-z]{3,})\s+\d+(?:\.\d+)?\s*(?:mg|mcg|IU)\b', re.IGNORECASE)
    # Match common drug-class suffixes (ACE inhibitors, beta-blockers, ARBs, diuretics …)
    suffix_re = re.compile(
        r'\b([A-Z][a-z]+(?:pril|lol|sartan|mide|statin|mycin|cillin|azole|dipine|lukast|gliptin|floxacin))\b'
    )
    _STOP = {
        "Patient", "Doctor", "Clinical", "Initial", "Normal", "General",
        "Active", "Final", "Standard", "Primary", "Chronic", "Acute",
    }

    def scan(text: str) -> None:
        for m in dose_re.finditer(text):
            name = m.group(1).capitalize()
            if name not in _STOP and len(name) > 4:
                drugs.add(name)
        for m in suffix_re.finditer(text):
            name = m.group(1)
            if name not in _STOP and len(name) > 4:
                drugs.add(name)

    # 1. Scan RAG encounter groups (highest-quality source — directly from patient record)
    for eg in state.get("encounter_groups", []):
        chunks = eg.chunks if hasattr(eg, "chunks") else eg.get("chunks", [])
        for chunk in chunks:
            content = (
                chunk.anchor_content
                if hasattr(chunk, "anchor_content")
                else chunk.get("anchor_content", "")
            )
            scan(content)

    # 2. Scan conversation history (previous assistant responses may name the drugs)
    for msg in state.get("messages", [])[:-1]:
        if hasattr(msg, "content") and isinstance(msg.content, str):
            scan(msg.content)

    return sorted(drugs)


MAX_REACT_ITERATIONS = retriever_config.mcp_react_max_iterations


def _mcp_react_decide(query: str, steps: List[MCPReActStep]) -> MCPReActStep:
    """
    One reasoning step of the bounded MCP ReAct loop: ask the LLM what to
    do next given the original question and prior steps' observations.

    Uses prompted JSON (the same convention already used by
    mcps/router.py's classification_node — "respond in strict JSON
    format"), not grammar-constrained decoding; this codebase has none of
    that anywhere, and this doesn't introduce it.
    """
    history_text = "\n".join(
        f"Step {s.step_index}: thought={s.thought!r} action={s.action} "
        f"input={s.action_input} observation={s.observation_summary}"
        for s in steps
    ) or "(no steps yet)"

    system_prompt = (
        "You are a clinical evidence-gathering assistant deciding the next "
        "action in a bounded loop. You may call get_medical_data to look up "
        "external medical literature, guidelines, or drug interactions, or "
        "choose finish once you have enough evidence to answer the question.\n"
        "Respond in strict JSON only, no other text:\n"
        '{"thought": "why you are taking this action", '
        '"action": "get_medical_data" or "finish", '
        '"action_input": {"query": "the lookup to run, if action is get_medical_data"}}'
    )
    user_prompt = f"Original question: {query}\n\nSteps so far:\n{history_text}"

    try:
        llm_client = get_llm_client()
        response = llm_client.chat.completions.create(
            model=LLAMA_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=300,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = raw.strip("`")
        if raw[:4].lower() == "json":
            raw = raw[4:].strip()
        parsed = json.loads(raw)
        action = parsed.get("action")
        if action not in ("get_medical_data", "finish"):
            raise ValueError(f"model returned an action outside the allowlist: {action!r}")
        return MCPReActStep(
            step_index=len(steps),
            thought=str(parsed.get("thought", "")),
            action=action,
            action_input=parsed.get("action_input") or {},
        )
    except Exception as e:
        # Fail toward stopping, not toward looping further on a malformed
        # response — the deterministic cap below is a backstop, not the
        # only line of defense.
        logger.warning(f"MCP ReAct decision step failed ({e}) — finishing loop early")
        return MCPReActStep(step_index=len(steps), thought="decision step failed, stopping", action="finish")


def _run_mcp_react_loop(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Bounded ReAct loop over MedMCP's get_medical_data tool: observe -> the
    model decides an action -> act -> observe -> ... -> finish.

    Hard-capped at MAX_REACT_ITERATIONS regardless of what the model
    requests — the deterministic control plane owns the bound, not the
    model. Every actual tool call still goes through _call_mcp_endpoint,
    so the existing MCP-protocol client, retry+backoff, and (server-side)
    circuit breakers all still apply per call; this loop only decides
    whether and how many times to call it.
    """
    original_query = state["messages"][-1].content
    steps: List[MCPReActStep] = []
    internet_evidence: List[Dict[str, Any]] = []

    for _ in range(MAX_REACT_ITERATIONS):
        step = _mcp_react_decide(original_query, steps)

        if step.action == "finish":
            steps.append(step)
            break

        lookup_query = step.action_input.get("query") or original_query
        result = _call_mcp_endpoint(original_query, lookup_query)
        evidence_items = result.get("internet_evidence", [])
        internet_evidence.extend(evidence_items)

        observation = evidence_items[0] if evidence_items else {}
        step.observation_summary = (
            f"classification={observation.get('classification', 'N/A')}, "
            f"{len(observation.get('raw_data', []))} raw_data item(s)"
            if evidence_items else "no evidence returned"
        )
        steps.append(step)
    else:
        logger.info(f"MCP ReAct loop hit MAX_REACT_ITERATIONS={MAX_REACT_ITERATIONS} without the model finishing")

    logger.info(f"MCP ReAct loop completed in {len(steps)} step(s)")
    return {
        "internet_evidence": internet_evidence,
        "mcp_react_steps": [s.model_dump() for s in steps],
    }


def query_mcp(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Queries the MCP server for external evidence (DrugBank, PubMed, etc.)

    Flow:
    1. Classify the question type (drug safety vs guidelines vs general)
    2. For drug-specific queries, use deterministic query construction
    3. For general queries, use LLM-based query optimization
    4. Call MCP with the optimized query

    When retriever_config.mcp_react_loop_enabled is set, this becomes a
    bounded ReAct loop (_run_mcp_react_loop) instead of the single-call
    flow below — off by default; with it off, behavior is unchanged.
    """
    if retriever_config.mcp_react_loop_enabled:
        return _run_mcp_react_loop(state)

    messages = state["messages"]
    raw_query = messages[-1].content
    patient_state_data = state.get("patient_state")

    # STEP 0: Extract actual drug names from RAG results + conversation history.
    # This runs before question-type handling so every path can use real drug names.
    rag_drugs = _extract_drugs_from_state(state)
    if rag_drugs:
        logger.info(f"Drugs extracted from patient context: {rag_drugs}")

    # STEP 1: Classify question type for safety-aware query handling
    question_type = classify_mcp_question_type(raw_query)
    # If the raw query doesn't contain a drug name but we found drugs from context,
    # treat it as a drug_side_effects query so we use the correct safety policy.
    if question_type == "general" and rag_drugs:
        question_type = "drug_side_effects"
        logger.info(f"Upgraded question_type to drug_side_effects (drugs from context: {rag_drugs})")
    logger.info(f"MCP Query Type Classification: {question_type}")

    # STEP 2: For drug safety queries, build a targeted query enriched with the
    # patient's actual medications (from RAG / conversation history).
    if question_type in ["drug_contraindications", "drug_interactions", "drug_side_effects"]:
        if rag_drugs:
            drug_str = " ".join(rag_drugs[:4])  # Top 4 to keep query focused
            if question_type == "drug_side_effects":
                optimized_query = (
                    f"{drug_str} adverse effects renal impairment nephrotoxicity "
                    f"ACE inhibitor hyperkalemia CKD heart failure"
                )
            elif question_type == "drug_contraindications":
                optimized_query = f"{drug_str} contraindications renal impairment CKD heart failure"
            else:
                optimized_query = f"{drug_str} drug interactions pharmacokinetics"
            logger.info(f"Context-enriched MCP query ({question_type}): {optimized_query}")
        else:
            optimized_query = _construct_drug_safety_query(raw_query, question_type)
            logger.info(f"Deterministic query ({question_type}): {optimized_query}")
        return _call_mcp_endpoint(raw_query, optimized_query)
        
    # For Guidelines, pass raw query to MCP (it has a better optimizer)
    if question_type == "treatment_guidelines":
        logger.info(f"Passing raw query to MCP optimizer: {raw_query}")
        return _call_mcp_endpoint(raw_query, raw_query)
    
    # STEP 3: For other queries, use LLM-based optimization (existing logic)
    # Build the full conversation for context-aware query rewriting
    conversation_messages = []
    
    # Extract clinical entities from recent conversation for explicit context
    clinical_entities = []
    if patient_state_data and isinstance(patient_state_data, dict):
        if patient_state_data.get('active_diagnosis'):
            clinical_entities.extend(patient_state_data['active_diagnosis'])
        if patient_state_data.get('differential_diagnoses'):
            clinical_entities.extend(patient_state_data['differential_diagnoses'])
    
    # Also extract from recent assistant messages (last 2 responses)
    import re
    for msg in reversed(messages[:-1]):
        if hasattr(msg, 'content') and len(clinical_entities) < 5:
            # Extract potential diagnoses/conditions from assistant responses
            # Look for capitalized medical terms
            content = msg.content
            # Common patterns: "diagnosed with X", "has X", "treatment for X"
            patterns = [
                r'(?:diagnosed with|diagnosis of|has|treatment for|patient has)\s+([A-Z][A-Za-z\s]+(?:Pneumonia|Diabetes|Hypertension|Failure|Disease|Syndrome|Injury|Fracture))',
                r'([A-Z][A-Za-z]+\s+(?:Pneumonia|Diabetes|Hypertension|Failure|Disease|Syndrome))'
            ]
            for pattern in patterns:
                matches = re.findall(pattern, content)
                clinical_entities.extend(matches[:2])  # Take first 2 from each pattern
                if len(clinical_entities) >= 5:
                    break
    
    # System prompt for query optimization
    system_prompt = """You are a medical query optimizer. Rewrite vague queries for PubMed search.

CRITICAL: Your response MUST end with a line starting with "SEARCH:" followed by the optimized query.

FORMAT:
[Your reasoning here]
SEARCH: [optimized medical query for PubMed]

Example 1:
User asks: "what are the guidelines for this?"
Context: Patient has Type 2 Diabetes
Your response:
The user is asking for guidelines. The patient has Type 2 Diabetes.
SEARCH: type 2 diabetes mellitus treatment guidelines

Example 2:
User asks: "what medications are recommended?"
Context: Clinical context: Mycoplasma Pneumonia
Your response:
The patient has Mycoplasma Pneumonia based on context.
SEARCH: Mycoplasma pneumoniae treatment antibiotic guidelines"""

    conversation_messages.append({"role": "system", "content": system_prompt})
    
    # Add patient context as first message if available
    context_parts = []
    if patient_state_data and isinstance(patient_state_data, dict):
        patient_info_parts = []
        if patient_state_data.get('active_diagnosis'):
            patient_info_parts.append(f"Diagnoses: {', '.join(patient_state_data['active_diagnosis'])}")
        if patient_state_data.get('recent_medications'):
            patient_info_parts.append(f"Medications: {', '.join(patient_state_data['recent_medications'])}")
        if patient_state_data.get('allergies'):
            patient_info_parts.append(f"Allergies: {', '.join(patient_state_data['allergies'])}")
        if patient_state_data.get('current_symptoms'):
            patient_info_parts.append(f"Symptoms: {', '.join(patient_state_data['current_symptoms'])}")
        
        if patient_info_parts:
            context_parts.append("Current patient: " + "; ".join(patient_info_parts))
    
    # Add extracted clinical entities explicitly
    if clinical_entities:
        unique_entities = list(set(clinical_entities))[:3]  # Max 3 unique entities
        context_parts.append(f"Clinical context from conversation: {', '.join(unique_entities)}")
    
    if context_parts:
        patient_summary = "\n".join(context_parts)
        conversation_messages.append({"role": "user", "content": patient_summary})
        conversation_messages.append({"role": "assistant", "content": "I have noted the patient information and clinical context."})
    
    # Add full chat history - safely with alternation
    history_msgs = []
    for msg in messages[:-1]:  # All messages except the last one
        role = "user" if getattr(msg, 'type', '') == 'human' else "assistant"
        content = getattr(msg, 'content', '')
        history_msgs.append({"role": role, "content": content})
    
    # Ensure history (if any) starts with User (since previous state ends in System or Ass)
    while history_msgs and history_msgs[0]["role"] == "assistant":
        history_msgs.pop(0)

    # Merge history into conversation_messages
    for msg in history_msgs:
        last_msg = conversation_messages[-1]
        if msg["role"] == last_msg["role"]:
            last_msg["content"] += f"\n\n{msg['content']}"
        else:
            conversation_messages.append(msg)
    
    # Add the final query with clear instruction
    final_prompt = f"""The user now asks: "{raw_query}"

Based on our conversation, rewrite this as an optimized PubMed search query.
Think about what medical condition or topic they're referring to, then provide the search query."""
    
    # Ensure final prompt is appended as User
    if conversation_messages[-1]["role"] == "user":
        conversation_messages[-1]["content"] += f"\n\n{final_prompt}"
    else:
        conversation_messages.append({"role": "user", "content": final_prompt})
    
    # Step 1: Use LLM to optimize the query
    optimized_query = raw_query  # Default fallback
    
    try:
        llm_client = get_llm_client()
        
        logger.info(f"Optimizing query for MCP: {raw_query[:50]}...")
        logger.info(f"Conversation context: {len(conversation_messages)} messages")
        
        response = llm_client.chat.completions.create(
            model=LLAMA_MODEL_NAME,
            messages=conversation_messages,
            temperature=0.1,
            max_tokens=200  # Allow for thinking + query
        )
        
        llm_output = response.choices[0].message.content.strip()
        logger.info(f"LLM query optimization output (first 200 chars): {llm_output[:200]}...")
        
        # Extract the search query with multiple strategies
        import re
        
        # Strategy 1: Look for "SEARCH:" prefix (most explicit)
        if 'SEARCH:' in llm_output.upper():
            for line in llm_output.split('\n'):
                if 'SEARCH:' in line.upper():
                    optimized_query = line.split(':', 1)[1].strip().strip('`"\'[]')
                    logger.info(f"Extracted via SEARCH: prefix")
                    break
        
        # Strategy 2: Extract clinical entities mentioned in the output
        elif clinical_entities:
            # The LLM mentioned the clinical condition - extract it with intent keywords
            main_condition = clinical_entities[0]  # Primary condition from context
            intent_keywords = []
            for keyword in ['treatment', 'guideline', 'management', 'therapy', 'protocol']:
                if keyword in raw_query.lower() or keyword in llm_output.lower():
                    intent_keywords.append(keyword)
            
            if intent_keywords:
                optimized_query = f"{main_condition} {' '.join(intent_keywords[:2])}"
                logger.info(f"Extracted via entity + intent combination")
            else:
                optimized_query = f"{main_condition} treatment guidelines"
                logger.info(f"Extracted via entity with default intent")
        
        # Strategy 3: Find lines containing both a medical condition and an action word
        else:
            medical_terms = ['pneumonia', 'diabetes', 'hypertension', 'disease', 'syndrome', 
                           'injury', 'fracture', 'failure', 'infection']
            action_words = ['treatment', 'guideline', 'management', 'therapy', 'diagnosis']
            
            lines = llm_output.strip().split('\n')
            for line in reversed(lines):
                line_lower = line.lower()
                has_medical = any(term in line_lower for term in medical_terms)
                has_action = any(word in line_lower for word in action_words)
                
                if has_medical and has_action and len(line) < 150:  # Not too long (avoid reasoning)
                    # Clean up
                    optimized_query = re.sub(r'^\d+\.\s*\**', '', line).strip('*-`"\'[].:')
                    logger.info(f"Extracted via medical+action pattern")
                    break
        
        # Final cleanup
        optimized_query = optimized_query.replace('**', '').replace('  ', ' ').strip()
        
        # Sanity check: If query is still too long or looks like reasoning, use entity-based fallback
        if len(optimized_query) > 100 or optimized_query.startswith('thought') or optimized_query.startswith('The '):
            if clinical_entities:
                optimized_query = f"{clinical_entities[0]} {raw_query.split()[-2] if len(raw_query.split()) > 1 else 'treatment'} guidelines"
                logger.info(f"Applied fallback: entity-based query")
            else:
                optimized_query = raw_query  # Last resort
                logger.info(f"Fallback to raw query")
        
        logger.info(f"Final optimized query: {optimized_query}")
        
    except Exception as e:
        logger.warning(f"Query optimization failed, using raw query: {e}")
        optimized_query = raw_query
    
    # Step 2: Call MCP with the optimized query (using shared helper)
    return _call_mcp_endpoint(raw_query, optimized_query)


def check_safety(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Evidence Filter / Safety Check.
    If drug interactions or guidelines are fetched, verify them here.
    """
    # For now, a pass-through or basic logic
    return {}

def inject_audit_feedback(state: ClinicalAgentState) -> str:
    """Build a corrective prompt fragment from audit failures."""
    failures = state.get("audit_failures", [])
    if not failures:
        return ""
    lines = ["\n\n**CORRECTION REQUIRED — Citation Audit Failed:**"]
    for f in failures:
        lines.append(f"- {f.get('message', 'unknown error')}")
    lines.append("Fix all citations so every source_node_id references a valid document.")
    return "\n".join(lines)


def generate_response(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Polymorphic Generation Node.
    Handles response generation for all modes: 
    1. Local RAG (Patient Data)
    2. MCP (External Evidence)
    3. Chat (General Conversation)
    """
    mode = state.get("mode", "auto")
    query = state["messages"][-1].content
    
    final_output = ""
    citations_text = ""
    
    # =========================================================================
    # MODE 1: CHAT (MedGemma Only)
    # =========================================================================
    if mode == "chat":
        system_prompt = (
            "You are MedGemma, a helpful medical AI assistant. "
            "Engage in general medical conversation. "
            "WARNING: You do NOT have access to the patient's record in this mode. "
            "If asked about specific patient data (labs, dates, meds), politely refuse "
            "and state you are in 'Chat Only' mode."
        )
        
        try:
            llm_client = get_llm_client()
            logger.info("Calling LLM for Chat Mode...")
            
            # Construct context-aware messages
            messages_payload = [{"role": "system", "content": system_prompt}]
            
            # Get recent history
            history = state["messages"][-6:] # Increase window slightly to capture context
            
            # Filter and normalize
            temp_messages = []
            for msg in history:
                 role = "user" if msg.type == "human" else "assistant"
                 content_str = str(msg.content)
                 temp_messages.append({"role": role, "content": content_str})
            
            # Ensure valid sequence for Llama.cpp (System -> User -> Assistant -> User...)
            # 1. Skip leading 'assistant' messages if any, immediately after system
            while temp_messages and temp_messages[0]["role"] == "assistant":
                temp_messages.pop(0)
                
            # 2. Merge consecutive messages of same role
            if temp_messages:
                messages_payload.append(temp_messages[0])
                for valid_msg in temp_messages[1:]:
                    last_msg = messages_payload[-1]
                    if valid_msg["role"] == last_msg["role"]:
                        # Concatenate content
                        last_msg["content"] += f"\n\n{valid_msg['content']}"
                    else:
                        messages_payload.append(valid_msg)
            
            response = llm_client.chat.completions.create(
                model=LLAMA_MODEL_NAME,
                messages=messages_payload,
                temperature=0.7,
                max_tokens=5000
            )
            final_output = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Chat generation failed: {e}")
            final_output = f"I apologize, but I'm having trouble connecting to the chat model. Error: {str(e)}"

    # =========================================================================
    # MODE 2: HYBRID — RAG patient context + MCP drug-safety evidence
    # Detected when needs_drug_check=True and both sources are present.
    # Must come before the plain RAG check (clinical_response alone) so the
    # elif chain doesn't swallow MCP evidence silently.
    # =========================================================================
    elif (
        mode == "auto"
        and state.get("needs_drug_check", False)
        and state.get("clinical_response")
        and state.get("internet_evidence")
    ):
        encounter_groups = state.get("encounter_groups", [])
        mcp_evidence = state.get("internet_evidence", [])
        audit_retry_count = state.get("audit_retry_count", 0)

        # --- RAG context: extract clinical notes from TOON content ---
        # TOON records embed clinical narrative in note[N] lines. Surfacing only
        # those lines keeps the prompt tight and ensures the LLM reads the key
        # facts (drug changes, lab values, diagnoses) without wading through
        # FHIR metadata headers.
        def _extract_notes(toon: str) -> str:
            out, in_note = [], False
            for line in toon.split("\n"):
                stripped = line.strip()
                if stripped.startswith("note["):
                    in_note = True
                if in_note:
                    if stripped.startswith("-") or stripped.startswith("note[") or stripped == "":
                        out.append(line)
                    else:
                        in_note = False
            return "\n".join(out).strip()

        rag_parts = []
        for eg in encounter_groups:
            for chunk in eg.chunks:
                notes = _extract_notes(chunk.anchor_content)
                if notes:
                    rag_parts.append(notes)
                else:
                    rag_parts.append(chunk.anchor_content[:300])
        rag_context = "\n\n---\n\n".join(rag_parts) if rag_parts else "No patient records retrieved."

        # --- MCP evidence: PubMed / OpenFDA drug-safety literature ---
        evidence_parts = []
        if mcp_evidence:
            ev_block = mcp_evidence[0]
            for item in ev_block.get("raw_data", []):
                if not isinstance(item, dict):
                    continue
                content = item.get("content", "") or item.get("summary", "")
                pmid = item.get("pmid", "")
                source = item.get("source", item.get("url", ""))
                ref = f"[PMID {pmid}]" if pmid else (f"[{source}]" if source else "")
                if content:
                    evidence_parts.append(f"{ref} {content}")
        evidence_str = "\n\n".join(evidence_parts) if evidence_parts else "No external evidence retrieved."

        system_prompt = (
            "You are a Clinical Pharmacology Assistant. Review the patient's medications for adverse effects.\n\n"
            "RULES:\n"
            "- Output ONLY the formatted drug review. No preamble, no thinking steps.\n"
            "- Include BOTH current medications AND any drug discontinued due to documented adverse effects.\n"
            "- For each drug: list risks, mechanism, and how this patient's specific comorbidities "
            "(CKD, heart failure, electrolyte abnormalities found in the Patient Notes) amplify those risks.\n"
            "- Cite literature evidence with [PMID ...] or [source] tags when available.\n"
            "- Be concise and clinical. Use bullet points."
        )
        user_prompt = (
            f"Query: {query}\n\n"
            "## Patient Clinical Notes (from medical record):\n"
            f"{rag_context}\n\n"
            "## Medical Literature Evidence (PubMed / OpenFDA):\n"
            f"{evidence_str}\n\n"
            "## Drug-by-Drug Safety Assessment:\n"
        )

        generation_confidence = 0.0
        try:
            llm_client = get_llm_client()
            response = llm_client.chat.completions.create(
                model=LLAMA_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=2000,
                logprobs=True,
            )
            final_output = response.choices[0].message.content
            logprobs_data = response.choices[0].logprobs
            token_logprobs = []
            if logprobs_data and hasattr(logprobs_data, "content"):
                for item in logprobs_data.content:
                    if item.logprob is not None:
                        token_logprobs.append(item.logprob)
            generation_confidence = compute_generation_confidence(
                token_logprobs=token_logprobs if token_logprobs else None
            )
        except Exception as e:
            logger.error(f"Hybrid drug-safety generation failed: {e}")
            final_output = f"Error generating drug safety review: {e}"

    # =========================================================================
    # MODE 3: LOCAL RAG (Patient Data)
    # =========================================================================
    elif mode == "local" or (mode == "auto" and state.get("clinical_response")):
        clinical_resp = state.get("clinical_response")
        encounter_groups = state.get("encounter_groups", [])

        # Audit retry: increment counter and inject corrective feedback
        audit_retry_count = state.get("audit_retry_count", 0)
        audit_feedback = inject_audit_feedback(state)
        if audit_feedback:
            audit_retry_count += 1
            logger.info(f"Audit retry #{audit_retry_count}: injecting citation correction feedback")

        if clinical_resp:
            explanation = clinical_resp.get('explanation', '')

            # Build encounter-aware context
            context_parts = []
            for eg in encounter_groups:
                context_parts.append(f"\n--- Encounter {eg.encounter_id} (relevance: {eg.score:.3f}) ---")
                for chunk in eg.chunks:
                    context_parts.append(chunk.anchor_content)
            
            encounter_context = "\n".join(context_parts) if context_parts else ""

            system_prompt = (
                "You are an advanced Clinical AI Assistant. "
                "Synthesize the provided Clinical Reasoning into a professional, concise response. "
                "Do NOT add new facts. Stick strictly to the reasoning provided. "
                "Maintain a neutral, objective tone."
            )
            
            user_prompt = f"Query: {query}\n\nClinical Reasoning:\n{explanation}"
            if encounter_context:
                user_prompt += f"\n\nEncounter Context:\n{encounter_context}"
            if audit_feedback:
                user_prompt += audit_feedback
            
            generation_confidence = 0.0
            try:
                llm_client = get_llm_client()
                response = llm_client.chat.completions.create(
                    model=LLAMA_MODEL_NAME,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1,
                    max_tokens=1024,
                    logprobs=True,
                )
                final_output = response.choices[0].message.content

                # Extract token logprobs for generation confidence
                logprobs_data = response.choices[0].logprobs
                token_logprobs = []
                if logprobs_data and hasattr(logprobs_data, "content"):
                    for item in logprobs_data.content:
                        if item.logprob is not None:
                            token_logprobs.append(item.logprob)
                generation_confidence = compute_generation_confidence(
                    token_logprobs=token_logprobs if token_logprobs else None,
                )
            except Exception as e:
                logger.error(f"Local RAG Synthesis failed: {e}")
                final_output = explanation
        else:
             final_output = "I checked the patient record but found no relevant information regarding your query."

    # =========================================================================
    # MODE 3: MCP (External Evidence)
    # =========================================================================
    elif mode == "mcp" or (mode == "auto" and state.get("internet_evidence")):
        mcp_evidence = state.get("internet_evidence")
        
        if mcp_evidence:
            # Evidence processing logic
            evidence_data = mcp_evidence[0]
            raw_data = evidence_data.get("raw_data", [])
            original_query = evidence_data.get("original_query", query)
            
            # Classify for Safety Policy
            question_type = classify_mcp_question_type(original_query)
            policy = MCP_QUESTION_TYPES.get(question_type, MCP_QUESTION_TYPES["general"])
            
            # Build Evidence String from raw_data returned by MCP
            evidence_parts = []
            for _item in raw_data:
                if not isinstance(_item, dict):
                    continue
                _content = _item.get("content", "") or _item.get("summary", "")
                _pmid = _item.get("pmid", "")
                _source = _item.get("source", _item.get("url", ""))
                _ref = f"[PMID {_pmid}]" if _pmid else (f"[{_source}]" if _source else "")
                if _content:
                    evidence_parts.append(f"{_ref} {_content}".strip())

            evidence_str = "\n\n---\n\n".join(evidence_parts)
            
            # Apply Policy Prompts
            system_prompt = policy["system_prompt"]
            if policy["forbidden_output"]:
                system_prompt += f"\n\nCRITICAL: DO NOT include: {', '.join(policy['forbidden_output'])}."

            if state.get("general_knowledge_fallback"):
                # Reached via handle_insufficient_evidence: no matching data
                # was found in this patient's own record, so this is general
                # literature guidance, not a patient-specific claim — the
                # response must say so plainly rather than reading as if it
                # were grounded in this patient's chart.
                system_prompt += (
                    "\n\nCRITICAL: No matching data was found in this patient's own "
                    "record for this question. Begin your response by stating that "
                    "explicitly, then provide general medical guidance from the "
                    "literature below — do not imply it is specific to this patient."
                )

            user_prompt = (
                f"**Clinical Query:** {original_query}\n\n"
                f"**Literature Evidence:**\n{evidence_str}\n\n"
                "Provide the response:"
            )
            
            generation_confidence = 0.0
            try:
                llm_client = get_llm_client()
                response = llm_client.chat.completions.create(
                    model=LLAMA_MODEL_NAME,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1,
                    max_tokens=policy["max_tokens"],
                    logprobs=True,
                )
                final_output = response.choices[0].message.content

                # Extract token logprobs
                logprobs_data = response.choices[0].logprobs
                token_logprobs = []
                if logprobs_data and hasattr(logprobs_data, "content"):
                    for item in logprobs_data.content:
                        if item.logprob is not None:
                            token_logprobs.append(item.logprob)
                generation_confidence = compute_generation_confidence(
                    token_logprobs=token_logprobs if token_logprobs else None,
                )
                
            except Exception as e:
                final_output = f"Error interpreting external evidence: {e}"
        else:
            final_output = "I attempted to search external sources but the service returned no data."

    # =========================================================================
    # MODE 4: VISUALIZATION (Clinical Chart)
    # =========================================================================
    elif state.get("viz_result"):
        viz = state["viz_result"]
        caption = viz.get("caption") or viz.get("summary", "")
        final_output = caption if caption else "Chart generated."

    # =========================================================================
    # Fallback / Error
    # =========================================================================
    else:
        final_output = "System Error: Invalid mode or missing data context."
        
    # Ensure generation_confidence is defined (safe default for chat mode)
    if 'generation_confidence' not in dir():
        generation_confidence = 0.0

    return {
        "messages": [AIMessage(content=final_output)],
        "audit_retry_count": audit_retry_count if 'audit_retry_count' in dir() else state.get("audit_retry_count", 0),
        "generation_confidence": generation_confidence,
    }


# ============================================================================
# Visualization Node
# ============================================================================
def generate_visualization(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Agentic visualization node — produces 3 charts from Qdrant data.

    Chart 1 — Renal Function (dual_line): creatinine + eGFR trend
    Chart 2 — Cardiac Markers (line):     BNP trend
    Chart 3 — Clinical Timeline (gantt):  encounter phases over time

    Each chart is rendered by the MCP viz endpoint and stored in
    viz_result["charts"] as a list of {image_base64, summary, chart_type, title}.
    """
    import asyncio

    query = state["messages"][-1].content
    patient_id = state.get("patient_id")
    documents = state.get("documents")
    patient_state_data = state.get("patient_state")

    mcp_server_url = os.getenv("MCP_SERVER_URL", "http://localhost:8002")

    # ── Step 1: Extract all data from Qdrant ──────────────────────────────────
    data = _extract_patient_data_for_viz(
        patient_id=patient_id,
        documents=documents,
        patient_state=patient_state_data,
        query=query,
    )
    observations = data["observations"]
    encounters   = data["encounters"]

    if not observations and not encounters:
        logger.warning("No patient data available for visualization")
        return {
            "viz_result": {
                "charts": [],
                "caption": "No patient data found in Qdrant to generate charts.",
                "image_base64": None,
            }
        }

    # ── Step 2: Split observations into per-chart datasets ───────────────────
    renal_data = [
        obs for obs in observations
        if "creatinine" in obs["measurements"] or "egfr" in obs["measurements"]
    ]
    cardiac_data = [
        obs for obs in observations
        if "bnp" in obs["measurements"] or "lvef" in obs["measurements"]
    ]
    # Gantt uses encounters; fall back to all observations if no encounters
    timeline_data = encounters if encounters else [
        {**obs, "phase": "Observations", "clinical_status": "Active"}
        for obs in observations
    ]

    chart_configs = [
        (renal_data,    "renal function trend creatinine egfr",  "Renal Function"),
        (cardiac_data,  "cardiac markers BNP LVEF trend",         "Cardiac Markers"),
        (timeline_data, "clinical encounter timeline phases",      "Clinical Timeline"),
    ]

    # ── Step 3: Render each chart via MCP (real protocol by default; set
    #    MCP_TRANSPORT=rest to roll back to the direct HTTP call) ────────────
    async def _render_all():
        charts = []
        use_rest = os.getenv("MCP_TRANSPORT", "mcp") == "rest"
        rest_client = httpx.AsyncClient(timeout=60.0) if use_rest else None
        try:
            for patient_data, sub_query, title in chart_configs:
                if not patient_data:
                    charts.append({
                        "image_base64": None,
                        "summary": f"No data available for {title}.",
                        "chart_type": "empty",
                        "title": title,
                    })
                    continue
                try:
                    if use_rest:
                        result = await _render_chart_rest(rest_client, mcp_server_url, patient_data, sub_query)
                    else:
                        result = await _render_chart_protocol(patient_data, sub_query)
                    result["title"] = title
                    charts.append(result)
                except Exception as e:
                    logger.error(f"Chart render failed for {title}: {e}")
                    charts.append({
                        "image_base64": None,
                        "summary": f"Render error for {title}: {e}",
                        "chart_type": "error",
                        "title": title,
                    })
        finally:
            if rest_client is not None:
                await rest_client.aclose()
        return charts

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        charts = loop.run_until_complete(_render_all())
        loop.close()
    except Exception as e:
        logger.error(f"Visualization dispatch failed: {e}")
        charts = []

    # Overall caption from first successful chart
    first_ok = next((c for c in charts if c.get("image_base64")), None)
    caption = _generate_caption(observations, query) if observations else "Clinical charts generated."

    return {
        "viz_result": {
            "charts": charts,
            "caption": caption,
            # Keep backward-compat keys for any consumer that reads the single-chart format
            "image_base64": first_ok["image_base64"] if first_ok else None,
            "summary": first_ok.get("summary", "") if first_ok else "",
            "chart_type": "multi",
        }
    }


def _extract_patient_data_for_viz(
    patient_id: Optional[str],
    documents: Optional[List[Any]],
    patient_state: Optional[Dict[str, Any]],
    query: str,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract structured data from Qdrant for all three chart categories.

    Returns a dict with three lists (may be empty):
      observations  — records with numeric measurements (for line/dual_line charts)
      encounters    — records with phase/event data (for gantt chart)
    """
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    observations: List[Dict[str, Any]] = []
    encounters: List[Dict[str, Any]] = []

    # --- Path A: Qdrant scroll (preferred; does not require patient_id) ---------
    try:
        from src.shared.db_clients import qdrant_client
        q_cli = qdrant_client.connect()
        collection = qdrant_client.collection_name

        scroll_filter = (
            Filter(must=[FieldCondition(key="patient_id", match=MatchValue(value=patient_id))])
            if patient_id else None
        )

        all_points, _ = q_cli.scroll(
            collection_name=collection,
            scroll_filter=scroll_filter,
            limit=200,
            with_payload=True,
            with_vectors=False,
        )

        for point in all_points:
            payload = point.payload or {}
            rtype = payload.get("resource_type", "")
            toon = payload.get("toon_content", "")
            ts = payload.get("date_issued", "")

            if rtype == "Observation":
                obs = _parse_observation_from_toon(toon, ts)
                if obs:
                    observations.append(obs)

            elif rtype == "Encounter":
                enc = _parse_encounter_for_gantt(toon)
                if enc:
                    encounters.append(enc)

        logger.info(
            f"Qdrant scroll: {len(observations)} observations, {len(encounters)} encounters"
        )

    except Exception as e:
        logger.warning(f"Qdrant extraction failed ({e}), trying in-memory documents")

        # --- Path B: In-memory documents (fallback) ---------------------------------
        if documents:
            for doc in documents:
                d = doc.model_dump() if hasattr(doc, "model_dump") else (doc if isinstance(doc, dict) else {})
                observations.append({
                    "timestamp": d.get("date_issued") or d.get("date_normalized", ""),
                    "type": d.get("category", "observation"),
                    "event": d.get("event_tag") or d.get("text_primary", ""),
                    "phase": d.get("phase"),
                    "clinical_status": d.get("normality"),
                    "text_summary": d.get("content_details") or d.get("details", ""),
                    "measurements": d.get("measurements", {}),
                })

    return {"observations": observations, "encounters": encounters}


def _parse_observation_from_toon(
    toon_content: str, timestamp: str
) -> Optional[Dict[str, Any]]:
    """Parse TOON string for numeric observation values.

    Falls back to extracting effectiveDateTime from TOON when the payload
    date_issued field is empty (which it is for all current Qdrant records).
    """
    import re

    if not toon_content:
        return None

    # Recover timestamp from TOON when the Qdrant payload field is empty
    if not timestamp:
        dt_m = re.search(r'effectiveDateTime:\s*"([^"]+)"', toon_content)
        if not dt_m:
            dt_m = re.search(
                r'actualPeriod:.*?start:\s*"([^"]+)"', toon_content, re.DOTALL
            )
        timestamp = dt_m.group(1) if dt_m else ""

    if not timestamp:
        return None

    from src.ingestion.toon import extract_observation_values
    measurements = extract_observation_values(toon_content)

    if not measurements:
        return None

    # Use the human-readable label from the div tag as the event description
    desc_m = re.search(
        r'(?:Laboratory Observation|Observation):\s*([^<\n]+)', toon_content
    )
    event = desc_m.group(1).strip() if desc_m else toon_content[:80]

    return {
        "timestamp": timestamp,
        "type": "observation",
        "measurements": measurements,
        "event": event,
        "phase": None,
        "clinical_status": None,
        "text_summary": toon_content[:200],
    }


def _parse_encounter_for_gantt(toon_content: str) -> Optional[Dict[str, Any]]:
    """Extract timeline entry from an Encounter TOON for use in gantt charts.

    Assigns a clinical phase from keyword heuristics so the gantt renderer
    has meaningful Y-axis groupings.
    """
    import re

    if not toon_content:
        return None

    # Date: Encounters use actualPeriod.start
    dt_m = re.search(r'actualPeriod:.*?start:\s*"([^"]+)"', toon_content, re.DOTALL)
    if not dt_m:
        return None
    timestamp = dt_m.group(1)

    # Event name from the div label (unescape HTML entities)
    desc_m = re.search(r'Encounter:\s*([^<\n]+)', toon_content)
    event = desc_m.group(1).strip() if desc_m else ""
    if not event:
        return None
    event = event.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')

    event_lower = event.lower()
    if any(k in event_lower for k in ["initial gp", "smoking", "spirometry", "pft", "pulmonologist referral"]):
        phase = "Initial Assessment"
        clinical_status = "Active"
    elif any(k in event_lower for k in ["bnp", "ecg", "echo", "cardiology referral", "chest x", "pulmonology"]):
        phase = "Cardiac Workup"
        clinical_status = "Escalation"
    elif any(k in event_lower for k in ["dcm", "diagnosis", "confirmed"]):
        phase = "Diagnosis"
        clinical_status = "Confirmed Diagnosis"
    elif any(k in event_lower for k in ["treatment", "arb", "hf treatment"]):
        phase = "Treatment"
        clinical_status = "Active"
    else:
        phase = "Follow-up"
        clinical_status = "Recovery"

    return {
        "timestamp": timestamp,
        "type": "encounter",
        "event": event,
        "phase": phase,
        "clinical_status": clinical_status,
        "measurements": {},
        "text_summary": event,
    }


def _generate_caption(
    patient_data: List[Dict[str, Any]], query: str
) -> str:
    """
    Generate a clinical caption from the raw patient data using MedGemma.
    Runs in parallel with chart rendering.
    """
    try:
        from openai import OpenAI as SyncOpenAI
        client = SyncOpenAI(base_url=LLAMA_API_BASE, api_key=config.active_llm_api_key)

        data_summary = []
        for d in patient_data[:15]:
            ts = d.get("timestamp", "")[:10]
            event = d.get("event", "")
            m = d.get("measurements", {})
            parts = [ts]
            if event:
                parts.append(event)
            if m:
                parts.append(", ".join(f"{k}={v}" for k, v in m.items()))
            data_summary.append(" | ".join(parts))

        prompt = (
            "You are a clinical caption writer. Given patient observations and a clinician query, "
            "write a concise 2-4 sentence clinical caption describing the trend over time.\n\n"
            "Rules:\n"
            "- Focus on changes over time and key events.\n"
            "- Mention specific values where relevant.\n"
            "- Do NOT invent data not shown.\n"
            "- Keep it professional and factual.\n\n"
            f"Clinician query: {query}\n\n"
            f"Observations:\n" + "\n".join(data_summary) + "\n\nCaption:"
        )

        response = client.chat.completions.create(
            model=LLAMA_MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.warning(f"Caption generation failed: {e}")
        # Fallback: build simple caption from data
        measurements_seen = {}
        events_seen = []
        for d in patient_data:
            for k, v in (d.get("measurements") or {}).items():
                measurements_seen.setdefault(k, []).append(v)
            if d.get("event"):
                events_seen.append(d["event"])

        parts = []
        for var, vals in measurements_seen.items():
            if len(vals) >= 2:
                direction = "increased" if vals[-1] > vals[0] else "declined"
                parts.append(f"{var} {direction} from {vals[0]} to {vals[-1]}")
        if events_seen:
            parts.append(f"Events: {'; '.join(events_seen[:5])}")
        return ". ".join(parts) if parts else f"Clinical trend for: {query}"
