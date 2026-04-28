"""
FastAPI Service for MedGemma RAG
Exposes REST API for clinical question answering with retrieval.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
from prometheus_fastapi_instrumentator import Instrumentator

from src.retrieval.medgemma_rag import medgemma_rag

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="MedGemma RAG API",
    description="Clinical RAG with MedGemma 1.5 and Qdrant",
    version="1.0.0"
)
Instrumentator().instrument(app).expose(app)


# Request/Response Models
class RAGQueryRequest(BaseModel):
    """RAG query request."""
    query: str = Field(..., description="User query/question")
    patient_id: Optional[str] = Field(None, description="Filter by patient ID")
    system_prompt: Optional[str] = Field(None, description="Custom system prompt")
    top_k: Optional[int] = Field(5, ge=1, le=20, description="Number of contexts to retrieve")


class ContextMetadata(BaseModel):
    """Retrieved context metadata."""
    id: str
    content: str
    score: float
    patient_id: str
    resource_type: str


class RAGQueryResponse(BaseModel):
    """RAG query response."""
    answer: str = Field(..., description="Generated answer")
    model: str = Field(..., description="Model used")
    contexts_used: int = Field(..., description="Number of contexts used")
    contexts: List[ContextMetadata] = Field(..., description="Retrieved contexts")
    usage: Optional[Dict[str, Any]] = Field(None, description="Token usage statistics")


class RetrievalRequest(BaseModel):
    """Retrieval-only request."""
    query: str = Field(..., description="Search query")
    patient_id: Optional[str] = Field(None, description="Filter by patient ID")
    top_k: Optional[int] = Field(5, ge=1, le=20, description="Number of results")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    services: Dict[str, str]


# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    # Check services
    services = {
        "api": "ok",
        "qdrant": "unknown",
        "llama_server": "unknown"
    }
    
    # Test Qdrant connection
    try:
        from shared.db_clients import qdrant_client
        q_client = qdrant_client.connect()
        collections = q_client.get_collections()
        services["qdrant"] = "ok"
    except Exception as e:
        logger.error(f"Qdrant health check failed: {e}")
        services["qdrant"] = f"error: {str(e)}"
    
    # Test llama.cpp server
    try:
        import requests
        response = requests.get(
            f"{medgemma_rag.llama_server_url}/health",
            timeout=5
        )
        if response.status_code == 200:
            services["llama_server"] = "ok"
        else:
            services["llama_server"] = f"status: {response.status_code}"
    except Exception as e:
        logger.error(f"Llama server health check failed: {e}")
        services["llama_server"] = f"error: {str(e)}"
    
    return HealthResponse(
        status="ok" if all(s == "ok" for s in services.values()) else "degraded",
        services=services
    )


@app.post("/query", response_model=RAGQueryResponse)
async def rag_query(request: RAGQueryRequest):
    """
    Perform RAG query: retrieve relevant contexts and generate answer.
    """
    try:
        # Update top_k if provided
        if request.top_k and request.top_k != medgemma_rag.top_k:
            medgemma_rag.top_k = request.top_k
        
        result = medgemma_rag.query(
            query=request.query,
            patient_id=request.patient_id,
            system_prompt=request.system_prompt
        )
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        
        return RAGQueryResponse(
            answer=result["content"],
            model=result.get("model", "medgemma-1.5-4b"),
            contexts_used=result["contexts_used"],
            contexts=[ContextMetadata(**ctx) for ctx in result["contexts"]],
            usage=result.get("usage")
        )
        
    except Exception as e:
        logger.error(f"RAG query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrieve", response_model=List[ContextMetadata])
async def retrieve_contexts(request: RetrievalRequest):
    """
    Retrieve relevant contexts without generation (retrieval-only).
    """
    try:
        # Update top_k if provided
        if request.top_k and request.top_k != medgemma_rag.top_k:
            medgemma_rag.top_k = request.top_k
        
        contexts = medgemma_rag.retrieve_context(
            query=request.query,
            patient_id=request.patient_id
        )
        
        return [ContextMetadata(**ctx) for ctx in contexts]
        
    except Exception as e:
        logger.error(f"Retrieval failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "MedGemma RAG API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "query": "/query",
            "retrieve": "/retrieve",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
