from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .intermediate_schema import DocumentClassification, DocumentType


def _extract_json_block(text: str) -> str:
    if not text:
        return ""
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1].strip()
    return text.strip()


def _parse_json_document(text: str) -> dict[str, Any]:
    candidate = _extract_json_block(text)
    if not candidate:
        raise ValueError("empty JSON payload")

    def balanced_slice(source: str, open_char: str, close_char: str) -> str | None:
        start = source.find(open_char)
        if start < 0:
            return None
        depth = 0
        in_string = False
        escape = False
        for idx in range(start, len(source)):
            ch = source[idx]
            if in_string:
                if escape:
                    escape = False
                    continue
                if ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch == open_char:
                depth += 1
            elif ch == close_char:
                depth -= 1
                if depth == 0:
                    return source[start : idx + 1]
        return None

    obj_slice = balanced_slice(candidate, "{", "}")
    if obj_slice:
        try:
            obj = json.loads(obj_slice)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass

    arr_slice = balanced_slice(candidate, "[", "]")
    if arr_slice:
        try:
            obj = json.loads(arr_slice)
            if isinstance(obj, list) and obj and isinstance(obj[0], dict):
                return obj[0]
        except json.JSONDecodeError:
            pass

    # final fallback: standard parse if the payload is already clean
    obj = json.loads(candidate)
    if not isinstance(obj, dict):
        raise ValueError(f"Classifier JSON must be an object, got {type(obj).__name__}")
    return obj


def _heuristic_classification(clean_text: str) -> DocumentClassification:
    text = clean_text.lower()
    if any(token in text for token in ["prescription", "rx", "sig:", "take one", "tablet", "capsule"]):
        doc_type = DocumentType.PRESCRIPTION
        rationale = "keyword fallback: prescription-like language"
    elif any(token in text for token in ["wbc", "rbc", "hemoglobin", "platelet", "glucose", "lab", "reference range"]):
        doc_type = DocumentType.LAB_REPORT
        rationale = "keyword fallback: lab-like language"
    elif any(token in text for token in ["discharge", "admission", "hospital course", "follow-up"]):
        doc_type = DocumentType.DISCHARGE_SUMMARY
        rationale = "keyword fallback: discharge-summary language"
    elif any(token in text for token in ["x-ray", "ct ", "mri", "ultrasound", "radiology", "impression"]):
        doc_type = DocumentType.RADIOLOGY_REPORT
        rationale = "keyword fallback: radiology-like language"
    elif any(token in text for token in ["vaccine", "vaccination", "immunization", "covid-19", "influenza"]):
        doc_type = DocumentType.VACCINATION_RECORD
        rationale = "keyword fallback: vaccination-like language"
    else:
        doc_type = DocumentType.CLINICAL_NOTE
        rationale = "keyword fallback: default clinical note"
    return DocumentClassification(doc_type=doc_type, confidence=0.25, rationale=rationale)


class DocumentTypeClassifier:
    def __init__(self, base_url: str, model_name: str = "default", timeout_sec: int = 120):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_sec = timeout_sec

    def classify(self, clean_text: str) -> DocumentClassification:
        url = f"{self.base_url}/v1/chat/completions"
        system = (
            "You are a document classification assistant. "
            "Classify the OCR text into one of: prescription, lab_report, discharge_summary, "
            "radiology_report, clinical_note, vaccination_record. "
            "Return ONLY a JSON object with keys: doc_type, confidence, rationale."
        )
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": clean_text[:4000]},
            ],
            "temperature": 0.0,
            "max_tokens": 300,
        }

        with httpx.Client(timeout=self.timeout_sec) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()

        result = response.json()
        choice = result.get("choices", [{}])[0]
        message = choice.get("message", {}) if isinstance(choice, dict) else {}
        content = message.get("content", "") or message.get("reasoning_content", "") or choice.get("text", "") or ""
        raw_json = _extract_json_block(content)
        if not raw_json:
            raise ValueError(f"Classifier returned empty content: {result!r}")
        try:
            data = _parse_json_document(raw_json)
            doc_type = DocumentType(data.get("doc_type", DocumentType.CLINICAL_NOTE))
            confidence = float(data.get("confidence", 0.0))
            rationale = data.get("rationale")
            return DocumentClassification(doc_type=doc_type, confidence=confidence, rationale=rationale)
        except Exception:
            return _heuristic_classification(clean_text)
