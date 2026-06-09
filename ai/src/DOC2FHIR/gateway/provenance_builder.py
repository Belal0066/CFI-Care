from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

NAMESPACE_PROVENANCE = uuid.UUID("7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")


def _provenance_id(resource_type: str, resource_id: str, document_hash: str) -> str:
    return str(uuid.uuid5(NAMESPACE_PROVENANCE, f"Provenance:{resource_type}/{resource_id}:{document_hash}"))


def build_provenance(
    resources: list[dict[str, Any]],
    document_hash: str,
    ocr_engine: str,
    model_version: str,
    patient_id: str | None = None,
) -> list[dict[str, Any]]:
    provenance_list: list[dict[str, Any]] = []
    recorded = datetime.now(timezone.utc).isoformat()

    for res in resources:
        if not isinstance(res, dict):
            continue
        rtype = res.get("resourceType")
        rid = res.get("id")
        if not rtype or not rid:
            continue

        entry: dict[str, Any] = {
            "resourceType": "Provenance",
            "id": _provenance_id(rtype, rid, document_hash),
            "text": {
                "status": "generated",
                "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Generated narrative for Provenance</div>",
            },
            "recorded": recorded,
            "target": [{"reference": f"urn:uuid:{rid}"}],
            "agent": [
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                                "code": "assembler",
                            }
                        ]
                    },
                    "who": {"display": "DOC2FHIR Deterministic Mapper"},
                },
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                                "code": "author",
                            }
                        ]
                    },
                    "who": {"display": ocr_engine},
                },
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                                "code": "author",
                            }
                        ]
                    },
                    "who": {"display": model_version},
                },
            ],
            "entity": [
                {
                    "role": "source",
                    "what": {
                        "identifier": {
                            "system": "http://cfi-care.ai/document-hash",
                            "value": document_hash,
                        }
                    },
                }
            ],
        }

        if patient_id:
            entry["patient"] = {"reference": f"Patient/{patient_id}"}

        provenance_list.append(entry)

    return provenance_list
