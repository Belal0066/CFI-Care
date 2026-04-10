"""Orchestrator for asynchronous job processing."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .adapters.downstream import DownstreamAdapter, DownstreamError
from .adapters.mapper import MapperAdapter, MapperError
from .adapters.ocr import OCRAdapter, OCRError
from .config import GatewaySettings
from .models import JobStatus
from .observability import StructuredLogger, record_job_error, record_job_metric
from .repository import JobRepository, JobNotFoundError

logger = logging.getLogger(__name__)


class JobOrchestrator:
    """Orchestrates job processing through OCR, Mapper, and downstream delivery."""

    def __init__(
        self,
        repository: JobRepository,
        settings: GatewaySettings,
        ocr_adapter: Optional[OCRAdapter] = None,
        mapper_adapter: Optional[MapperAdapter] = None,
        downstream_adapter: Optional[DownstreamAdapter] = None,
    ):
        """Initialize orchestrator.

        Args:
            repository: Job repository for persistence
            settings: Gateway configuration
            ocr_adapter: Optional custom OCR adapter
            mapper_adapter: Optional custom Mapper adapter
            downstream_adapter: Optional custom Downstream adapter
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
        self.downstream_adapter = downstream_adapter or DownstreamAdapter(
            base_url=settings.downstream_docfhir_url,
            timeout_sec=30,
            dead_letter_dir=str(dead_letter_dir),
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

            # Run OCR stage
            ocr_output = await self._run_ocr_stage(job_id, job.upload_path, log)
            progress = 40.0

            # Transition to Mapping
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.MAPPING,
                detail="Starting FHIR mapping",
                progress=progress,
            )

            # Run Mapper stage
            fhir_output = await self._run_mapper_stage(job_id, ocr_output["extracted_text"], job.metadata, log)
            progress = 70.0

            # Deliver to downstream
            await self._run_downstream_stage(job_id, fhir_output, job.metadata, progress, log)

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

        except JobNotFoundError:
            log.error(f"Job not found during processing")
            raise
        except Exception as exc:
            elapsed_sec = time.time() - start_time
            log.error("Job processing failed", exception=exc, elapsed_sec=elapsed_sec)
            record_job_error(job_id, type(exc).__name__)
            self._handle_job_error(job_id, exc, log)

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

        Args:
            job_id: Job ID
            mapper_output: Output from mapper stage
            metadata: Optional job metadata
            progress: Current progress percentage
            log: Optional structured logger

        Raises:
            DownstreamError: If delivery fails after retries
        """
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)

        try:
            fhir_bundle = mapper_output.get("fhir_bundle", {})
            log.info("Starting downstream delivery")

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

        except DownstreamError as exc:
            log.error("Downstream delivery failed", exception=exc)
            record_job_error(job_id, "downstream_error")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Downstream delivery failed: {exc.message}",
                error_code="downstream_error",
                error_message=exc.message,
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
