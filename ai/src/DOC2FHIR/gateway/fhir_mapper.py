from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

from .intermediate_schema import (
    AllergyItem,
    ConditionItem,
    DocumentType,
    IntermediateExtraction,
    MedicationItem,
    ObservationItem,
    ProcedureItem,
)


NAMESPACE_UUID = uuid.UUID("2c4a93f2-8b62-4f61-9b1a-3f76df6522a2")


@dataclass(frozen=True)
class MappingContext:
    document_hash: str
    source_filename: str
    ocr_engine: str
    model_version: str
    encounter_date: Optional[str] = None


def _stable_id(resource_type: str, content_key: str) -> str:
    return str(uuid.uuid5(NAMESPACE_UUID, f"{resource_type}:{content_key}"))


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _name_parts(name: str) -> dict[str, Any]:
    parts = name.split()
    if not parts:
        return {"text": name}
    if len(parts) == 1:
        return {"text": name, "family": parts[0]}
    return {"text": name, "family": parts[-1], "given": parts[:-1]}


def _evidence_extension(evidence: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    if not evidence:
        return []
    ext = {"url": "http://cfi-care.ai/fhir/StructureDefinition/evidence-span", "extension": []}
    if evidence.get("text"):
        ext["extension"].append({"url": "text", "valueString": evidence["text"]})
    if evidence.get("start") is not None:
        ext["extension"].append({"url": "start", "valueInteger": int(evidence["start"])})
    if evidence.get("end") is not None:
        ext["extension"].append({"url": "end", "valueInteger": int(evidence["end"])})
    if evidence.get("page") is not None:
        ext["extension"].append({"url": "page", "valueInteger": int(evidence["page"])})
    if evidence.get("bbox") is not None:
        ext["extension"].append({"url": "bbox", "valueString": str(evidence["bbox"])})
    return [ext] if ext["extension"] else []


def _confidence_extension(confidence: float) -> list[dict[str, Any]]:
    return [
        {
            "url": "http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence",
            "valueDecimal": float(confidence),
        }
    ]


def _parse_numeric(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    cleaned = value.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _normalize_gender(raw_gender: Optional[str]) -> Optional[str]:
    if not raw_gender:
        return None
    text = str(raw_gender).strip().lower()
    if text in {"m", "male", "man"}:
        return "male"
    if text in {"f", "female", "woman"}:
        return "female"
    if text in {"o", "other"}:
        return "other"
    if text in {"u", "unknown", "unk"}:
        return "unknown"

    # Common OCR pattern like "M [Age / Sex : 27 YRS / M]"
    if " / m" in text or text.startswith("m ") or text.endswith("/ m"):
        return "male"
    if " / f" in text or text.startswith("f ") or text.endswith("/ f"):
        return "female"
    return "unknown"


def _clean_patient_name(name: str) -> dict[str, Any]:
    parts = [part for part in name.replace("\n", " ").split() if part]
    honorifics = {"mr.", "mr", "mrs.", "mrs", "ms.", "ms", "dr.", "dr"}
    filtered = [part for part in parts if part.lower() not in honorifics]
    if not filtered:
        filtered = parts
    if not filtered:
        return {"text": name}
    if len(filtered) == 1:
        return {"text": name, "family": filtered[0]}
    return {"text": name, "family": filtered[-1], "given": filtered[:-1]}


def _normalize_date(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})$", raw)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return raw


LOINC_MAP: dict[str, tuple[str, str]] = {
    "hemoglobin": ("718-7", "Hemoglobin"),
    "hgb": ("718-7", "Hemoglobin"),
    "wbc": ("6690-2", "Leukocytes"),
    "white blood cell": ("6690-2", "Leukocytes"),
    "white blood cells": ("6690-2", "Leukocytes"),
    "white blood count": ("6690-2", "Leukocytes"),
    "rbc": ("789-8", "Erythrocytes"),
    "red blood cell": ("789-8", "Erythrocytes"),
    "red blood cells": ("789-8", "Erythrocytes"),
    "red blood count": ("789-8", "Erythrocytes"),
    "platelet": ("777-3", "Platelets"),
    "platelets": ("777-3", "Platelets"),
    "hematocrit": ("4544-3", "Hematocrit"),
    "hct": ("4544-3", "Hematocrit"),
    "mcv": ("787-2", "MCV"),
    "mch": ("785-6", "MCH"),
    "mchc": ("786-4", "MCHC"),
    "rdw": ("788-0", "RDW"),
    "neutrophils": ("770-8", "Neutrophils"),
    "lymphocytes": ("731-0", "Lymphocytes"),
    "monocytes": ("742-7", "Monocytes"),
    "eosinophils": ("713-8", "Eosinophils"),
    "basophils": ("704-7", "Basophils"),
    "differential": ("58410-2", "Differential"),
    "glucose": ("2339-0", "Glucose"),
    "creatinine": ("14682-9", "Creatinine"),
    "bun": ("3094-0", "BUN"),
    "sodium": ("2951-2", "Sodium"),
    "potassium": ("2823-3", "Potassium"),
    "chloride": ("2075-0", "Chloride"),
    "bicarbonate": ("1963-6", "Bicarbonate"),
    "calcium": ("17861-6", "Calcium"),
    "total protein": ("2885-2", "Total Protein"),
    "albumin": ("1751-7", "Albumin"),
    "bilirubin total": ("1975-2", "Bilirubin.total"),
    "bilirubin": ("1975-2", "Bilirubin.total"),
    "alkaline phosphatase": ("6768-6", "Alkaline Phosphatase"),
    "alt": ("1742-6", "ALT"),
    "ast": ("1920-8", "AST"),
    "tsh": ("3016-3", "TSH"),
    "free t4": ("3024-7", "Free T4"),
    "t3": ("3051-0", "T3"),
    "vitamin d": ("35365-6", "Vitamin D"),
    "vitamin b12": ("29579-0", "Vitamin B12"),
    "ferritin": ("2276-4", "Ferritin"),
    "iron": ("2498-4", "Iron"),
    "hba1c": ("4548-4", "HbA1c"),
    "hemoglobin a1c": ("4548-4", "HbA1c"),
    "cholesterol total": ("2093-3", "Cholesterol Total"),
    "total cholesterol": ("2093-3", "Cholesterol Total"),
    "hdl": ("2085-9", "HDL"),
    "ldl": ("18262-6", "LDL"),
    "triglycerides": ("2571-8", "Triglycerides"),
    "uric acid": ("3084-1", "Uric Acid"),
    "c-reactive protein": ("1988-5", "C-reactive Protein"),
    "crp": ("1988-5", "C-reactive Protein"),
    "esr": ("4537-7", "ESR"),
    "inr": ("34714-6", "INR"),
    "pt": ("5964-2", "PT"),
    "ptt": ("3173-2", "PTT"),
}


def _observation_coding(name: str | None) -> dict[str, Any]:
    if not name:
        return {
            "coding": [{"system": "http://loinc.org", "code": "unspecified", "display": "Unspecified"}],
            "text": "",
        }
    key = name.strip().lower()
    match = LOINC_MAP.get(key)
    loinc_code = match[0] if match else None
    loinc_display = match[1] if match else None
    if loinc_code:
        coding = [{"system": "http://loinc.org", "code": loinc_code, "display": loinc_display}]
    else:
        coding = [{"system": "http://cfi-care.ai/fhir/CodeSystem/observations", "code": "unknown", "display": name.strip()}]
    return {"coding": coding, "text": name.strip()}


def _fallback_coding(system: str, code: str, display: str) -> dict[str, Any]:
    return {
        "coding": [{"system": system, "code": code, "display": display}],
        "text": display,
    }


def _narrative(resource_type: str, detail: str | None = None) -> dict[str, Any]:
    text = f"Generated narrative for {resource_type}"
    if detail:
        text += f" — {detail}"
    return {
        "status": "generated",
        "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">{text}</div>",
    }


def _validate_resource(resource: dict[str, Any]) -> None:
    rtype = resource.get("resourceType")
    if not rtype:
        raise ValueError("Missing resourceType")
    if rtype == "Patient":
        if "name" not in resource:
            raise ValueError("Patient.name required")
        if resource.get("gender") not in {None, "male", "female", "other", "unknown"}:
            raise ValueError("Patient.gender must be a valid FHIR code")
    if rtype == "Observation":
        if "status" not in resource:
            raise ValueError("Observation.status required")
        if "code" not in resource:
            raise ValueError("Observation.code required")
    if rtype == "Condition":
        if "code" not in resource:
            raise ValueError("Condition.code required")


def _map_condition(item: ConditionItem, ctx: MappingContext) -> dict[str, Any]:
    content_key = f"{item.text}:{item.onset}:{ctx.document_hash}"
    res_id = _stable_id("Condition", content_key)
    status = (item.status or "active").lower()
    clinical_code = "active" if status == "active" else "inactive"
    verification_code = "confirmed" if status in {"active", "confirmed"} else "unconfirmed"
    resource = {
        "resourceType": "Condition",
        "id": res_id,
        "text": _narrative("Condition", item.text),
        "clinicalStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": clinical_code}]
        },
        "verificationStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": verification_code}]
        },
        "code": _fallback_coding("http://snomed.info/sct", "unknown", item.text or ""),
        "extension": _confidence_extension(item.confidence) + _evidence_extension(item.evidence.model_dump() if item.evidence else None),
    }
    if item.onset:
        resource["onsetDateTime"] = item.onset
    _validate_resource(resource)
    return resource


