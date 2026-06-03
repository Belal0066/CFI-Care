from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


KNOWN_UNITS = {
    "g/dl", "g/dL", "mg/dl", "mg/dL", "mmol/L", "mmol/l",
    "cumm", "/cumm", "per cumm",
    "%", "percent",
    "u/l", "U/L", "iu/l", "IU/L",
    "fl", "fL", "pg",
    "kg", "g", "mg", "mcg",
    "cm", "mm", "m",
    "cel", "Cel", "°c", "°C",
    "mm[Hg]", "mmHg",
    "10^3/ul", "10*3/uL", "10^6/ul", "10*6/uL",
    "10^9/l", "10*9/L",
    "cells/ul", "cells/µl", "cells/mcl",
    "/mm3", "per mm3",
    "ml", "l", "dL",
}


def extract_numerics(text: str) -> set[str]:
    numerics: set[str] = set()
    for match in re.finditer(r"\d+(?:,\d{3})*(?:\.\d+)?", text):
        numerics.add(match.group())
    return numerics


def extract_units(text: str) -> set[str]:
    units: set[str] = set()
    lower = text.lower()
    for unit in KNOWN_UNITS:
        if unit.lower() in lower:
            units.add(unit)
    token_pattern = re.findall(r"(?:per\s+)?[a-zA-Z]+(?:[/\\][a-zA-Z%2-9]+)+", text)
    for t in token_pattern:
        units.add(t)
    return units


def extract_text_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for match in re.finditer(r"[A-Za-z][A-Za-z\-']{2,}", text):
        token = match.group().strip("-'").upper()
        if len(token) >= 3:
            tokens.add(token)
    return tokens


def extract_all_tokens(text: str) -> dict[str, set[str]]:
    return {
        "numerics": extract_numerics(text),
        "units": extract_units(text),
        "text_tokens": extract_text_tokens(text),
    }


TOKEN_SKIP_WORDS: set[str] = {
    "THE", "AND", "FOR", "WITH", "FROM", "THAT", "THIS", "ARE", "WAS",
    "WERE", "HAS", "HAVE", "HAD", "NOT", "BUT", "ALL", "CAN", "ITS",
    "HTTP", "HTTPS", "WWW", "ORG", "COM", "DIV", "XMLNS", "BR",
}


BASE64_PATTERN = re.compile(r"^[A-Za-z0-9+/]+=*$")
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

FHIR_CLINICAL_KEYS = {
    "text", "display", "title", "note",
    "value", "unit",
    "name", "given", "family",
    "code_text",
}


def _is_base64(s: str) -> bool:
    return len(s) >= 40 and BASE64_PATTERN.match(s.strip()) is not None


def _is_fhir_structural(s: str) -> bool:
    structural_values = {
        "Bundle", "Patient", "Observation", "DiagnosticReport", "Composition",
        "Provenance", "DocumentReference", "Condition", "Medication",
        "Encounter", "Procedure", "AllergyIntolerance", "CarePlan", "Basic",
        "transaction", "collection", "batch",
        "POST", "PUT", "GET", "DELETE",
        "final", "current", "generated", "entered-in-error",
        "preliminary", "amended", "cancelled", "corrected",
        "assembler", "author", "source",
        "unknown", "male", "female", "other",
        "home", "work", "temp", "old", "mobile",
        "N", "L", "H", "ABNORMAL",
        "generated",
        "default", "PaddleOCR",
        "application/pdf", "application/json",
        "start", "end", "text",
    }
    return s in structural_values


FHIR_STRUCTURAL_PREFIXES = {
    "http://", "https://", "urn:uuid:", "data:",
}


def _is_loinc_code(s: str) -> bool:
    return bool(re.match(r"^\d{2,5}-\d$", s))


def _is_hash(s: str) -> bool:
    return len(s) == 64 and all(c in "0123456789abcdef" for c in s.lower())


def _is_short_number(s: str) -> bool:
    return bool(re.match(r"^\d+\.?\d*$", s)) and len(s) <= 4


def flatten_fhir_bundle(bundle: dict[str, Any]) -> str:
    parts: list[str] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            for val in node.values():
                _walk(val)
        elif isinstance(node, list):
            for item in node:
                _walk(item)
        elif isinstance(node, str):
            if _is_base64(node):
                return
            if UUID_PATTERN.match(node):
                return
            parts.append(node)
        elif isinstance(node, (int, float)):
            parts.append(str(node))

    _walk(bundle)
    return " ".join(parts)


CLINICAL_RESOURCE_TYPES = {
    "Patient", "Observation", "DiagnosticReport", "Composition",
    "Condition", "Medication", "Encounter", "Procedure",
    "AllergyIntolerance", "DocumentReference",
}

