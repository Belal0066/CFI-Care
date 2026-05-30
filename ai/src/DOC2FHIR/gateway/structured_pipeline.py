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
from .ocr_normalizer import normalize_ocr_output
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


def _unmapped_sections_basic_resource(unmapped_sections: list[str]) -> dict[str, Any] | None:
    if not unmapped_sections:
        return None
    return {
        "resourceType": "Basic",
        "id": "unmapped-sections",
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
        )

        resources = map_to_fhir(extraction, ctx)
        patient_id, encounter_id = _extract_ids(resources)
        resolver = ReferenceResolver(patient_id, encounter_id)
        resources = resolver.apply(resources)

        resources = [self.terminology.enrich_condition(r) for r in resources]

        provenance = build_provenance(resources, doc_hash, ocr_engine, model_version)
        resources.extend(provenance)

        bundle = resolver.to_bundle(resources)
        basic = _unmapped_sections_basic_resource(extraction.unmapped_sections)
        if basic:
            basic_uuid = str(uuid.uuid4())
            basic["id"] = basic_uuid
            bundle["entry"].append(
                {
                    "fullUrl": f"urn:uuid:{basic_uuid}",
                    "resource": basic,
                    "request": {"method": "POST", "url": "Basic"},
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
