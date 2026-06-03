from __future__ import annotations

import uuid
from typing import Any

import pytest

NAMESPACE_UUID = uuid.UUID("2c4a93f2-8b62-4f61-9b1a-3f76df6522a2")
NAMESPACE_PROVENANCE = uuid.UUID("7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")
DOCUMENT_HASH = "abc123def456"


def _stable_id(resource_type: str, content_key: str) -> str:
    return str(uuid.uuid5(NAMESPACE_UUID, f"{resource_type}:{content_key}"))


def _provenance_id(resource_type: str, resource_id: str, document_hash: str) -> str:
    return str(uuid.uuid5(NAMESPACE_PROVENANCE, f"Provenance:{resource_type}/{resource_id}:{document_hash}"))


PATIENT_NAME = "Mr. Saubhik Bhaumik"
PATIENT_DOB = ""
PATIENT_GENDER = "male"
PATIENT_KEY = f"{PATIENT_NAME}:{PATIENT_DOB}:{PATIENT_GENDER}:{DOCUMENT_HASH}"
PATIENT_ID = _stable_id("Patient", PATIENT_KEY)

ALLERGY_TEXT = "Pollen"
ALLERGY_REACTION = "Sneezing"
ALLERGY_SEVERITY = "mild"
ALLERGY_KEY = f"{ALLERGY_TEXT}:{ALLERGY_REACTION}:{ALLERGY_SEVERITY}:{DOCUMENT_HASH}"
ALLERGY_ID = _stable_id("AllergyIntolerance", ALLERGY_KEY)

OBS_STR_NAME = "Hemoglobin A1C"
OBS_STR_VALUE = "7.2"
OBS_STR_KEY = f"{OBS_STR_NAME}:{OBS_STR_VALUE}:None:{DOCUMENT_HASH}"
OBS_STR_ID = _stable_id("Observation", OBS_STR_KEY)

OBS_QTY_NAME = "Hemoglobin"
OBS_QTY_VALUE = "15"
OBS_QTY_UNIT = "g/dl"
OBS_QTY_KEY = f"{OBS_QTY_NAME}:{OBS_QTY_VALUE}:{OBS_QTY_UNIT}:{DOCUMENT_HASH}"
OBS_QTY_ID = _stable_id("Observation", OBS_QTY_KEY)

DR_KEY = f"DiagnosticReport:{DOCUMENT_HASH}"
DR_ID = _stable_id("DiagnosticReport", DR_KEY)

COMP_SUMMARY = "CBC results are within normal limits."
COMP_KEY = f"Composition:{COMP_SUMMARY}:{PATIENT_ID}"
COMP_ID = _stable_id("Composition", COMP_KEY)