CLINICAL_VALUE_FIELDS = {
    "valueQuantity", "valueCodeableConcept", "valueString",
    "valueBoolean", "valueInteger", "valueRange",
}


def _collect_clinical_text(resource: dict[str, Any], parts: list[str]) -> None:
    res_type = resource.get("resourceType", "")
    if res_type not in CLINICAL_RESOURCE_TYPES:
        return

    if res_type == "Patient":
        names = resource.get("name", [])
        if isinstance(names, list):
            for name in names:
                if isinstance(name, dict):
                    if name.get("text"):
                        parts.append(str(name["text"]))
                    for g in name.get("given", []):
                        if isinstance(g, str):
                            parts.append(g)

    elif res_type == "Observation":
        code = resource.get("code", {})
        if isinstance(code, dict):
            if code.get("text"):
                parts.append(str(code["text"]))
            coding = code.get("coding", [])
            if isinstance(coding, list):
                for c in coding:
                    if isinstance(c, dict) and c.get("display"):
                        parts.append(str(c["display"]))
        vq = resource.get("valueQuantity", {})
        if isinstance(vq, dict):
            if vq.get("value") is not None:
                parts.append(str(vq["value"]))
            if vq.get("unit"):
                parts.append(str(vq["unit"]))

    elif res_type == "DiagnosticReport":
        code = resource.get("code", {})
        if isinstance(code, dict):
            if code.get("text"):
                parts.append(str(code["text"]))
            coding = code.get("coding", [])
            if isinstance(coding, list):
                for c in coding:
                    if isinstance(c, dict) and c.get("display"):
                        parts.append(str(c["display"]))

    elif res_type == "Composition":
        if resource.get("title"):
            parts.append(str(resource["title"]))
        sections = resource.get("section", [])
        if isinstance(sections, list):
            for section in sections:
                if isinstance(section, dict) and section.get("title"):
                    parts.append(str(section["title"]))


def extract_fhir_clinical_tokens(bundle: dict[str, Any]) -> dict[str, set[str]]:
    parts: list[str] = []
    entries = bundle.get("entry", [])
    if isinstance(entries, list):
        for entry in entries:
            resource = entry.get("resource", {}) if isinstance(entry, dict) else {}
            if isinstance(resource, dict):
                _collect_clinical_text(resource, parts)

    combined = " ".join(parts)
    return extract_all_tokens(combined)


def _normalize_numeric(n: str) -> str:
    cleaned = n.replace(",", "")
    if "." in cleaned:
        cleaned = cleaned.rstrip("0").rstrip(".")
    return cleaned


def _normalize_numeric_set(values: set[str]) -> set[str]:
    return {_normalize_numeric(v) for v in values}


def compute_metrics(ocr_text: str, fhir_bundle: dict[str, Any]) -> dict[str, float]:
    ocr_tokens = extract_all_tokens(ocr_text)
    fhir_clinical = extract_fhir_clinical_tokens(fhir_bundle)

    ocr_numerics = ocr_tokens["numerics"]
    ocr_text_tokens = ocr_tokens["text_tokens"] - TOKEN_SKIP_WORDS
    fhir_numerics = fhir_clinical["numerics"]
    fhir_text_tokens = fhir_clinical["text_tokens"] - TOKEN_SKIP_WORDS

    ocr_nums_norm = _normalize_numeric_set(ocr_numerics)
    fhir_nums_norm = _normalize_numeric_set(fhir_numerics)

    tp = 0
    fp = 0
    fn = 0

    for token in fhir_nums_norm:
        if token in ocr_nums_norm:
            tp += 1
        else:
            fp += 1
    for token in fhir_text_tokens:
        if token in ocr_text_tokens:
            tp += 1
        else:
            fp += 1

    for token in ocr_nums_norm:
        if token not in fhir_nums_norm:
            fn += 1
    for token in ocr_text_tokens:
        if token not in fhir_text_tokens:
            fn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
    }


def load_mock_result(path: Path) -> dict[str, Any]:
    with open(path) as f:
        return json.load(f)


def extract_ocr_text(result: dict[str, Any]) -> str:
    ocr = result.get("ocr_output", {})
    text = ocr.get("extracted_text", "")
    if text and "raw_markdown" not in text:
        return text
    raw = ocr.get("raw_output", {})
    md = raw.get("raw_markdown", "")
    if md:
        return md
    return text


def extract_fhir_bundle(result: dict[str, Any]) -> dict[str, Any]:
    return result.get("fhir_bundle", {})


def check_reasoning_content(mapper_raw_response: str) -> dict[str, Any]:
    has_reasoning = bool(mapper_raw_response.strip())
    return {
        "has_reasoning_content": has_reasoning,
        "reasoning_length": len(mapper_raw_response.strip()),
    }
