from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Optional


class RetrieverConfig(BaseSettings):
    model_config = ConfigDict(extra="allow")

    # ---- Named Vectors ----
    dense_vector_name: str = "text-dense"
    sparse_vector_name: str = "text-sparse"

    # ---- Hybrid Search (Manual RRF) ----
    prefetch_multiplier: int = 2
    rrf_rank_constant: int = 60
    fusion_score_threshold: Optional[float] = None

    # ---- Dense-only Fallback ----
    dense_score_threshold: float = 0.60

    # ---- Limits ----
    default_top_k: int = 10
    agent_max_docs: int = 15

    # ---- Temporal ----
    temporal_window_days: int = 7
    summary_window_days: int = 30

    # ---- LLM Generation ----
    temperature_rag: float = 0.1
    temperature_chat: float = 0.7
    temperature_mcp: float = 0.1
    llm_timeout_seconds: int = 60
    llm_max_tokens_rag: int = 1024
    llm_max_tokens_chat: int = 5000

    # ---- Confidence Thresholds (Multi-Layer) ----
    routing_fallback_threshold: float = 0.70
    retrieval_gatekeeper_threshold: float = 0.15
    generation_entropy_warning_threshold: float = 0.30

    # ---- Confidence Weights for Unified Formula ----
    confidence_weight_routing: float = 0.15
    confidence_weight_retrieval: float = 0.25
    confidence_weight_generation: float = 0.30
    confidence_weight_validation: float = 0.30

    # ---- Overall confidence labels ----
    confidence_low_max: float = 0.50
    confidence_medium_max: float = 0.75


retriever_config = RetrieverConfig()
