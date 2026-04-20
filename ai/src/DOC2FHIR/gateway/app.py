from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .config import GatewaySettings
from .job_queue import InMemoryJobQueue, QueueFullError
from .models import ErrorResponse, HealthResponse, JobStatus, JobStatusResponse, UploadDocumentResponse
from .observability import get_metrics
from .orchestrator import JobOrchestrator
from .repository import JobNotFoundError, JobRepository


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


logger = logging.getLogger(__name__)


def create_app(settings: GatewaySettings | None = None) -> FastAPI:
    settings = settings or GatewaySettings.from_env()
    settings.ensure_directories()

    repository = JobRepository(settings.db_path)
    repository.bootstrap()

    orchestrator = JobOrchestrator(repository, settings)
    job_queue = InMemoryJobQueue(settings.queue_max_size)

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
    app.state.job_queue = job_queue
    app.state.worker_task = None

    async def _run_queue_worker() -> None:
        while True:
            job_id = await job_queue.dequeue()
            try:
                await orchestrator.process_job(job_id)
            except Exception as exc:
                logger.exception("Queue worker failed for job %s: %s", job_id, exc)
            finally:
                job_queue.task_done()

    @app.on_event("startup")
    async def startup_event() -> None:
        app.state.worker_task = asyncio.create_task(_run_queue_worker())

    @app.on_event("shutdown")
    async def shutdown_event() -> None:
        task = app.state.worker_task
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

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

    def _save_base64_pdf(job_id: str, filename: str, payload_b64: str) -> Path:
        suffix = Path(filename).suffix.lower() or ".pdf"
        if suffix not in settings.allowed_extensions:
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {suffix}")

        try:
            raw = base64.b64decode(payload_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid pdf_base64 payload: {exc}") from exc

        destination = settings.upload_dir / f"{job_id}{suffix}"
        destination.write_bytes(raw)
        return destination

    def _validate_fhir_bundle(bundle: dict | None) -> dict:
        if not bundle:
            return {"valid": False, "errors": ["No FHIR bundle available"], "resource_count": 0}

        errors: list[str] = []
        if not isinstance(bundle, dict):
            errors.append("FHIR payload must be a JSON object")
            return {"valid": False, "errors": errors, "resource_count": 0}

        resource_type = bundle.get("resourceType")
        if resource_type != "Bundle":
            errors.append(f"Expected resourceType=Bundle, got {resource_type!r}")

        entries = bundle.get("entry", [])
        if not isinstance(entries, list):
            errors.append("FHIR Bundle entry must be a list")
            entries = []

        for index, entry in enumerate(entries):
            resource = entry.get("resource") if isinstance(entry, dict) else None
            if not isinstance(resource, dict):
                errors.append(f"Entry {index} is missing resource object")
                continue
            if "resourceType" not in resource:
                errors.append(f"Entry {index} resource missing resourceType")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "resource_count": len(entries),
        }

    def _extract_stage_metrics(events: list[dict]) -> dict:
        metrics: dict[str, float] = {}
        for event in events:
            payload = event.get("payload") or {}
            for key in ("ocr_time_sec", "mapper_time_sec", "delivery_time_sec"):
                if key in payload:
                    metrics[key] = payload[key]
        return metrics

    async def _probe_dependency(base_url: str, paths: tuple[str, ...]) -> dict:
        endpoint = base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=2.5) as client:
            for path in paths:
                candidate = f"{endpoint}{path}"
                try:
                    response = await client.get(candidate)
                    if response.status_code < 500:
                        return {"ok": True, "endpoint": candidate, "status_code": response.status_code}
                except Exception:
                    continue
        return {"ok": False, "endpoint": endpoint, "status_code": None}

    @app.get(
        "/v1/health",
        tags=["System"],
        response_model=HealthResponse,
        responses={500: {"model": ErrorResponse}},
    )
    async def health_check(repo: JobRepository = Depends(get_repository), config: GatewaySettings = Depends(get_settings)):
        db_ok = repo.ping()
        storage_ok = config.runtime_dir.exists() and config.upload_dir.exists() and os.access(config.upload_dir, os.W_OK)
        ocr_dep = await _probe_dependency(config.ocr_base_url, ("/v1/health", "/health", "/v1/models"))
        mapper_dep = await _probe_dependency(config.mapper_base_url, ("/v1/models", "/health", "/"))
        downstream_dep = await _probe_dependency(config.downstream_docfhir_url, ("/health", "/v1/health", "/"))
        dependencies_ok = db_ok and storage_ok and ocr_dep["ok"] and mapper_dep["ok"] and downstream_dep["ok"]

        payload = HealthResponse(
            status="ok" if dependencies_ok else "degraded",
            service=config.app_name,
            timestamp=_utc_now(),
            dependencies={
                "database": {"ok": db_ok, "path": str(config.db_path)},
                "storage": {"ok": storage_ok, "runtime_dir": str(config.runtime_dir), "upload_dir": str(config.upload_dir)},
                "ocr_service": ocr_dep,
                "mapper_service": mapper_dep,
                "downstream_docfhir": downstream_dep,
                "queue": {
                    "ok": not job_queue.is_full(),
                    "size": job_queue.size(),
                    "capacity": job_queue.capacity(),
                },
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
        file: UploadFile = File(...),
        metadata: str | None = Form(default=None),
        correlation_id: str | None = Form(default=None),
        repo: JobRepository = Depends(get_repository),
    ):
        payload = _sanitize_metadata(metadata)
        if file.filename is None:
            raise HTTPException(status_code=400, detail="Upload is missing a filename.")

        if job_queue.is_full():
            raise HTTPException(status_code=503, detail="Server busy: queue capacity reached. Retry shortly.")

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

        try:
            job_queue.enqueue_nowait(job_id)
        except QueueFullError:
            repo.update_job_stage(
                job_id,
                state=JobStatus.SERVER_BUSY,
                detail="Server busy: queue capacity reached",
                error_code="server_busy",
                error_message="Queue capacity reached",
            )
            raise HTTPException(status_code=503, detail="Server busy: queue capacity reached. Retry shortly.")

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
        "/v1/document/sqs/ingest",
        tags=["Documents"],
        response_model=UploadDocumentResponse,
        responses={400: {"model": ErrorResponse}, 415: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    )
    async def ingest_from_sqs(
        body: dict = Body(...),
        repo: JobRepository = Depends(get_repository),
    ):
        """Ingest a PDF job from an SQS-style message payload.

        Supported payload fields:
        - message_id: required
        - filename: optional, defaults to message_id + ".pdf"
        - pdf_base64: required in this local mode
        - correlation_id: optional
        - metadata: optional object
        - s3_uri: optional metadata-only field
        """
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be JSON object")

        if job_queue.is_full():
            raise HTTPException(status_code=503, detail="Server busy: queue capacity reached. Retry shortly.")

        message_id = body.get("message_id")
        if not message_id:
            raise HTTPException(status_code=400, detail="Missing required field: message_id")

        pdf_base64 = body.get("pdf_base64")
        if not pdf_base64:
            raise HTTPException(
                status_code=400,
                detail="Missing required field: pdf_base64 (S3 pull mode is not enabled in this local build)",
            )

        metadata = body.get("metadata") or {}
        if not isinstance(metadata, dict):
            raise HTTPException(status_code=400, detail="metadata must be a JSON object")

        filename = body.get("filename") or f"{message_id}.pdf"
        correlation_id = body.get("correlation_id") or f"sqs_{message_id}"

        job_id = f"{settings.default_correlation_prefix}_{uuid.uuid4().hex}"
        upload_path = _save_base64_pdf(job_id, filename, pdf_base64)
        file_size = upload_path.stat().st_size

        job = repo.create_job(
            job_id=job_id,
            filename=filename,
            content_type="application/pdf",
            metadata={
                **metadata,
                "source": "sqs",
                "sqs_message_id": message_id,
                "s3_uri": body.get("s3_uri"),
                "uploaded_file_size": file_size,
            },
            detail="SQS message accepted and queued for processing.",
            upload_path=str(upload_path),
            correlation_id=correlation_id,
        )

        try:
            job_queue.enqueue_nowait(job_id)
        except QueueFullError:
            repo.update_job_stage(
                job_id,
                state=JobStatus.SERVER_BUSY,
                detail="Server busy: queue capacity reached",
                error_code="server_busy",
                error_message="Queue capacity reached",
            )
            raise HTTPException(status_code=503, detail="Server busy: queue capacity reached. Retry shortly.")

        return UploadDocumentResponse(
            job_id=job.job_id,
            state=job.state,
            detail=job.detail,
            created_at=job.created_at,
        )

    @app.get(
        "/v1/document/result/{job_id}",
        tags=["Documents"],
        responses={404: {"model": ErrorResponse}},
    )
    async def get_document_result(job_id: str, repo: JobRepository = Depends(get_repository)):
        job = repo.get_job_by_id(job_id)
        events = repo.list_job_events(job_id)

        fhir_bundle = None
        if job.fhir_output_path:
            fhir_path = Path(job.fhir_output_path)
            if fhir_path.exists():
                try:
                    fhir_bundle = json.loads(fhir_path.read_text())
                except Exception:
                    fhir_bundle = None

        ocr_output = None
        if job.ocr_output_path:
            ocr_path = Path(job.ocr_output_path)
            if ocr_path.exists():
                try:
                    ocr_output = json.loads(ocr_path.read_text())
                except Exception:
                    ocr_output = None

        validation = _validate_fhir_bundle(fhir_bundle)
        stage_metrics = _extract_stage_metrics(events)

        return {
            "job": JobStatusResponse(
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
            ).model_dump(mode="json"),
            "events": events,
            "ocr_output": ocr_output,
            "fhir_bundle": fhir_bundle,
            "fhir_validation": validation,
            "stage_metrics": stage_metrics,
        }

    @app.post(
        "/v1/document/{job_id}/push-to-hapi",
        tags=["Documents"],
        responses={404: {"model": ErrorResponse}},
    )
    async def push_to_hapi(job_id: str, repo: JobRepository = Depends(get_repository)):
        """Push the saved FHIR bundle directly to HAPI FHIR JPA Server.

        Useful when the downstream delivery failed (e.g. Node.js not running)
        but you want to test the FHIR bundle against HAPI FHIR.
        """
        job = repo.get_job_by_id(job_id)

        if not job.fhir_output_path:
            raise HTTPException(
                status_code=400,
                detail="No FHIR bundle available for this job. Mapping stage not completed.",
            )

        fhir_path = Path(job.fhir_output_path)
        if not fhir_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"FHIR output file not found: {fhir_path}",
            )

        try:
            fhir_bundle = json.loads(fhir_path.read_text())
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse FHIR bundle: {exc}",
            )

        from .adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

        adapter = HapiFhirDownstreamAdapter(
            base_url=settings.hapi_fhir_base_url,
            timeout_sec=settings.downstream_stage_timeout_sec,
            max_retries=2,
        )

        try:
            result = await adapter.deliver_fhir_bundle(
                job_id=job_id,
                fhir_bundle=fhir_bundle,
            )
            return {
                "success": True,
                "status_code": result.status_code,
                "delivery_time_sec": result.delivery_time_sec,
                "created_resources": result.created_resources,
                "response_body": result.response_body,
            }
        except HapiFhirDownstreamError as exc:
            return {
                "success": False,
                "error": exc.message,
                "retry_allowed": exc.retry_allowed,
            }

    @app.get("/v1/metrics", tags=["System"])
    async def get_runtime_metrics():
        return _get_metrics_payload()

    @app.get("/metrics", tags=["System"], include_in_schema=False)
    async def get_metrics_alias():
        return _get_metrics_payload()

    def _get_metrics_payload():
        return {
            "metrics": get_metrics().get_summary(),
            "queue": {
                "size": job_queue.size(),
                "capacity": job_queue.capacity(),
                "is_full": job_queue.is_full(),
            },
        }

    @app.get("/ui", tags=["System"])
    async def pipeline_ui():
        ui_path = Path(__file__).resolve().parent / "static" / "index.html"
        if not ui_path.exists():
            raise HTTPException(status_code=404, detail="UI not found")
        return FileResponse(ui_path)

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