def _map_medication(item: MedicationItem, ctx: MappingContext) -> dict[str, Any]:
    content_key = f"{item.name}:{item.dose}:{item.route}:{item.frequency}:{ctx.document_hash}"
    res_id = _stable_id("MedicationRequest", content_key)
    dosage = {}
    if item.dose:
        dosage["doseAndRate"] = [{"doseString": item.dose}]
    if item.route:
        dosage["route"] = {"text": item.route}
    if item.frequency:
        dosage["timing"] = {"code": {"text": item.frequency}}

    resource = {
        "resourceType": "MedicationRequest",
        "id": res_id,
        "text": _narrative("MedicationRequest", item.name),
        "status": "active",
        "intent": "order",
        "medication": {
            "concept": _fallback_coding("http://www.nlm.nih.gov/research/umls/rxnorm", "unknown", item.name or ""),
        },
        "dosageInstruction": [dosage] if dosage else [],
        "extension": _confidence_extension(item.confidence) + _evidence_extension(item.evidence.model_dump() if item.evidence else None),
    }
    _validate_resource(resource)
    return resource


INTERPRETATION_CODES: dict[str, str] = {
    "L": "L",
    "H": "H",
    "N": "N",
    "A": "A",
    "LL": "LL",
    "HH": "HH",
    "low": "L",
    "high": "H",
    "normal": "N",
    "abnormal": "A",
    "critically low": "LL",
    "critically high": "HH",
}


