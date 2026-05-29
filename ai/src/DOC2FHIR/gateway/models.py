from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, Enum):
    PENDING = "PENDING"
    SERVER_BUSY = "SERVER_BUSY"
    OCR_PROCESSING = "OCR_PROCESSING"
    MAPPING = "MAPPING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ErrorResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "code": "invalid_metadata",
            "message": "Metadata must be valid JSON.",
            "details": {"field": "metadata"},
            "request_id": "job_01HZX9J7YJ4X3KQ9VY5J0K2H8P",
        }
    })

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: Optional[str] = None


class UploadDocumentResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "job_id": "job_01HZX9J7YJ4X3KQ9VY5J0K2H8P",
            "state": "PENDING",
            "detail": "Document accepted and queued for processing.",
            "created_at": "2026-04-25T10:15:30.123456+00:00",
        }
    })

    job_id: str
    state: JobStatus
    detail: str
    created_at: datetime


class JobStatusResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "job_id": "job_01HZX9J7YJ4X3KQ9VY5J0K2H8P",
            "state": "PENDING",
            "detail": "Document accepted and queued for processing.",
            "filename": "example.pdf",
            "progress": 0.0,
            "created_at": "2026-04-25T10:15:30.123456+00:00",
            "updated_at": "2026-04-25T10:15:31.123456+00:00",
            "started_at": None,
            "finished_at": None,
            "error_code": None,
            "error_message": None,
            "metadata": {"patient_id": "P123"},
        }
    })

    job_id: str
    state: JobStatus
    detail: str
    filename: str
    progress: float = 0.0
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    correlation_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: datetime
    dependencies: dict[str, Any]


class UploadMetadata(BaseModel):
    """Generic metadata payload accepted with uploads."""

    model_config = ConfigDict(extra="allow")

    patient_id: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class JobRecord(BaseModel):
    job_id: str
    filename: str
    content_type: Optional[str] = None
    state: JobStatus
    detail: str
    progress: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    correlation_id: Optional[str] = None
    upload_path: Optional[str] = None
    ocr_output_path: Optional[str] = None
    fhir_output_path: Optional[str] = None


class CallbackErrorPayload(BaseModel):
    code: str
    message: str


class CallbackPayload(BaseModel):
    job_id: str
    status: str  # "COMPLETED" | "FAILED"
    completed_at: str
    error: Optional[CallbackErrorPayload] = None