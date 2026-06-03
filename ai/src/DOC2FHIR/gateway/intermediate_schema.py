from __future__ import annotations

from enum import Enum
from typing import Any, Optional, List
from pydantic import BaseModel, Field, ConfigDict, model_validator


SCHEMA_VERSION = "1.0.0"


class DocumentType(str, Enum):
    PRESCRIPTION = "prescription"
    LAB_REPORT = "lab_report"
    DISCHARGE_SUMMARY = "discharge_summary"
    RADIOLOGY_REPORT = "radiology_report"
    CLINICAL_NOTE = "clinical_note"
    VACCINATION_RECORD = "vaccination_record"


class EvidenceSpan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    start: int
    end: int
    page: Optional[int] = None
    bbox: Optional[list[float]] = None

    @model_validator(mode="after")
    def _check_offsets(self) -> "EvidenceSpan":
        if self.start < 0 or self.end < 0:
            raise ValueError("Evidence offsets must be non-negative")
        if self.end < self.start:
            raise ValueError("Evidence end must be >= start")
        return self


class PatientInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    patient_id: Optional[str] = None


class EncounterInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: Optional[str] = None
    facility: Optional[str] = None


class ConditionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Optional[str] = None
    onset: Optional[str] = None
    status: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[EvidenceSpan] = None

class MedicationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[EvidenceSpan] = None

class ObservationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None
    interpretation: Optional[str] = None
    effective_date: Optional[str] = None
    reference_range_low: Optional[str] = None
    reference_range_high: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[EvidenceSpan] = None

class AllergyItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Optional[str] = None
    reaction: Optional[str] = None
    severity: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[EvidenceSpan] = None


class ProcedureItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Optional[str] = None
    performed: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[EvidenceSpan] = None


class DocumentClassification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    doc_type: DocumentType
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: Optional[str] = None


class IntermediateExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default=SCHEMA_VERSION)
    document_type: DocumentType
    patient: PatientInfo = Field(default_factory=PatientInfo)
    encounter: EncounterInfo = Field(default_factory=EncounterInfo)
    conditions: list[ConditionItem] = Field(default_factory=list)
    medications: list[MedicationItem] = Field(default_factory=list)
    observations: list[ObservationItem] = Field(default_factory=list)
    allergies: list[AllergyItem] = Field(default_factory=list)
    procedures: list[ProcedureItem] = Field(default_factory=list)
    unmapped_sections: list[str] = Field(default_factory=list)
    document_summary: Optional[str] = None

    @model_validator(mode="after")
    def _ensure_version(self) -> "IntermediateExtraction":
        if not self.schema_version:
            self.schema_version = SCHEMA_VERSION
        return self


def intermediate_schema_json() -> dict[str, Any]:
    return IntermediateExtraction.model_json_schema()


# Compatibility aliases for other modules that expect these names
IntermediateDocument = IntermediateExtraction
DocumentTypeEnum = DocumentType
DocumentClassificationModel = DocumentClassification