def _map_observation(item: ObservationItem, ctx: MappingContext) -> dict[str, Any]:
    content_key = f"{item.name}:{item.value}:{item.unit}:{ctx.document_hash}"
    res_id = _stable_id("Observation", content_key)
    value_num = _parse_numeric(item.value)
    value = None
    if value_num is not None:
        value = {"value": value_num}
        if item.unit:
            value["unit"] = item.unit
    elif item.value is not None:
        value = {"value": str(item.value)}

    resource = {
        "resourceType": "Observation",
        "id": res_id,
        "text": _narrative("Observation", item.name),
        "status": "final",
        "code": _observation_coding(item.name),
        "performer": [{"display": "Unknown Lab"}],
        "extension": _confidence_extension(item.confidence) + _evidence_extension(item.evidence.model_dump() if item.evidence else None),
    }
    date_val = _normalize_date(item.effective_date) or _normalize_date(ctx.encounter_date)
    if date_val:
        resource["effectiveDateTime"] = date_val
    if value:
        if "unit" in value:
            resource["valueQuantity"] = value
        else:
            resource["valueString"] = str(value["value"])

    if item.interpretation:
        norm = item.interpretation.strip().lower()
        code = INTERPRETATION_CODES.get(norm, item.interpretation.strip().upper()[:2])
        resource["interpretation"] = [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                        "code": code,
                    }
                ]
            }
        ]

    if item.reference_range_low is not None or item.reference_range_high is not None:
        rr: dict[str, Any] = {}
        low = _parse_numeric(item.reference_range_low)
        high = _parse_numeric(item.reference_range_high)
        if low is not None:
            rr["low"] = {"value": low}
        if high is not None:
            rr["high"] = {"value": high}
        if rr:
            resource["referenceRange"] = [rr]

    _validate_resource(resource)
    return resource


def _map_allergy(item: AllergyItem, ctx: MappingContext) -> dict[str, Any]:
    content_key = f"{item.text}:{item.reaction}:{item.severity}:{ctx.document_hash}"
    res_id = _stable_id("AllergyIntolerance", content_key)
    resource = {
        "resourceType": "AllergyIntolerance",
        "id": res_id,
        "text": _narrative("AllergyIntolerance", item.text),
        "code": _fallback_coding("http://snomed.info/sct", "unknown", item.text or ""),
        "criticality": "low",
        "extension": _confidence_extension(item.confidence) + _evidence_extension(item.evidence.model_dump() if item.evidence else None),
    }
    return resource


def _map_procedure(item: ProcedureItem, ctx: MappingContext) -> dict[str, Any]:
    content_key = f"{item.text}:{item.performed}:{ctx.document_hash}"
    res_id = _stable_id("Procedure", content_key)
    resource = {
        "resourceType": "Procedure",
        "id": res_id,
        "text": _narrative("Procedure", item.text),
        "status": "completed",
        "code": _fallback_coding("http://snomed.info/sct", "unknown", item.text or ""),
        "extension": _confidence_extension(item.confidence) + _evidence_extension(item.evidence.model_dump() if item.evidence else None),
    }
    if item.performed:
        resource["performedDateTime"] = item.performed
    return resource


