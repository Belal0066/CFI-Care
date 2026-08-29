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

    # ---- Adaptive retrieval (bounded, deterministic — no model call) ----
    # If the first retrieval pass scores below the gatekeeper threshold,
    # retry once with a relaxed threshold before proceeding to reasoning on
    # thin evidence. Hard-bounded by max_retrieval_retries; the decision to
    # retry and how to relax the threshold are both deterministic, not
    # model-controlled.
    max_retrieval_retries: int = 1
    retrieval_retry_threshold_factor: float = 0.5

    # ---- Graded retrieval evaluator (Corrective RAG-style grading) ----
    # Off by default, same rollout posture as the NLI verifier below: a real,
    # working mechanism that isn't live until explicitly enabled and
    # evaluated. When off, route_after_retrieval behaves exactly as the
    # single-threshold retry above. When on, retrieval_avg_top3 is graded
    # into three bands instead of a binary check:
    #   >= retrieval_gatekeeper_threshold        -> sufficient
    #   >= retrieval_insufficient_threshold       -> ambiguous (model-
    #      and < retrieval_gatekeeper_threshold      controlled reformulation
    #                                                 retry — the "Agentic
    #                                                 RAG" branch)
    #   <  retrieval_insufficient_threshold       -> insufficient (deterministic
    #                                                 corrective fallback —
    #                                                 the "Corrective RAG"
    #                                                 branch)
    # retrieval_insufficient_threshold defaults to the same number the
    # existing retry already relaxes to (gatekeeper * retry_threshold_factor)
    # so grading and the pre-existing retry math stay consistent.
    graded_retrieval_evaluator_enabled: bool = False
    retrieval_insufficient_threshold: float = 0.075

    # ---- Bounded ReAct loop (MedMCP evidence-gathering only) ----
    # Off by default. Scoped deliberately to MedMCP's read-only external
    # lookups (get_medical_data) — never to patient-record reasoning, which
    # stays fully deterministic (ClinicalReasoner). See src/agent/react.py.
    mcp_react_loop_enabled: bool = False
    mcp_react_max_iterations: int = 3

    # ---- Confidence Weights for Unified Formula ----
    confidence_weight_routing: float = 0.15
    confidence_weight_retrieval: float = 0.25
    confidence_weight_generation: float = 0.30
    confidence_weight_validation: float = 0.30

    # ---- Overall confidence labels ----
    confidence_low_max: float = 0.50
    confidence_medium_max: float = 0.75

    # ---- Evidence Verification (semantic grounding, distinct from citation-ID audit) ----
    # Both default off: this is a new, unevaluated capability. Turn on
    # `semantic_verification_enabled` to compute NLI entailment scores in
    # shadow mode (logged via claim_verifications, not gating audit_passed).
    # Turn on `semantic_verification_gating_enabled` only after evaluating
    # verifier precision/recall against a held-out claim/evidence set.
    semantic_verification_enabled: bool = False
    semantic_verification_gating_enabled: bool = False
    nli_model_name: str = "cross-encoder/nli-deberta-v3-base"
    nli_entailment_threshold: float = 0.5


retriever_config = RetrieverConfig()
