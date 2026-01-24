from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class RetrievalDataSchema(BaseModel):
    """Raw retrieval data from internet sources (no synthesis)"""
    query: str = Field(..., description="Original query")
    classification: str = Field(..., description="Query classification (A-G)")
    entities: List[str] = Field(default_factory=list, description="Extracted entities")
    raw_data: List[Dict[str, Any]] = Field(..., description="Raw retrieval results")
    sources: List[str] = Field(default_factory=list, description="Source names")

class MedicalResponseSchema(BaseModel):
    query_id: str = Field(..., description="Unique identifier for the query")
    clinical_summary: str = Field(..., description="Concise clinical summary")
    evidence_level: str = Field(..., description="Level of evidence (e.g., Level 1A, Level 3)")
    recommendation: str = Field(..., description="Actionable recommendation")
    confidence_score: float = Field(..., description="Confidence score between 0.0 and 1.0")
    references: List[str] = Field(..., description="List of authoritative sources")
    warnings: Optional[List[str]] = Field(None, description="Any safety warnings or contraindications")
    notes: Optional[str] = Field(None, description="Internal notes or conflict warnings")


# ============================================================================
# Clinical Visualization Schemas (Layer 2)
# ============================================================================

class VizRenderRequest(BaseModel):
    patient_data: List[Dict[str, Any]] = Field(
        ..., description="Structured clinical observations with timestamps, measurements, events"
    )
    query: str = Field(..., description="Clinician's natural language query driving the visualization")


class VizRenderResponse(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded PNG chart image")
    summary: str = Field(..., description="Short textual summary of the clinical trend")
    chart_type: str = Field(..., description="Type of chart rendered (dual_line / line / gantt)")
