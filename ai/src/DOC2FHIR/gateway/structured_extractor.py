from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

from .intermediate_schema import DocumentType, IntermediateExtraction, intermediate_schema_json


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

    decoder = json.JSONDecoder()
    for start in (0, candidate.find("{"), candidate.find("[")):
        if start < 0:
            continue
        try:
            obj, _ = decoder.raw_decode(candidate[start:].lstrip())
            if isinstance(obj, dict):
                return obj
            if isinstance(obj, list) and obj:
                first = obj[0]
                if isinstance(first, dict):
                    return first
        except json.JSONDecodeError:
            continue

    obj = json.loads(candidate)
    if not isinstance(obj, dict):
        raise ValueError(f"Structured JSON must be an object, got {type(obj).__name__}")
    return obj


def _build_extraction_prompt(doc_type: DocumentType) -> str:
    profile = {
        DocumentType.LAB_REPORT: "observations-heavy",
        DocumentType.PRESCRIPTION: "medication-heavy",
        DocumentType.RADIOLOGY_REPORT: "diagnostic-report-heavy",
        DocumentType.DISCHARGE_SUMMARY: "condition-heavy",
        DocumentType.CLINICAL_NOTE: "general",
        DocumentType.VACCINATION_RECORD: "immunization-heavy",
    }[doc_type]
    return (
        "Extract into the intermediate schema only. Do not produce FHIR. "
        "Use null for missing data. Always include evidence span offsets when text is present. "
        "For observations: separate numeric value from flags (L/H/N). "
        "Set interpretation to the flag, effective_date to collection date, "
        "reference_range_low/high to range bounds. "
        f"Profile: {profile}."
    )


class StructuredExtractor:
    def __init__(self, base_url: str, model_name: str = "default", timeout_sec: int = 120, output_mode: str = "auto"):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_sec = timeout_sec
        self.output_mode = output_mode

    def extract(self, clean_text: str, doc_type: DocumentType, retry: bool = False) -> IntermediateExtraction:
        schema = intermediate_schema_json()
        prompt = _build_extraction_prompt(doc_type)
        url = f"{self.base_url}/v1/chat/completions"

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": "You output ONLY JSON for the intermediate schema. Do not output FHIR."},
                {"role": "user", "content": prompt + "\n\n" + clean_text[:6000]},
            ],
            "temperature": 0.0,
            "max_tokens": 2400,
        }

        response = None
        if self.output_mode in {"json_schema", "auto"}:
            payload["response_format"] = {"type": "json_schema", "json_schema": {"name": "intermediate", "schema": schema}}

        with httpx.Client(timeout=self.timeout_sec) as client:
            response = client.post(url, json=payload)
            if response.status_code >= 400 and self.output_mode == "auto":
                payload.pop("response_format", None)
                response = client.post(url, json=payload)
            response.raise_for_status()

        result = response.json()
        choice = result.get("choices", [{}])[0]
        finish_reason = choice.get("finish_reason") if isinstance(choice, dict) else None
        message = choice.get("message", {}) if isinstance(choice, dict) else {}
        content = message.get("content", "") or message.get("reasoning_content", "") or choice.get("text", "") or ""

        if finish_reason == "length":
            max_tok = payload.get("max_tokens", "?")
            raise ValueError(
                f"LLM output truncated at {max_tok} max_tokens. "
                "Increase max_tokens or reduce input size."
            )

        raw_json = _extract_json_block(content)
        if not raw_json:
            raise ValueError(f"Structured extractor returned empty content: {result!r}")
        data = _parse_json_document(raw_json)

        if retry:
            return IntermediateExtraction.model_validate(data)
        try:
            return IntermediateExtraction.model_validate(data)
        except Exception as exc:
            if retry:
                raise
            return self.extract(clean_text, doc_type, retry=True)

    def summarize(self, extraction: IntermediateExtraction) -> str | None:
        extraction_json = extraction.model_dump_json(indent=2)
        prompt = (
            "Given the following structured clinical data extracted from a medical report, "
            "write a single-line clinical insight summarizing the key findings.\n\n"
            f"{extraction_json}\n\n"
            "Respond with a JSON object: {\"summary\": \"<your insight here>\"}"
        )
        summary_schema = {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        }
        url = f"{self.base_url}/v1/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": "You are a clinical summarizer. Output JSON only."},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_schema", "json_schema": {"name": "summary", "schema": summary_schema}},
            "temperature": 0.1,
            "max_tokens": 500,
        }
        try:
            with httpx.Client(timeout=self.timeout_sec) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
            result = resp.json()
            choice = result.get("choices", [{}])[0]
            message = choice.get("message", {}) if isinstance(choice, dict) else {}
            content = (message.get("content") or "").strip()
            if content:
                data = json.loads(content)
                summary = data.get("summary", "").strip()
                if summary:
                    return summary[:100]
                logger.warning("summarize: LLM returned no summary key in %s", content)
                return None
            reasoning = (message.get("reasoning_content") or "").strip()
            if reasoning:
                logger.warning("summarize: content empty, reasoning present (%d chars)", len(reasoning))
            else:
                logger.warning("summarize: both content and reasoning_content empty")
            return None
        except Exception as exc:
            logger.warning("summarize failed: %s: %s", type(exc).__name__, exc)
            return None
