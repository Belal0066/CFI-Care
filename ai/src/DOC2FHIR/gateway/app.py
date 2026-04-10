from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import GatewaySettings
from .models import ErrorResponse, HealthResponse, JobStatus, JobStatusResponse, UploadDocumentResponse
from .orchestrator import JobOrchestrator
from .repository import JobNotFoundError, JobRepository


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_app(settings: GatewaySettings | None = None) -> FastAPI:
    settings = settings or GatewaySettings.from_env()
    settings.ensure_directories()

    repository = JobRepository(settings.db_path)
    repository.bootstrap()

    orchestrator = JobOrchestrator(repository, settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
        description="DOC2FHIR gateway that coordinates OCR ingestion, job tracking, and downstream delivery.",
        openapi_tags=[
            {"name": "System", "description": "Health and runtime diagnostics."},
            {"name": "Documents", "description": "Document ingestion and status tracking."},
        ],
    )

    app.state.settings = settings
    app.state.repository = repository
    app.state.orchestrator = orchestrator

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        payload = ErrorResponse(
            code="validation_error",
            message="Request validation failed.",
            details={"errors": exc.errors()},
            request_id=request.headers.get("x-request-id"),
        )
        return JSONResponse(status_code=422, content=payload.model_dump(mode="json"))

    @app.exception_handler(JobNotFoundError)
    async def job_not_found_handler(request: Request, exc: JobNotFoundError):
        payload = ErrorResponse(
            code="job_not_found",
            message=f"Job not found: {exc.args[0]}",
            details={"job_id": exc.args[0]},
            request_id=request.headers.get("x-request-id"),
        )
        return JSONResponse(status_code=404, content=payload.model_dump(mode="json"))

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail)
        payload = ErrorResponse(
            code="http_error",
            message=detail,
            details={"status_code": exc.status_code},
            request_id=request.headers.get("x-request-id"),
        )
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump(mode="json"))

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        payload = ErrorResponse(
            code="internal_error",
            message="Unexpected server error.",
            details={"exception_type": type(exc).__name__},
            request_id=request.headers.get("x-request-id"),
        )
        return JSONResponse(status_code=500, content=payload.model_dump(mode="json"))

    def get_repository() -> JobRepository:
        return repository

    def get_settings() -> GatewaySettings:
        return settings

    def _sanitize_metadata(metadata_text: str | None) -> dict:
        if not metadata_text:
            return {}
        try:
            parsed = json.loads(metadata_text)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Metadata must be valid JSON: {exc.msg}") from exc
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="Metadata must be a JSON object.")
        return parsed

    def _save_upload_file(job_id: str, upload_file: UploadFile) -> Path:
        suffix = Path(upload_file.filename or "").suffix.lower()
        if suffix not in settings.allowed_extensions:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {suffix or '<missing>'}",
            )

        destination = settings.upload_dir / f"{job_id}{suffix}"
        with destination.open("wb") as handle:
            handle.write(upload_file.file.read())
        return destination

    def _background_acknowledge(job_id: str) -> None:
        try:
            repository.update_job_stage(
                job_id,
                state=JobStatus.QUEUED,
                detail="Document accepted and queued for processing.",
                progress=0.0,
                extra_payload={"background_task": True},
            )
            # Trigger the orchestrator pipeline
            import asyncio
            asyncio.run(orchestrator.process_job(job_id))
        except Exception:
            # Background tasks should never block the upload response.
            return

    @app.get(
        "/v1/health",
        tags=["System"],
        response_model=HealthResponse,
        responses={500: {"model": ErrorResponse}},
    )
    async def health_check(repo: JobRepository = Depends(get_repository), config: GatewaySettings = Depends(get_settings)):
        db_ok = repo.ping()

        payload = HealthResponse(
            status="ok" if db_ok else "degraded",
            service=config.app_name,
            timestamp=_utc_now(),
            dependencies={
                "database": db_ok,
                "ocr_service": config.ocr_base_url,
                "mapper_service": config.mapper_base_url,
                "downstream_docfhir": config.downstream_docfhir_url,
            },
        )
        return payload

    @app.post(
        "/v1/document/upload",
        tags=["Documents"],
        response_model=UploadDocumentResponse,
        responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}},
    )
    async def upload_document(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        metadata: str | None = Form(default=None),
        correlation_id: str | None = Form(default=None),
        repo: JobRepository = Depends(get_repository),
    ):
        payload = _sanitize_metadata(metadata)
        if file.filename is None:
            raise HTTPException(status_code=400, detail="Upload is missing a filename.")

        job_id = f"{settings.default_correlation_prefix}_{uuid.uuid4().hex}"
        upload_path = _save_upload_file(job_id, file)
        file_size = upload_path.stat().st_size
        max_upload_bytes = settings.max_upload_mb * 1024 * 1024
        if file_size > max_upload_bytes:
            upload_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds size limit of {settings.max_upload_mb} MB.",
            )

        job = repo.create_job(
            job_id=job_id,
            filename=file.filename,
            content_type=file.content_type,
            metadata={**payload, "uploaded_file_size": file_size},
            detail="Document accepted and queued for processing.",
            upload_path=str(upload_path),
            correlation_id=correlation_id or job_id,
        )

        background_tasks.add_task(_background_acknowledge, job_id)
        return UploadDocumentResponse(
            job_id=job.job_id,
            state=job.state,
            detail=job.detail,
            created_at=job.created_at,
        )

    @app.get(
        "/v1/document/status/{job_id}",
        tags=["Documents"],
        response_model=JobStatusResponse,
        responses={404: {"model": ErrorResponse}},
    )
    async def get_document_status(job_id: str, repo: JobRepository = Depends(get_repository)):
        job = repo.get_job_by_id(job_id)
        return JobStatusResponse(
            job_id=job.job_id,
            state=job.state,
            detail=job.detail,
            filename=job.filename,
            progress=job.progress,
            created_at=job.created_at,
            updated_at=job.updated_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
            error_code=job.error_code,
            error_message=job.error_message,
            correlation_id=job.correlation_id,
            metadata=job.metadata,
        )

    @app.post(
        "/v1/internal/callback",
        tags=["System"],
        responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    )
    async def internal_callback(
        body: dict = Body(...),
        repo: JobRepository = Depends(get_repository),
    ):
        """Internal callback endpoint for mapper service completion signals.

        Expected payload:
        {
            "job_id": "...",
            "status": "completed" | "failed",
            "fhir_bundle": {...},  // on success
            "error": "..."  // on failure
        }
        """
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be JSON object")

        job_id = body.get("job_id")
        if not job_id:
            raise HTTPException(status_code=400, detail="Missing required field: job_id")

        try:
            job = repo.get_job_by_id(job_id)
        except JobNotFoundError:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        status = body.get("status", "").lower()
        if status == "completed":
            fhir_bundle = body.get("fhir_bundle", {})
            if not fhir_bundle:
                raise HTTPException(status_code=400, detail="Completed callback missing fhir_bundle")

            # Save FHIR output if provided
            if fhir_bundle:
                fhir_dir = settings.runtime_dir / "fhir_outputs"
                fhir_path = repo.save_fhir_output(job_id, fhir_dir, fhir_bundle)
                repo.update_job_stage(
                    job_id,
                    state=JobStatus.COMPLETED,
                    detail="Job completed via callback",
                    fhir_output_path=str(fhir_path),
                    finished_at=_utc_now().isoformat(),
                    progress=100.0,
                )

            return {"status": "acknowledged", "job_id": job_id}

        elif status == "failed":
            error_msg = body.get("error", "Unknown error")
            repo.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail="Job failed via callback",
                error_code="callback_error",
                error_message=error_msg[:500],
                finished_at=_utc_now().isoformat(),
            )
            return {"status": "acknowledged", "job_id": job_id}

        else:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    @app.get("/", tags=["System"])
    async def root():
        return {
            "service": settings.app_name,
            "version": settings.version,
            "docs": settings.docs_url,
            "health": "/v1/health",
        }

    return app