def _map_diagnostic_report(
    observation_ids: list[str],
    patient_id: str,
    encounter_id: str | None,
    ctx: MappingContext,
    effective_date: str | None = None,
) -> dict[str, Any]:
    content_key = f"DiagnosticReport:{ctx.document_hash}"
    res_id = _stable_id("DiagnosticReport", content_key)
    report: dict[str, Any] = {
        "resourceType": "DiagnosticReport",
        "id": res_id,
        "text": _narrative("DiagnosticReport", "Laboratory Report"),
        "status": "final",
        "code": _fallback_coding("http://loinc.org", "11502-2", "Laboratory Report"),
        "result": [{"reference": f"urn:uuid:{oid}"} for oid in observation_ids],
        "extension": _confidence_extension(1.0),
    }
    if effective_date:
        report["effectiveDateTime"] = _normalize_date(effective_date) or effective_date
    return report


DOC_TYPE_LOINC: dict[DocumentType, tuple[str, str]] = {
    DocumentType.LAB_REPORT: ("11502-2", "Laboratory Report"),
    DocumentType.PRESCRIPTION: ("57833-6", "Prescription"),
    DocumentType.DISCHARGE_SUMMARY: ("18842-5", "Discharge Summary"),
    DocumentType.RADIOLOGY_REPORT: ("18748-4", "Radiology Report"),
    DocumentType.CLINICAL_NOTE: ("34117-4", "Progress Note"),
    DocumentType.VACCINATION_RECORD: ("11369-6", "Immunization Record"),
}


def _map_composition(
    document_summary: str | None,
    doc_type: DocumentType,
    patient_id: str,
    encounter_date: str | None = None,
) -> dict[str, Any] | None:
    if not document_summary:
        return None
    summary = document_summary[:100]

    code_info = DOC_TYPE_LOINC.get(doc_type, ("11502-2", "Laboratory Report"))

    content_key = f"Composition:{summary}:{patient_id}"
    res_id = _stable_id("Composition", content_key)

    return {
        "resourceType": "Composition",
        "id": res_id,
        "text": _narrative("Composition", code_info[1]),
        "status": "final",
        "type": {
            "coding": [{"system": "http://loinc.org", "code": code_info[0], "display": code_info[1]}],
            "text": code_info[1],
        },
        "title": f"{code_info[1]} — Clinical Summary",
        "date": _normalize_date(encounter_date) or str(date.today()),
        "subject": [{"reference": f"urn:uuid:{patient_id}"}],
        "author": [{"reference": f"urn:uuid:{patient_id}"}],
        "section": [
            {
                "title": "Summary",
                "text": {
                    "status": "generated",
                    "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{summary}</p></div>",
                },
            }
        ],
        "extension": _confidence_extension(1.0),
    }


def map_to_fhir(intermediate: IntermediateExtraction, ctx: MappingContext) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []

    patient = intermediate.patient
    patient_name = patient.name or ""
    patient_dob = patient.dob or ""
    patient_gender = patient.gender or ""
    patient_key = f"{patient_name}:{patient_dob}:{patient_gender}:{ctx.document_hash}"
    patient_id = _stable_id("Patient", patient_key)
    patient_resource = {
        "resourceType": "Patient",
        "id": patient_id,
        "text": _narrative("Patient", patient_name),
        "name": [_clean_patient_name(patient_name)],
    }
    normalized_gender = _normalize_gender(patient_gender)
    if normalized_gender:
        patient_resource["gender"] = normalized_gender
    if patient_dob:
        patient_resource["birthDate"] = patient_dob
    resources.append(patient_resource)

    for cond in intermediate.conditions:
        resources.append(_map_condition(cond, ctx))

    for med in intermediate.medications:
        resources.append(_map_medication(med, ctx))

    obs_resources: list[dict[str, Any]] = []
    obs_ids: list[str] = []
    first_effective_date: str | None = None
    for obs in intermediate.observations:
        r = _map_observation(obs, ctx)
        obs_resources.append(r)
        rid = r.get("id")
        if rid:
            obs_ids.append(rid)
        if not first_effective_date and obs.effective_date:
            first_effective_date = obs.effective_date
    resources.extend(obs_resources)

    if obs_ids:
        report = _map_diagnostic_report(
            obs_ids, patient_id, intermediate.encounter.date, ctx, first_effective_date
        )
        resources.append(report)

    for allergy in intermediate.allergies:
        resources.append(_map_allergy(allergy, ctx))

    for proc in intermediate.procedures:
        resources.append(_map_procedure(proc, ctx))

    composition = _map_composition(
        intermediate.document_summary,
        intermediate.document_type,
        patient_id,
        intermediate.encounter.date if intermediate.encounter else None,
    )
    if composition:
        resources.append(composition)

    return resources
