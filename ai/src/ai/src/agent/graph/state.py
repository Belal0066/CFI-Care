from typing import TypedDict, List, Optional, Dict, Any
from langchain_core.messages import BaseMessage
from src.shared.models import EncounterGroup

class ClinicalAgentState(TypedDict):
    """
    Schema for the Clinical Agent's graph state.
    Tracks the conversation, patient context, reasoning artifacts, and flags.
    """
    messages: List[BaseMessage]

    # The user's question for this turn, set once by classify_intent and
    # never overwritten (nodes read it instead of messages[-1], which holds
    # the previous answer during an audit retry).
    query: str
    # Search text override set by reformulate_query; None means use `query`.
    retrieval_query: Optional[str]
    # Retry widening (dense_topk gating): top-k for the next retrieval pass
    # and whether the intent filter is still applied.
    retrieval_top_k: Optional[int]
    retrieval_use_intent_filter: bool

    patient_id: Optional[str]
    patient_state: Optional[Dict[str, Any]]
    documents: Optional[List[Any]]

    intent: str
    intent_confidence: float
    rewritten_query: Optional[str]

    # Encounter-level retrieval (replaces retrieved_docs)
    encounter_groups: List[EncounterGroup]
    internet_evidence: List[Dict[str, Any]]

    # Retrieval confidence
    retrieval_confidence: float
    retrieval_avg_top3: float
    has_insufficient_data: bool
    retrieval_iterations: int

    # Graded retrieval evaluator (off by default — see
    # retriever_config.graded_retrieval_evaluator_enabled). None when the
    # flag is off; "sufficient"/"ambiguous"/"insufficient" when on.
    retrieval_grade: Optional[str]
    general_knowledge_fallback: bool
    abstain_reason: Optional[str]

    # Configurable threshold for this query
    retrieval_threshold: float

    clinical_response: Optional[Dict[str, Any]]

    # Audit / self-correction
    audit_passed: bool
    audit_failures: List[Dict[str, Any]]
    audit_retry_count: int
    abstained: bool

    # Tier-2 semantic verification (shadow-mode by default — see
    # retriever_config.semantic_verification_enabled/_gating_enabled)
    claim_verifications: List[Dict[str, Any]]

    # Generation & validation confidence
    generation_confidence: float
    validation_confidence: float
    overall_confidence: float

    needs_drug_check: bool

    mode: str
    needs_guidelines: bool
    is_mcp_query: bool

    # Visualization result (from clinical_viz MCP)
    viz_result: Optional[Dict[str, Any]] = None

    # Bounded ReAct loop over MedMCP evidence-gathering (off by default, 
    # see retriever_config.mcp_react_loop_enabled). Structured, auditable
    # trace of each decided action, not hidden free-form reasoning.
    mcp_react_steps: List[Dict[str, Any]]
