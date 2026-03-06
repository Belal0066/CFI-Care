from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

# Clinical Infrastructure Global Rules Compliance:
# 1. Pydantic V1 (downgraded for FHIR R4 compat).
# 2. Strict Typing.

class ClinicalEntity(BaseModel):
    """
    Base class for all clinical entities, ensuring consistent identity linkage
    between FHIR source data and its Qdrant vector entry.
    """
    class Config:
        extra = 'ignore'
        arbitrary_types_allowed = True

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="The UUID that links FHIR source data to its Vector store entry.")
    resource_type: str = Field(..., description="FHIR Resource Type (e.g., Patient, Observation)")
    
    # Traceability for HIPAA
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Must include 'reasoning_trace' for LangGraph nodes.")

class VectorPayload(BaseModel):
    """
    Standardized payload for Qdrant ingestion.
    """
    id: str
    content: str = Field(..., description="Normalized clinical text snapshot.")
    source_node_id: str = Field(..., description="Link to the source ingestion node ID.")
    embedding: Optional[List[float]] = Field(None, description="768-dim vector.")

class RetrievedContext(BaseModel):
    """
    Context object returned by HybridRetriever's dense+sparse vector search.
    """
    anchor_id: str
    anchor_content: str
    score: float
    # New fields for encounter-level retrieval
    parent_node_id: Optional[str] = Field(None, description="Encounter/node ID this chunk belongs to")
    father_id: Optional[str] = Field(None, description="Parent encounter ID for encounter-level grouping")
    date_issued: Optional[str] = Field(None, description="ISO-8601 date of the encounter")


class EncounterGroup(BaseModel):
    """
    Groups retrieved chunks by their parent encounter.
    Used for encounter-level retrieval in the agentic RAG pipeline.
    """
    encounter_id: str
    score: float
    chunks: List[RetrievedContext]
    father_id: Optional[str] = None
    date_issued: Optional[str] = None

# ============================================================================
# Agent Models (Ticket 2.2)
# ============================================================================

class DifferentialDiagnosis(BaseModel):
    """
    Structured differential diagnosis output from reasoning agent.
    """
    diagnosis: str
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score [0-1]")
    supporting_evidence: List[str] = Field(default_factory=list, description="Evidence supporting this diagnosis")
    cited_ids: List[str] = Field(default_factory=list, description="UUIDs from retrieved context")

class AuditFailure(BaseModel):
    """
    Record of audit validation failure.
    """
    type: str = Field(..., description="Type: missing_citation, hallucination, logical_error")
    message: str
    severity: str = Field(default="high", description="Severity: low, medium, high")
    related_ddx_index: Optional[int] = None

class ClinicalState(BaseModel):
    """
    LangGraph state for clinical reasoning workflow (Ticket 2.2).
    """
    # Input
    patient_id: str
    query: str
    
    # Retrieval Phase
    retrieved_contexts: List[RetrievedContext] = Field(default_factory=list)
    retrieval_error: Optional[str] = None
    
    # Reasoning Phase
    raw_reasoning: Optional[str] = None
    differential_diagnoses: List[DifferentialDiagnosis] = Field(default_factory=list)
    reasoning_error: Optional[str] = None
    
    # Audit Phase
    audit_passed: bool = False
    audit_failures: List[AuditFailure] = Field(default_factory=list)
    
    # Metadata (HIPAA Traceability)
    metadata: Dict[str, Any] = Field(default_factory=lambda: {
        "timestamp": datetime.now().isoformat(),
        "reasoning_trace": []
    })

# Future: Add specific FHIR resource models here
