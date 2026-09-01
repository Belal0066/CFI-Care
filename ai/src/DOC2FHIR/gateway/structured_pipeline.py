from __future__ import annotations

import hashlib
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from .doc_classifier import DocumentTypeClassifier
from .fhir_mapper import MappingContext, map_to_fhir
from .fhir_validator import FhirValidator
from .intermediate_schema import IntermediateDocument
from .ocr_normalizer import ground_evidence_span, normalize_ocr_output
from .provenance_builder import build_provenance
from .reference_resolver import ReferenceResolver
from .safety_logger import SafetyLogger
from .structured_extractor import StructuredExtractor
from .terminology_client import TerminologyClient


@dataclass
class StructuredPipelineOutput:
    bundle: dict[str, Any]
    normalized: dict[str, Any]
    classification: dict[str, Any]
    extraction: dict[str, Any]
    review_required: bool
    warnings: list[str]


class StructuredPipelineError(RuntimeError):
    pass


def _hash_file(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha256(payload).hexdigest()


def _confidence_policy(extraction: IntermediateDocument) -> tuple[bool, list[str]]:
    review_required = False
    warnings: list[str] = []

    def inspect(label: str, confidence: float, text: str | None) -> None:
        nonlocal review_required
        if confidence < 0.6:
            review_required = True
            warnings.append(f"{label} low confidence: {text}")
        elif confidence < 0.9:
            warnings.append(f"{label} warning confidence: {text}")

    for cond in extraction.conditions or []:
        inspect("condition", getattr(cond, "confidence", 0.0), getattr(cond, "text", None))
    for med in extraction.medications or []:
        inspect("medication", getattr(med, "confidence", 0.0), getattr(med, "name", None))
    for obs in extraction.observations or []:
        inspect("observation", getattr(obs, "confidence", 0.0), getattr(obs, "name", None) or getattr(obs, "text", None))
    # allergies and procedures may not exist in the IntermediateDocument model
    for allergy in getattr(extraction, "allergies", []) or []:
        inspect("allergy", getattr(allergy, "confidence", 0.0), getattr(allergy, "text", None))
    for proc in getattr(extraction, "procedures", []) or []:
        inspect("procedure", getattr(proc, "confidence", 0.0), getattr(proc, "text", None))

    return review_required, warnings


def _iter_entities_with_evidence(extraction: IntermediateDocument):
    for field in ("conditions", "medications", "observations", "allergies", "procedures"):
        for item in getattr(extraction, field, None) or []:
            yield item


def _ground_extraction_evidence(
    extraction: IntermediateDocument,
    layout_blocks: list[dict[str, Any]],
    clean_text: str,
) -> None:
    """
    Overwrites each entity's evidence.start/end/page/bbox with values
    deterministically grounded against the real OCR layout blocks, in
    place of whatever the LLM extractor reported for those fields (it can
    report which text supports a claim; it cannot know real offsets or
    page coordinates). evidence.text — the LLM's own account of which
    span it used — is left untouched; only the geometry is replaced.
    """
    if not layout_blocks:
        return
    for item in _iter_entities_with_evidence(extraction):
        evidence = getattr(item, "evidence", None)
        if evidence is None or not evidence.text:
            continue
        grounded = ground_evidence_span(evidence.text, layout_blocks, clean_text)
        if grounded is None:
            continue
        evidence.start = grounded["start"]
        evidence.end = grounded["end"]
        if grounded["page"] is not None:
            evidence.page = grounded["page"]
        if grounded["bbox"] is not None:
            evidence.bbox = grounded["bbox"]


def _extract_ids(resources: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    patient_id = None
    encounter_id = None
    for res in resources:
        if not isinstance(res, dict):
            continue
        if res.get("resourceType") == "Patient" and res.get("id"):
            patient_id = res.get("id")
        if res.get("resourceType") == "Encounter" and res.get("id"):
            encounter_id = res.get("id")
    return patient_id, encounter_id


def _unmapped_sections_basic_resource(
    unmapped_sections: list[str],
    patient_id: str | None = None,
) -> dict[str, Any] | None:
    if not unmapped_sections:
        return None
    resource: dict[str, Any] = {
        "resourceType": "Basic",
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Basic resource containing unmapped clinical document sections.</div>",
        },
        "code": {
            "coding": [
                {
                    "system": "http://cfi-care.ai/fhir/CodeSystem/unmapped-sections",
                    "code": "unmapped-sections",
                }
            ],
            "text": "Unmapped Sections",
        },
        "extension": [
            {
                "url": "http://cfi-care.ai/fhir/StructureDefinition/unmapped-sections",
                "extension": [
                    {"url": "text", "valueString": text}
                    for text in unmapped_sections
                    if text
                ],
            }
        ],
    }
    if patient_id:
        resource["subject"] = {"reference": f"Patient/{patient_id}"}
    return resource


class StructuredPipeline:
    def __init__(
        self,
        classifier: DocumentTypeClassifier,
        extractor: StructuredExtractor,
        validator: FhirValidator,
        terminology: TerminologyClient,
        safety_logger: SafetyLogger,
    ):
        self.classifier = classifier
        self.extractor = extractor
        self.validator = validator
        self.terminology = terminology
        self.safety_logger = safety_logger

    def run(
        self,
        ocr_text: str,
        layouts: list[dict[str, Any]],
        upload_path: Path,
        filename: str,
        ocr_engine: str,
        model_version: str,
        patient_id: str | None = None,
    ) -> StructuredPipelineOutput:
        normalized = normalize_ocr_output(ocr_text, layouts)
        try:
            classification = self.classifier.classify(normalized.clean_text)
        except Exception as exc:
            raise StructuredPipelineError(f"classification failed: {type(exc).__name__}: {exc}") from exc

        try:
            extraction = self.extractor.extract(normalized.clean_text, classification.doc_type)
        except Exception as exc:
            raise StructuredPipelineError(f"extraction failed: {type(exc).__name__}: {exc}") from exc

        try:
            summary = self.extractor.summarize(extraction)
            if summary:
                extraction.document_summary = summary
        except Exception as exc:
            logger.warning("pipeline: summarize raised unexpectedly: %s: %s", type(exc).__name__, exc)

        _ground_extraction_evidence(extraction, normalized.layout_blocks, normalized.clean_text)

        review_required, warnings = _confidence_policy(extraction)
        for warn in warnings:
            self.safety_logger.log_confidence("warning", warn, 0.0)

        doc_hash = _hash_file(upload_path)
        ctx = MappingContext(
            document_hash=doc_hash,
            source_filename=filename,
            ocr_engine=ocr_engine,
            model_version=model_version,
            encounter_date=extraction.encounter.date if extraction.encounter else None,
            patient_id=patient_id,
        )

        resources = map_to_fhir(extraction, ctx)
        if patient_id:
            resolver = ReferenceResolver(patient_id, None, external_patient_id=patient_id)
        else:
            pid, encounter_id = _extract_ids(resources)
            resolver = ReferenceResolver(pid, encounter_id)
        resources = resolver.apply(resources)

        resources = [self.terminology.enrich_condition(r) for r in resources]

        provenance = build_provenance(resources, doc_hash, ocr_engine, model_version, patient_id=patient_id)
        resources.extend(provenance)

        bundle = resolver.to_bundle(resources, should_skip_patient=bool(patient_id))
        basic = _unmapped_sections_basic_resource(extraction.unmapped_sections, patient_id=patient_id)
        if basic:
            stable_basic_id = str(uuid.uuid5(
                uuid.UUID("2c4a93f2-8b62-4f61-9b1a-3f76df6522a2"),
                f"Basic:{doc_hash}",
            ))
            basic["id"] = stable_basic_id
            bundle["entry"].append(
                {
                    "fullUrl": f"urn:uuid:{stable_basic_id}",
                    "resource": basic,
                    "request": {"method": "PUT", "url": f"Basic/{stable_basic_id}"},
                }
            )

        validation = self.validator.validate_bundle(bundle)
        if not validation.ok:
            self.safety_logger.log_validation_errors(validation.errors)
            logger.warning("FHIR validation failed (non-fatal): %s", "; ".join(validation.errors[:3]))

        return StructuredPipelineOutput(
            bundle=bundle,
            normalized={
                "raw_text": normalized.raw_text,
                "clean_text": normalized.clean_text,
                "layout_blocks": normalized.layout_blocks,
            },
            classification=classification.model_dump(),
            extraction=extraction.model_dump(),
            review_required=review_required,
            warnings=warnings,
        )
