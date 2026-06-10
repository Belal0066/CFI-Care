"""Orchestrator for asynchronous job processing."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .adapters.downstream import DownstreamAdapter, DownstreamError
from .adapters.mapper import MapperAdapter, MapperError
from .adapters.ocr import OCRAdapter, OCRError
from .adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError
from .adapters.callback import NodeJsCallbackAdapter
from .config import GatewaySettings
from .job_event_bus import JobEventBus
from .doc_classifier import DocumentTypeClassifier
from .fhir_validator import FhirValidator
from .structured_extractor import StructuredExtractor
from .structured_pipeline import StructuredPipeline, StructuredPipelineError
from .terminology_client import TerminologyClient
from .safety_logger import SafetyLogger
from .models import CallbackErrorPayload, JobStatus
from .observability import StructuredLogger, record_job_error, record_job_metric
from .repository import JobRepository, JobNotFoundError

logger = logging.getLogger(__name__)


def _hash_file(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha256(payload).hexdigest()


def _to_instant(date_str: str | None) -> str | None:
    if not date_str:
        return None
    if "T" in date_str:
        return date_str
    return f"{date_str}T00:00:00+00:00"


def _add_cross_references(bundle: dict[str, Any]) -> None:
    doc_ref_id = None
    doc_ref_full_url = None
    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        if res.get("resourceType") == "DocumentReference":
            doc_ref_id = res.get("id")
            doc_ref_full_url = entry.get("fullUrl", "")
            break
    if not doc_ref_id:
        return

    # Use the entry fullUrl so both urn:uuid and DocumentReference/{id} styles
    # resolve correctly inside the transaction bundle.
    ref = doc_ref_full_url if doc_ref_full_url else f"urn:uuid:{doc_ref_id}"
    source_ext_url = "http://cfi-care.ai/fhir/StructureDefinition/source-document"
    source_ext = {"url": source_ext_url, "valueReference": {"reference": ref}}

    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        rtype = res.get("resourceType")

        if rtype == "Observation":
            # R5: Observation.derivedFrom — Reference(DocumentReference|...)
            derived = res.setdefault("derivedFrom", [])
            if not any(isinstance(r, dict) and r.get("reference") == ref for r in derived):
                derived.append({"reference": ref})

        elif rtype == "Composition":
            # R5: Composition.relatesTo — documents the source document
            relates = res.setdefault("relatesTo", [])
            if not any(isinstance(r, dict) and r.get("type") == "transforms" for r in relates):
                relates.append({
                    "type": "transforms",
                    "resourceReference": {"reference": ref},
                })

        elif rtype == "Condition":
            # R5: Condition.evidence — CodeableReference(Any)
            evidence = res.setdefault("evidence", [])
            if not any(
                isinstance(e, dict)
                and isinstance(e.get("reference"), dict)
                and e["reference"].get("reference") == ref
                for e in evidence
            ):
                evidence.append({"reference": {"reference": ref}})

        elif rtype == "MedicationRequest":
            # R5: MedicationRequest.supportingInformation — Reference(Any)
            supporting = res.setdefault("supportingInformation", [])
            if not any(isinstance(r, dict) and r.get("reference") == ref for r in supporting):
                supporting.append({"reference": ref})

        elif rtype == "Procedure":
            # R5: Procedure.report — Reference(DocumentReference|DiagnosticReport|Composition)
            report = res.setdefault("report", [])
            if not any(isinstance(r, dict) and r.get("reference") == ref for r in report):
                report.append({"reference": ref})

        elif rtype in {"DiagnosticReport", "AllergyIntolerance", "Basic"}:
            # No standard R5 field — use custom extension
            exts = res.setdefault("extension", [])
            if not any(isinstance(e, dict) and e.get("url") == source_ext_url for e in exts):
                exts.append(source_ext)

        elif rtype == "Provenance":
            # Update entity[0].what from hash-only identifier to direct DocumentReference reference
            for ent in res.get("entity", []):
                if isinstance(ent, dict) and ent.get("role") == "source":
                    ent["what"] = {"reference": ref}
                    break


def _stamp_composition_identifier(bundle: dict[str, Any], pdf_id: str) -> None:
    """Add the mobile pdf_id as an identifier on the Composition resource.

    The ?relates-to= HAPI search parameter is unreliable for FHIR R5 because
    the field was renamed from targetReference (R4) to resourceReference (R5)
    and many HAPI versions don't re-index it. Stamping the pdf_id as an
    identifier lets Node.js find the Composition via ?identifier=<system>|<value>,
    which is always indexed and version-independent.
    """
    system = "http://cfi-care.ai/mobile-document-id"
    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        if isinstance(res, dict) and res.get("resourceType") == "Composition":
            identifiers = res.setdefault("identifier", [])
            if not any(isinstance(i, dict) and i.get("system") == system for i in identifiers):
                identifiers.append({"system": system, "value": pdf_id})


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
        callback_adapter: Optional[NodeJsCallbackAdapter] = None,
        event_bus: Optional[JobEventBus] = None,
    ):
        """Initialize orchestrator.

        Args:
            repository: Job repository for persistence
            settings: Gateway configuration
            ocr_adapter: Optional custom OCR adapter
            mapper_adapter: Optional custom Mapper adapter
            downstream_adapter: Optional custom Downstream adapter (Node.js or HAPI FHIR)
            callback_adapter: Optional Node.js callback adapter
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
        self.callback_adapter = callback_adapter or NodeJsCallbackAdapter(
            callback_url=settings.nodejs_callback_url,
            internal_secret=settings.internal_secret,
            max_retries=settings.callback_retry_max,
            backoff_base=settings.callback_retry_backoff,
            dead_letter_dir=str(dead_letter_dir),
        )
        self._gpu_semaphore = asyncio.Semaphore(max(1, settings.gpu_max_concurrency))
        self._event_bus: JobEventBus = event_bus or JobEventBus()

    def _publish(self, job_id: str, state: str, progress: float, detail: str = "") -> None:
        """Fire-and-forget event to all WebSocket subscribers for this job."""
        self._event_bus.publish_nowait(job_id, {
            "state": state,
            "progress": progress,
            "detail": detail,
        })

    @staticmethod
    def _build_downstream_adapter(
        settings: GatewaySettings,
        dead_letter_dir: str,
    ) -> DownstreamAdapter | HapiFhirDownstreamAdapter:
        if settings.downstream_type == "hapi_fhir":
            return HapiFhirDownstreamAdapter(
                base_url=settings.hapi_fhir_base_url,
                fhir_version=settings.fhir_version,
                verify_fhir_version=True,
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
            self._publish(job_id, "OCR_PROCESSING", 10.0, "Starting OCR processing")

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
            self._publish(job_id, "MAPPING", progress, "Starting FHIR mapping")

            # Run Mapper or Structured pipeline stage with global GPU lock.
            patient_id = (job.metadata or {}).get("patient_id")
            pdf_id = (job.metadata or {}).get("pdf_id")
            if self.settings.structured_pipeline_enabled:
                fhir_output = await self._run_gpu_bound_stage(
                    job_id,
                    stage_name="structured_pipeline",
                    stage_timeout_sec=self.settings.mapper_stage_timeout_sec,
                    operation=lambda: self._run_structured_pipeline_stage(
                        job_id,
                        ocr_output,
                        job.upload_path,
                        job.filename,
                        log,
                        patient_id=patient_id,
                    ),
                    log=log,
                )
            else:
                fhir_output = await self._run_gpu_bound_stage(
                    job_id,
                    stage_name="mapper",
                    stage_timeout_sec=self.settings.mapper_stage_timeout_sec,
                    operation=lambda: self._run_mapper_stage(job_id, ocr_output["extracted_text"], job.metadata, log),
                    log=log,
                )
            progress = 70.0

            # Extract composition info from bundle for DocumentReference enrichment
            encounter_date = None
            loinc_code = None
            for entry in fhir_output["fhir_bundle"].get("entry", []):
                res = entry.get("resource", {})
                if res.get("resourceType") == "Composition":
                    encounter_date = res.get("date")
                    type_coding = res.get("type", {}).get("coding", [])
                    if type_coding:
                        loinc_code = type_coding[0].get("code")
                    break

            doc_hash = _hash_file(Path(job.upload_path))
            fhir_output["fhir_bundle"] = self._attach_pdf_to_bundle(
                fhir_output["fhir_bundle"],
                job.upload_path,
                job.filename,
                patient_id=patient_id,
                doc_hash=doc_hash,
                ocr_engine=self.settings.ocr_engine_name,
                loinc_code=loinc_code,
                encounter_date=encounter_date,
                pdf_id=pdf_id,
            )

            # Post-process: add derivedFrom to Observations and relatesTo to Composition
            _add_cross_references(fhir_output["fhir_bundle"])
            # Stamp the mobile pdf_id as an identifier on the Composition so
            # Node.js can find it via ?identifier= (more reliable than ?relates-to=).
            if pdf_id:
                _stamp_composition_identifier(fhir_output["fhir_bundle"], pdf_id)

            # Re-save modified bundle to disk so API result endpoint returns the complete bundle
            fhir_dir = self.settings.runtime_dir / "fhir_outputs"
            fhir_path = self.repository.save_fhir_output(job_id, fhir_dir, fhir_output["fhir_bundle"])

            # Store path immediately (before delivery sets COMPLETED) so the UI can find it
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.MAPPING,
                detail="FHIR bundle saved, starting delivery",
                fhir_output_path=str(fhir_path),
                progress=progress,
            )
            self._publish(job_id, "MAPPING", progress, "FHIR bundle saved, starting delivery")

            # Deliver to downstream and capture result for Neon DB verification
            downstream_result = await asyncio.wait_for(
                self._run_downstream_stage(job_id, fhir_output, job.metadata, progress, log),
                timeout=self.settings.downstream_stage_timeout_sec,
            )

            # Verify data was persisted in HAPI FHIR (Neon DB) by querying created resources back
            verification = None
            if isinstance(self.downstream_adapter, HapiFhirDownstreamAdapter) and downstream_result.created_resources:
                try:
                    sample_url = downstream_result.created_resources[0]
                    fetched = await self.downstream_adapter.verify_resource(sample_url)
                    verification = {
                        "verified_resource": sample_url,
                        "resource_type": fetched.get("resourceType"),
                        "resource_id": fetched.get("id"),
                    }
                except Exception as exc:
                    verification = {"error": str(exc)}

            # Mark as completed
            detail = "Successfully processed and delivered"
            extra = {}
            if verification:
                detail += f" — verified {verification.get('resource_type', '?')}/{verification.get('resource_id', '?')} in Neon DB"
                extra["verification"] = verification
            if downstream_result.created_resources:
                extra["created_resources"] = downstream_result.created_resources

            self.repository.update_job_stage(
                job_id,
                state=JobStatus.COMPLETED,
                detail=detail,
                progress=100.0,
                finished_at=datetime.now(timezone.utc).isoformat(),
                extra_payload=extra or None,
            )
            self._publish(job_id, "COMPLETED", 100.0, detail)

            elapsed_sec = time.time() - start_time
            record_job_metric(job_id, "end_to_end", elapsed_sec)
            log.info("Job processing completed", elapsed_sec=elapsed_sec)

            asyncio.create_task(self._fire_callback(
                job_id=job_id,
                status="COMPLETED",
                log=log,
            ))

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
            self._publish(job_id, "SERVER_BUSY", 0.0, str(exc))
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
            self._publish(job_id, "FAILED", 0.0, f"Stage timeout: {exc.stage}")
            asyncio.create_task(self._fire_callback(
                job_id=job_id,
                status="FAILED",
                error_code="stage_timeout",
                error_message=str(exc),
                log=log,
            ))
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
            asyncio.create_task(self._fire_callback(
                job_id=job_id,
                status="FAILED",
                error_code="stage_timeout",
                error_message=f"downstream exceeded timeout of {timeout}s",
                log=log,
            ))
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

            asyncio.create_task(self._fire_callback(
                job_id=job_id,
                status="FAILED",
                error_code=current_job.error_code or type(exc).__name__,
                error_message=current_job.error_message or str(exc)[:500],
                log=log,
            ))

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
            self._publish(job_id, "OCR_PROCESSING", 35.0, f"OCR completed in {ocr_result.processing_time_sec:.1f}s")
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

    async def _run_structured_pipeline_stage(
        self,
        job_id: str,
        ocr_output: dict[str, Any],
        upload_path: str,
        filename: str,
        log: StructuredLogger | None = None,
        patient_id: str | None = None,
    ) -> dict[str, Any]:
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)

        try:
            log.info("Starting structured extraction pipeline")
            schema_path = (Path(__file__).resolve().parent.parent / "Mapper" / "schemas" / "r5" / "fhir.schema.json")
            validator = FhirValidator(
                schema_path=schema_path,
                validator_jar=Path(self.settings.fhir_validator_jar) if self.settings.fhir_validator_jar else None,
                enable_jar=self.settings.fhir_validator_enabled,
            )
            classifier = DocumentTypeClassifier(
                base_url=self.settings.mapper_base_url,
                model_name=self.settings.classifier_model_name,
                timeout_sec=self.settings.request_timeout_sec,
            )
            extractor = StructuredExtractor(
                base_url=self.settings.mapper_base_url,
                model_name=self.settings.structured_model_name,
                timeout_sec=self.settings.request_timeout_sec,
                output_mode=self.settings.structured_output_mode,
            )
            terminology = TerminologyClient(
                base_url=self.settings.terminology_base_url,
                api_key=self.settings.terminology_api_key,
            )
            safety_logger = SafetyLogger(logger)
            pipeline = StructuredPipeline(
                classifier=classifier,
                extractor=extractor,
                validator=validator,
                terminology=terminology,
                safety_logger=safety_logger,
            )

            output = pipeline.run(
                ocr_text=ocr_output.get("extracted_text", ""),
                layouts=ocr_output.get("layouts", []),
                upload_path=Path(upload_path),
                filename=filename,
                ocr_engine=self.settings.ocr_engine_name,
                model_version=self.settings.structured_model_name,
                patient_id=patient_id,
            )

            runtime_dir = self.settings.runtime_dir
            normalized_dir = runtime_dir / "normalized_outputs"
            classification_dir = runtime_dir / "classification_outputs"
            extraction_dir = runtime_dir / "extraction_outputs"

            normalized_path = self.repository.save_normalized_output(job_id, normalized_dir, output.normalized)
            classification_path = self.repository.save_classification_output(job_id, classification_dir, output.classification)
            extraction_path = self.repository.save_intermediate_output(job_id, extraction_dir, output.extraction)

            self.repository.update_job_stage(
                job_id,
                state=JobStatus.MAPPING,
                detail="Structured extraction completed",
                progress=65.0,
                extra_payload={
                    "normalized_output_path": str(normalized_path),
                    "classification_output_path": str(classification_path),
                    "extraction_output_path": str(extraction_path),
                    "review_required": output.review_required,
                    "warnings": output.warnings,
                },
            )

            return {
                "fhir_bundle": output.bundle,
                "raw_response": output.extraction,
            }

        except StructuredPipelineError as exc:
            log.error("Structured pipeline failed", exception=exc)
            record_job_error(job_id, "structured_pipeline_error")
            self.repository.update_job_stage(
                job_id,
                state=JobStatus.FAILED,
                detail=f"Structured pipeline failed: {exc}",
                error_code="structured_pipeline_error",
                error_message=str(exc)[:500],
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
    ) -> Any:
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

            return downstream_result

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

    async def _fire_callback(
        self,
        job_id: str,
        status: str,
        error_code: str | None = None,
        error_message: str | None = None,
        log: StructuredLogger | None = None,
    ) -> None:
        """Fire a job status callback to the Node.js backend (fire-and-forget).

        This is non-blocking from the orchestrator's perspective.
        If the callback adapter is disabled (empty URL), this is a no-op.
        """
        if log is None:
            log = StructuredLogger(logger, correlation_id=job_id)
        if not self.settings.nodejs_callback_url:
            return
        try:
            error_payload = None
            if error_code:
                error_payload = CallbackErrorPayload(code=error_code, message=error_message or "")
            result = await self.callback_adapter.send(
                job_id=job_id,
                status=status,
                completed_at=datetime.now(timezone.utc).isoformat(),
                error=error_payload,
            )
            if not result.success:
                log.warning(
                    "Callback delivery failed",
                    job_id=job_id,
                    status_code=result.status_code,
                    error=result.error,
                )
        except Exception as exc:
            log.error("Callback adapter threw", exception=exc, job_id=job_id)

    # Maps LOINC codes to their correct display names for DocumentReference.type
    _LOINC_DISPLAY: dict[str, str] = {
        "11502-2": "Laboratory report",
        "57833-6": "Prescription for medication",
        "18842-5": "Discharge summary",
        "18748-4": "Diagnostic imaging study",
        "34117-4": "History and physical note",
        "11369-6": "Immunization record",
    }

    @staticmethod
    def _attach_pdf_to_bundle(
        fhir_bundle: dict[str, Any],
        upload_path: str,
        filename: str,
        patient_id: str | None = None,
        doc_hash: str | None = None,
        ocr_engine: str | None = None,
        loinc_code: str | None = None,
        encounter_date: str | None = None,
        pdf_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a Binary resource for the PDF and a DocumentReference pointing to it.

        Stores the raw PDF in a FHIR Binary resource and references it from
        DocumentReference.content[0].attachment.url. If the bundle already contains
        a DocumentReference the Binary url is appended to its content list.

        Args:
            fhir_bundle: FHIR R5 bundle dict
            upload_path: Path to the uploaded PDF file
            filename: Original filename for the title field
            patient_id: External patient ID for subject reference
            doc_hash: Document hash for identifier
            ocr_engine: OCR engine name for author
            loinc_code: LOINC code for type
            encounter_date: Document date (instant)

        Returns:
            Modified FHIR bundle with Binary and DocumentReference entries
        """
        try:
            pdf_path = Path(upload_path)
            if not pdf_path.exists():
                logger.warning("Upload file not found, skipping PDF attachment: %s", upload_path)
                return fhir_bundle

            raw_bytes = pdf_path.read_bytes()
            b64_data = base64.b64encode(raw_bytes).decode("ascii")
            b64_data = "".join(b64_data.split())
            file_size = len(raw_bytes)

            # ── Binary resource ──────────────────────────────────────────────
            binary_uuid = str(uuid.uuid4())
            binary_resource: dict[str, Any] = {
                "resourceType": "Binary",
                "id": binary_uuid,
                "contentType": "application/pdf",
                "data": b64_data,
            }
            binary_entry: dict[str, Any] = {
                "fullUrl": f"urn:uuid:{binary_uuid}",
                "resource": binary_resource,
                "request": {"method": "PUT", "url": f"Binary/{binary_uuid}"},
            }

            # ── Attachment that references the Binary ────────────────────────
            attachment: dict[str, Any] = {
                "contentType": "application/pdf",
                "url": f"Binary/{binary_uuid}",
                "size": str(file_size),  # integer64 in FHIR R5 is serialised as a JSON string
                "title": filename,
                "creation": _to_instant(encounter_date) or datetime.now(timezone.utc).isoformat(),
            }
            loinc_display = JobOrchestrator._LOINC_DISPLAY.get(loinc_code or "", "Clinical document") if loinc_code else None

            # ── DocumentReference resource ───────────────────────────────────
            doc_ref_uuid = str(uuid.uuid4())
            # Use pdf_id as the FHIR resource id (and in request.url so HAPI stores
            # it under that id). The fullUrl stays urn:uuid: so it remains a valid
            # absolute URL and bundle-internal cross-references resolve correctly.
            doc_ref_fhir_id = pdf_id if pdf_id else doc_ref_uuid
            doc_ref_resource: dict[str, Any] = {
                "resourceType": "DocumentReference",
                "id": doc_ref_fhir_id,
                "status": "current",
                "docStatus": "final",
                "text": {
                    "status": "generated",
                    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for DocumentReference</div>",
                },
                "description": "Scanned lab report processed via DOC2FHIR",
                "content": [{"attachment": attachment}],
            }
            if loinc_code and loinc_display:
                doc_ref_resource["type"] = {
                    "coding": [{"system": "http://loinc.org", "code": loinc_code, "display": loinc_display}],
                    "text": loinc_display,
                }
            if patient_id:
                doc_ref_resource["subject"] = {"reference": f"Patient/{patient_id}"}
            if encounter_date:
                doc_ref_resource["date"] = _to_instant(encounter_date)
            if ocr_engine:
                doc_ref_resource["author"] = [{"display": ocr_engine}]
            if doc_hash:
                doc_ref_resource.setdefault("identifier", []).append(
                    {"system": "http://cfi-care.ai/document-hash", "value": doc_hash},
                )
            if pdf_id:
                doc_ref_resource.setdefault("identifier", []).append(
                    {"system": "http://cfi-care.ai/mobile-document-id", "value": pdf_id},
                )

            doc_ref_entry: dict[str, Any] = {
                "fullUrl": f"urn:uuid:{doc_ref_uuid}",
                "resource": doc_ref_resource,
                "request": {"method": "PUT", "url": f"DocumentReference/{doc_ref_fhir_id}"},
            }

            entries = fhir_bundle.get("entry", [])
            if not isinstance(entries, list):
                entries = []

            # Check for existing DocumentReference to enrich instead of creating a new one
            existing_doc_ref_idx = None
            for idx, entry in enumerate(entries):
                res = entry.get("resource") if isinstance(entry, dict) else None
                if isinstance(res, dict) and res.get("resourceType") == "DocumentReference":
                    existing_doc_ref_idx = idx
                    break

            if existing_doc_ref_idx is not None:
                res = entries[existing_doc_ref_idx]["resource"]
                # Override the FHIR resource ID with the mobile-local pdf_id so
                # HAPI FHIR stores the DocumentReference under the same ID.
                if pdf_id:
                    res["id"] = pdf_id
                    existing_entry = entries[existing_doc_ref_idx]
                    # Keep fullUrl as urn:uuid so it stays a valid absolute URL and
                    # bundle-internal cross-references continue to resolve. Only
                    # request.url tells HAPI FHIR which resource ID to store it under.
                    existing_entry["request"] = {"method": "PUT", "url": f"DocumentReference/{pdf_id}"}
                if not isinstance(res.get("content"), list):
                    res["content"] = []
                # Keep existing url-based attachments, drop any stale embedded data
                cleaned_content = [
                    item for item in res["content"]
                    if isinstance(item, dict)
                    and isinstance(item.get("attachment"), dict)
                    and item["attachment"].get("url")
                ]
                cleaned_content.append({"attachment": attachment})
                res["content"] = cleaned_content
                # Enrich metadata only if not already set
                res.setdefault("docStatus", "final")
                res.setdefault("description", "Scanned lab report processed via DOC2FHIR")
                if loinc_code and loinc_display and "type" not in res:
                    res["type"] = {
                        "coding": [{"system": "http://loinc.org", "code": loinc_code, "display": loinc_display}],
                        "text": loinc_display,
                    }
                if encounter_date and "date" not in res:
                    res["date"] = _to_instant(encounter_date)
                if ocr_engine and "author" not in res:
                    res["author"] = [{"display": ocr_engine}]
                if patient_id and "subject" not in res:
                    res["subject"] = {"reference": f"Patient/{patient_id}"}
                if doc_hash:
                    existing_identifiers = res.setdefault("identifier", [])
                    if not any(i.get("system") == "http://cfi-care.ai/document-hash" for i in existing_identifiers):
                        existing_identifiers.append(
                            {"system": "http://cfi-care.ai/document-hash", "value": doc_hash},
                        )
                if pdf_id:
                    existing_identifiers = res.setdefault("identifier", [])
                    if not any(i.get("system") == "http://cfi-care.ai/mobile-document-id" for i in existing_identifiers):
                        existing_identifiers.append(
                            {"system": "http://cfi-care.ai/mobile-document-id", "value": pdf_id},
                        )
                # Prepend Binary entry before the existing DocumentReference
                entries.insert(existing_doc_ref_idx, binary_entry)
                logger.info("Injected Binary+url into existing DocumentReference at index %d", existing_doc_ref_idx)
            else:
                # Prepend Binary first, then DocumentReference
                entries.insert(0, doc_ref_entry)
                entries.insert(0, binary_entry)
                fhir_bundle["entry"] = entries
                logger.info("Created new Binary and DocumentReference entries for PDF attachment")

            # Sanitize all DocumentReference content: remove format, drop items with neither url nor data
            for entry in entries:
                res = entry.get("resource") if isinstance(entry, dict) else None
                if not isinstance(res, dict) or res.get("resourceType") != "DocumentReference":
                    continue
                content_items = res.get("content")
                if not isinstance(content_items, list):
                    continue
                cleaned_items = []
                for item in content_items:
                    if not isinstance(item, dict):
                        continue
                    item.pop("format", None)
                    att = item.get("attachment")
                    if isinstance(att, dict):
                        # Drop embedded data when a url is already present
                        if att.get("url") and att.get("data"):
                            att.pop("data", None)
                        if not att.get("url") and not att.get("data"):
                            continue
                    cleaned_items.append(item)
                res["content"] = cleaned_items

        except Exception as exc:
            logger.warning("Failed to attach PDF to bundle: %s", exc)

        return fhir_bundle
