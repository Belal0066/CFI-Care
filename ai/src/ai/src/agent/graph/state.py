from typing import TypedDict, List, Optional, Dict, Any
from langchain_core.messages import BaseMessage
from src.shared.models import EncounterGroup

class ClinicalAgentState(TypedDict):
    """
    Schema for the Clinical Agent's graph state.
    Tracks the conversation, patient context, reasoning artifacts, and flags.
    """
    messages: List[BaseMessage]
    
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