BASIC_UUID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture
def fhir_bundle() -> dict[str, Any]:
    patient_resource: dict[str, Any] = {
        "resourceType": "Patient",
        "id": PATIENT_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Patient</div>",
        },
        "name": [{"text": PATIENT_NAME, "family": "Bhaumik", "given": ["Saubhik"]}],
        "gender": PATIENT_GENDER,
    }

    allergy_resource: dict[str, Any] = {
        "resourceType": "AllergyIntolerance",
        "id": ALLERGY_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for AllergyIntolerance</div>",
        },
        "code": {
            "coding": [{"system": "http://snomed.info/sct", "code": "unknown", "display": ALLERGY_TEXT}],
            "text": ALLERGY_TEXT,
        },
        "criticality": "low",
        "patient": {"reference": f"urn:uuid:{PATIENT_ID}"},
        "extension": [
            {
                "url": "http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence",
                "valueDecimal": 0.95,
            }
        ],
    }

    obs_str_resource: dict[str, Any] = {
        "resourceType": "Observation",
        "id": OBS_STR_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Observation</div>",
        },
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": "4548-4", "display": OBS_STR_NAME}], "text": OBS_STR_NAME},
        "valueString": "7.2",
        "subject": {"reference": f"urn:uuid:{PATIENT_ID}"},
    }

    obs_qty_resource: dict[str, Any] = {
        "resourceType": "Observation",
        "id": OBS_QTY_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Observation</div>",
        },
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": "718-7", "display": OBS_QTY_NAME}], "text": OBS_QTY_NAME},
        "valueQuantity": {"value": 15.0, "unit": OBS_QTY_UNIT},
        "subject": {"reference": f"urn:uuid:{PATIENT_ID}"},
    }

    diagnostic_report: dict[str, Any] = {
        "resourceType": "DiagnosticReport",
        "id": DR_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for DiagnosticReport</div>",
        },
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": "11502-2", "display": "Laboratory Report"}], "text": "Laboratory Report"},
        "result": [
            {"reference": f"urn:uuid:{OBS_STR_ID}"},
            {"reference": f"urn:uuid:{OBS_QTY_ID}"},
        ],
        "subject": {"reference": f"urn:uuid:{PATIENT_ID}"},
    }

    composition_resource: dict[str, Any] = {
        "resourceType": "Composition",
        "id": COMP_ID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Composition</div>",
        },
        "status": "final",
        "type": {
            "coding": [{"system": "http://loinc.org", "code": "11502-2", "display": "Laboratory Report"}],
            "text": "Laboratory Report",
        },
        "title": "Laboratory Report — Clinical Summary",
        "date": "2024-10-17",
        "subject": [{"reference": f"urn:uuid:{PATIENT_ID}"}],
        "author": [{"reference": f"urn:uuid:{PATIENT_ID}"}],
        "section": [
            {
                "title": "Summary",
                "text": {
                    "status": "generated",
                    "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{COMP_SUMMARY}</p></div>",
                },
            }
        ],
    }

    basic_resource: dict[str, Any] = {
        "resourceType": "Basic",
        "id": BASIC_UUID,
        "text": {
            "status": "generated",
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Basic resource containing unmapped clinical document sections.</div>",
        },
        "code": {
            "coding": [{"system": "http://cfi-care.ai/fhir/CodeSystem/unmapped-sections", "code": "unmapped-sections"}],
            "text": "Unmapped Sections",
        },
        "extension": [
            {
                "url": "http://cfi-care.ai/fhir/StructureDefinition/unmapped-sections",
                "extension": [
                    {"url": "text", "valueString": "Family History"},
                    {"url": "text", "valueString": "Social History"},
                ],
            }
        ],
    }

    resources: list[dict[str, Any]] = [
        patient_resource,
        allergy_resource,
        obs_str_resource,
        obs_qty_resource,
        diagnostic_report,
        composition_resource,
    ]

    provenance_resources: list[dict[str, Any]] = []
    for res in resources:
        rtype = res.get("resourceType")
        rid = res.get("id")
        if rtype and rid:
            provenance_resources.append({
                "resourceType": "Provenance",
                "id": _provenance_id(rtype, rid, DOCUMENT_HASH),
                "text": {
                    "status": "generated",
                    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Provenance</div>",
                },
                "recorded": "2026-06-03T00:00:00+00:00",
                "target": [{"reference": f"urn:uuid:{rid}"}],
                "agent": [
                    {"type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type", "code": "assembler"}]}, "who": {"display": "DOC2FHIR Deterministic Mapper"}},
                    {"type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type", "code": "author"}]}, "who": {"display": "PaddleOCR"}},
                ],
                "entity": [{"role": "source", "what": {"identifier": {"system": "http://cfi-care.ai/document-hash", "value": DOCUMENT_HASH}}}],
            })

    resources.extend(provenance_resources)

    entries: list[dict[str, Any]] = []
    for res in resources:
        entry: dict[str, Any] = {"resource": res}
        rid = res.get("id")
        if rid:
            entry["fullUrl"] = f"urn:uuid:{rid}"
        rtype = res.get("resourceType")
        if rtype:
            entry["request"] = {"method": "POST", "url": rtype}
        entries.append(entry)

    entries.append({
        "fullUrl": f"urn:uuid:{BASIC_UUID}",
        "resource": basic_resource,
        "request": {"method": "POST", "url": "Basic"},
    })

    bundle: dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": entries,
    }

    return bundle
