"""Orchestrator for asynchronous job processing."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .adapters.downstream import DownstreamAdapter, DownstreamError
from .adapters.mapper import MapperAdapter, MapperError
from .adapters.ocr import OCRAdapter, OCRError
from .adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError
from .config import GatewaySettings
from .models import JobStatus
from .observability import StructuredLogger, record_job_error, record_job_metric
from .repository import JobRepository, JobNotFoundError

logger = logging.getLogger(__name__)


class ServerBusyError(RuntimeError):
    """Raised when GPU lock contention exceeds configured timeout."""


class StageTimeoutError(TimeoutError):
    """Raised when a processing stage exceeds its configured timeout."""

    def __init__(self, stage: str, timeout_sec: int):
        super().__init__(f"{stage} exceeded timeout of {timeout_sec}s")
        self.stage = stage
        self.timeout_sec = timeout_sec


class JobOrchestrator:
    """Orchestrates job processing through OCR, Mapper, and downstream delivery."""

    def __init__(
        self,
        repository: JobRepository,
        settings: GatewaySettings,
        ocr_adapter: Optional[OCRAdapter] = None,
        mapper_adapter: Optional[MapperAdapter] = None,
        downstream_adapter: Optional[DownstreamAdapter | HapiFhirDownstreamAdapter] = None,
    ):
        """Initialize orchestrator.

        Args:
            repository: Job repository for persistence
            settings: Gateway configuration
            ocr_adapter: Optional custom OCR adapter
            mapper_adapter: Optional custom Mapper adapter
            downstream_adapter: Optional custom Downstream adapter (Node.js or HAPI FHIR)
        """
        self.repository = repository
        self.settings = settings
        self.ocr_adapter = ocr_adapter or OCRAdapter(
            base_url=settings.ocr_base_url,
            timeout_sec=settings.request_timeout_sec,
        )
        self.mapper_adapter = mapper_adapter or MapperAdapter(
            base_url=settings.mapper_base_url,
            timeout_sec=settings.request_timeout_sec,
        )
        dead_letter_dir = settings.runtime_dir / "dead_letters"
        self.downstream_adapter = downstream_adapter or self._build_downstream_adapter(
            settings, str(dead_letter_dir),
        )
        self._gpu_semaphore = asyncio.Semaphore(max(1, settings.gpu_max_concurrency))

    @staticmethod
    def _build_downstream_adapter(
        settings: GatewaySettings,
        dead_letter_dir: str,
    ) -> DownstreamAdapter | HapiFhirDownstreamAdapter:
        if settings.downstream_type == "hapi_fhir":
            return HapiFhirDownstreamAdapter(
                base_url=settings.hapi_fhir_base_url,
                timeout_sec=settings.downstream_stage_timeout_sec,
                max_retries=3,
                dead_letter_dir=dead_letter_dir,
            )
        return DownstreamAdapter(
            base_url=settings.downstream_docfhir_url,
            timeout_sec=30,
            dead_letter_dir=dead_letter_dir,
        )

    async def process_job(self, job_id: str) -> None:
        """Process a single job through the pipeline.

        Drives job through: OCR_PROCESSING -> MAPPING -> COMPLETED/FAILED

        Args:
            job_id: Job ID to process

        Raises:
            JobNotFoundError: If job doesn't exist
        """
        log = StructuredLogger(logger, correlation_id=job_id)
        start_time = time.time()

        try:
            job = self.repository.get_job_by_id(job_id)
            log.info("Starting job processing", filename=job.filename, metadata=job.metadata)

            # Transition to OCR processing
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.OCR_PROCESSING,
                detail="Starting OCR processing",
                started_at=datetime.now(timezone.utc).isoformat(),
                progress=10.0,
            )

            # Run OCR stage with global GPU lock.
            ocr_output = await self._run_gpu_bound_stage(
                job_id,
                stage_name="ocr",
                stage_timeout_sec=self.settings.ocr_stage_timeout_sec,
                operation=lambda: self._run_ocr_stage(job_id, job.upload_path, log),
                log=log,
            )
            progress = 40.0

            # Transition to Mapping
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.MAPPING,
                detail="Starting FHIR mapping",
                progress=progress,
            )

            # Run Mapper stage with global GPU lock.
            fhir_output = await self._run_gpu_bound_stage(
                job_id,
                stage_name="mapper",
                stage_timeout_sec=self.settings.mapper_stage_timeout_sec,
                operation=lambda: self._run_mapper_stage(job_id, ocr_output["extracted_text"], job.metadata, log),
                log=log,
            )
            progress = 70.0

            # Deliver to downstream
            await asyncio.wait_for(
                self._run_downstream_stage(job_id, fhir_output, job.metadata, progress, log),
                timeout=self.settings.downstream_stage_timeout_sec,
            )

            # Mark as completed
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.COMPLETED,
                detail="Successfully processed and delivered",
                progress=100.0,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )

            elapsed_sec = time.time() - start_time
            record_job_metric(job_id, "end_to_end", elapsed_sec)
            log.info("Job processing completed", elapsed_sec=elapsed_sec)

        except ServerBusyError as exc:
            log.warning("Job delayed due to GPU contention", detail=str(exc))
            record_job_error(job_id, "server_busy")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.SERVER_BUSY,
                detail=str(exc),
                error_code="server_busy",
                error_message=str(exc),
            )
        except StageTimeoutError as exc:
            log.error("Stage timeout", stage=exc.stage, timeout_sec=exc.timeout_sec)
            record_job_error(job_id, "stage_timeout")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Stage timeout: {exc.stage}",
                error_code="stage_timeout",
                error_message=str(exc),
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
        except asyncio.TimeoutError:
            timeout = self.settings.downstream_stage_timeout_sec
            log.error("Downstream stage timeout", timeout_sec=timeout)
            record_job_error(job_id, "downstream_timeout")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail="Stage timeout: downstream",
                error_code="stage_timeout",
                error_message=f"downstream exceeded timeout of {timeout}s",
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
        except JobNotFoundError:
            log.error(f"Job not found during processing")
            raise
        except Exception as exc:
            elapsed_sec = time.time() - start_time
            log.error("Job processing failed", exception=exc, elapsed_sec=elapsed_sec)
            record_job_error(job_id, type(exc).__name__)
            current_job = self.repository.get_job_by_id(job_id)
            if current_job.state not in {JobStatus.FAILED, JobStatus.SERVER_BUSY, JobStatus.COMPLETED}:
                self._handle_job_error(job_id, exc, log)

    async def _run_gpu_bound_stage(
        self,
        job_id: str,
        stage_name: str,
        stage_timeout_sec: int,
        operation,
        log: StructuredLogger,
    ) -> dict[str, Any]:
        """Run an OCR/Mapper stage under shared GPU contention controls."""
        try:
            await asyncio.wait_for(self._gpu_semaphore.acquire(), timeout=self.settings.gpu_lock_timeout_sec)
        except asyncio.TimeoutError as exc:
            raise ServerBusyError(
                f"Server busy: GPU lock contention while waiting for {stage_name} stage"
            ) from exc

        try:
            return await asyncio.wait_for(operation(), timeout=stage_timeout_sec)
        except asyncio.TimeoutError as exc:
            raise StageTimeoutError(stage_name, stage_timeout_sec) from exc
        finally:
            self._gpu_semaphore.release()

    async def _run_ocr_stage(self, job_id: str, upload_path: str, log: StructuredLogger) -> dict[str, Any]:
        """Run OCR processing stage.

        Args:
            job_id: Job ID
            upload_path: Path to uploaded file
            log: Structured logger

        Returns:
            Normalized OCR output

        Raises:
            OCRError: If OCR fails
        """
        try:
            file_path = Path(upload_path)
            log.info("Starting OCR processing", file_path=str(file_path))
            ocr_result = self.ocr_adapter.process_document(file_path)

            # Persist OCR output
            ocr_dir = self.settings.runtime_dir / "ocr_outputs"
            ocr_path = self.repository.save_ocr_output(job_id, ocr_dir, ocr_result.to_dict())

            record_job_metric(job_id, "ocr", ocr_result.processing_time_sec)

            # Update job with OCR result
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.OCR_PROCESSING,
                detail=f"OCR completed in {ocr_result.processing_time_sec:.2f}s",
                ocr_output_path=str(ocr_path),
                progress=35.0,
                extra_payload={
                    "ocr_time_sec": ocr_result.processing_time_sec,
                    "text_length": len(ocr_result.extracted_text),
                },
            )

            log.info("OCR stage completed", ocr_time_sec=ocr_result.processing_time_sec, text_length=len(ocr_result.extracted_text))
            return ocr_result.to_dict()

        except OCRError as exc:
            log.error("OCR stage failed", exception=exc, error_type=exc.error_type.value)
            record_job_error(job_id, exc.error_type.value)
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"OCR failed: {exc.message}",
                error_code=exc.error_type.value,
                error_message=exc.message,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            raise

    async def _run_mapper_stage(
        self,
        job_id: str,
        ocr_text: str,
        metadata: dict[str, Any] | None = None,
        log: StructuredLogger | None = None,
    ) -> dict[str, Any]:
        """Run Mapper/FHIR processing stage.

        Args:
            job_id: Job ID
            ocr_text: Extracted text from OCR
            metadata: Optional job metadata
            log: Optional structured logger

        Returns:
            FHIR bundle output

        Raises:
            MapperError: If mapping fails
        """
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)

        try:
            log.info("Starting mapper stage")
            mapper_result = self.mapper_adapter.map_to_fhir(ocr_text, metadata)

            # Persist FHIR output
            fhir_dir = self.settings.runtime_dir / "fhir_outputs"
            fhir_path = self.repository.save_fhir_output(job_id, fhir_dir, mapper_result.fhir_bundle)

            record_job_metric(job_id, "mapper", mapper_result.processing_time_sec)

            # Update job with Mapper result
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.MAPPING,
                detail=f"Mapping completed in {mapper_result.processing_time_sec:.2f}s",
                fhir_output_path=str(fhir_path),
                progress=65.0,
                extra_payload={
                    "mapper_time_sec": mapper_result.processing_time_sec,
                    "model": mapper_result.model_name,
                    "bundle_type": mapper_result.fhir_bundle.get("resourceType", "unknown"),
                },
            )

            log.info("Mapper stage completed", mapper_time_sec=mapper_result.processing_time_sec, bundle_type=mapper_result.fhir_bundle.get("resourceType", "unknown"))
            return mapper_result.to_dict()

        except MapperError as exc:
            log.error("Mapper stage failed", exception=exc)
            record_job_error(job_id, "mapper_error")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Mapping failed: {exc.message}",
                error_code="mapper_error",
                error_message=exc.message,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            raise

    async def _run_downstream_stage(
        self,
        job_id: str,
        mapper_output: dict[str, Any],
        metadata: dict[str, Any] | None = None,
        progress: float = 70.0,
        log: StructuredLogger | None = None,
    ) -> None:
        """Run downstream delivery stage.

        Supports both sync (DownstreamAdapter for Node.js) and
        async (HapiFhirDownstreamAdapter for HAPI FHIR) backends.

        Raises:
            DownstreamError: If delivery fails after retries
        """
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)

        try:
            fhir_bundle = mapper_output.get("fhir_bundle", {})
            log.info("Starting downstream delivery")

            if isinstance(self.downstream_adapter, HapiFhirDownstreamAdapter):
                downstream_result = await self.downstream_adapter.deliver_fhir_bundle(
                    job_id,
                    fhir_bundle,
                    metadata,
                )
            else:
                downstream_result = self.downstream_adapter.deliver_fhir_bundle(
                    job_id,
                    fhir_bundle,
                    metadata,
                )

            record_job_metric(job_id, "downstream", downstream_result.delivery_time_sec)

            # Update job with delivery result
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.COMPLETED if downstream_result.success else JobStatus.FAILED,
                detail=f"Downstream delivery: HTTP {downstream_result.status_code}",
                progress=progress + 20.0,
                extra_payload={
                    "delivery_time_sec": downstream_result.delivery_time_sec,
                    "downstream_status": downstream_result.status_code,
                },
            )

            log.info("Downstream delivery completed", status_code=downstream_result.status_code, delivery_time_sec=downstream_result.delivery_time_sec)

            if not downstream_result.success:
                raise DownstreamError(
                    f"Downstream rejected with {downstream_result.status_code}",
                    retry_allowed=False,
                )

        except (DownstreamError, HapiFhirDownstreamError) as exc:
            log.error("Downstream delivery failed", exception=exc)
            record_job_error(job_id, "downstream_error")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Downstream delivery failed: {exc.message}",
                error_code="downstream_error",
                error_message=str(exc.message)[:500],
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            raise

    def _handle_job_error(self, job_id: str, error: Exception, log: StructuredLogger | None = None) -> None:
        """Handle unexpected errors during job processing.

        Args:
            job_id: Job ID
            error: The exception that occurred
            log: Optional structured logger
        """
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)

        try:
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Processing failed: {type(error).__name__}",
                error_code="internal_error",
                error_message=str(error)[:500],
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as db_error:
            log.error("Failed to update job with error", exception=db_error)
