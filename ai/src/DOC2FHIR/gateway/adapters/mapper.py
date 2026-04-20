"""Mapper adapter for llama.cpp OpenAI-compatible service."""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx


class MapperError(Exception):
    """Base Mapper adapter exception."""

    def __init__(
        self,
        message: str,
        retry_allowed: bool = True,
        original_error: Exception | None = None,
    ):
        self.message = message
        self.retry_allowed = retry_allowed
        self.original_error = original_error
        super().__init__(message)


class MapperValidationError(MapperError):
    """FHIR validation error."""

    pass


class MapperOutput:
    """Normalized Mapper output."""

    def __init__(
        self,
        fhir_bundle: dict[str, Any],
        raw_response: str,
        processing_time_sec: float,
        model_name: str | None = None,
    ):
        self.fhir_bundle = fhir_bundle
        self.raw_response = raw_response
        self.processing_time_sec = processing_time_sec
        self.model_name = model_name or "unknown"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "fhir_bundle": self.fhir_bundle,
            "raw_response": self.raw_response,
            "processing_time_sec": self.processing_time_sec,
            "model_name": self.model_name,
        }


class MapperAdapter:
    """Client for llama.cpp OpenAI-compatible inference service."""

    def __init__(
        self,
        base_url: str,
        model_name: str = "default",
        timeout_sec: int = 600,
        max_retries: int = 2,
    ):
        """Initialize Mapper adapter.

        Args:
            base_url: Base URL for Mapper service (e.g., http://127.0.0.1:8080)
            model_name: Model identifier for logging
            timeout_sec: Request timeout in seconds
            max_retries: Maximum retries for transient failures
        """
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries

    def map_to_fhir(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> MapperOutput:
        """Map OCR output to FHIR bundle.

        Args:
            ocr_text: Extracted text from OCR stage
            metadata: Optional job metadata for context

        Returns:
            MapperOutput with FHIR bundle

        Raises:
            MapperError: If mapping fails after retries
            MapperValidationError: If FHIR bundle is invalid
        """
        if not ocr_text or not ocr_text.strip():
            raise MapperError(
                "OCR text is empty",
                retry_allowed=False,
            )

        attempt = 0
        last_error = None

        while attempt <= self.max_retries:
            try:
                return self._call_mapper_service(ocr_text, metadata)
            except MapperError as exc:
                last_error = exc
                if not exc.retry_allowed or attempt >= self.max_retries:
                    raise
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1
            except Exception as exc:
                mapper_error = MapperError(
                    f"Mapper service error: {str(exc)}",
                    retry_allowed=attempt < self.max_retries,
                    original_error=exc,
                )
                last_error = mapper_error
                if not mapper_error.retry_allowed:
                    raise mapper_error
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1

        if last_error:
            raise last_error
        raise MapperError("Mapper processing failed")

    def _call_mapper_service(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> MapperOutput:
        """Make the actual call to the Mapper service.

        Args:
            ocr_text: Extracted text from OCR
            metadata: Optional context

        Returns:
            MapperOutput with FHIR bundle

        Raises:
            MapperError: On service or validation errors
        """
        start_time = time.time()
        url = f"{self.base_url}/v1/chat/completions"

        # Build the prompt for FHIR mapping
        prompt = self._build_fhir_prompt(ocr_text, metadata)

        try:
            payload = {
                "model": self.model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a healthcare data mapping expert. Convert the provided medical document text into a valid FHIR R4 JSON bundle. Return only valid JSON, no markdown. DO NOT output any reasoning, thinking process or explanations. Start immediately with {. The Bundle MUST be of type 'transaction' and each entry MUST have a 'request' block with method 'POST' and url matching the resource type. Do not use non-standard resource types like ClinicalNote. Use valid FHIR R4 resources like DocumentReference, DiagnosticReport, Patient, Observation, Condition, or Medication. For DocumentReference, use status 'current', NOT 'final'. For DiagnosticReport, use status 'final'. If generating a 'text.div' narrative, it MUST be wrapped in exactly ONE root <div xmlns=\"http://www.w3.org/1999/xhtml\"> element, with no multiple xml roots.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                "temperature": 0.1,  # Low temperature for deterministic output
                "max_tokens": 8000,
            }

            with httpx.Client(timeout=self.timeout_sec) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()

            result = response.json()
            processing_time = time.time() - start_time

            # Extract response content
            if "choices" not in result or not result["choices"]:
                raise MapperError(
                    "Mapper returned empty response",
                    retry_allowed=False,
                )

            # Gemma might put the answer in reasoning_content if it was cut off or confused.
            msg = result["choices"][0].get("message", {})
            raw_content = msg.get("content", "")
            reasoning_content = msg.get("reasoning_content", "")
            
            raw_response = raw_content if raw_content.strip() else reasoning_content

            if not raw_response:
                raise MapperError(
                    "No content in Mapper response",
                    retry_allowed=False,
                )

            # Parse and validate FHIR bundle
            fhir_bundle = self._extract_and_validate_fhir(raw_response)

            return MapperOutput(
                fhir_bundle=fhir_bundle,
                raw_response=raw_response,
                processing_time_sec=processing_time,
                model_name=result.get("model", self.model_name),
            )

        except httpx.TimeoutException as exc:
            raise MapperError(
                f"Mapper service timeout after {self.timeout_sec}s",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except (httpx.NetworkError, httpx.ConnectError) as exc:
            raise MapperError(
                f"Cannot reach Mapper service at {url}",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except httpx.HTTPStatusError as exc:
            retry_allowed = 500 <= exc.response.status_code < 600
            raise MapperError(
                f"Mapper service returned {exc.response.status_code}",
                retry_allowed=retry_allowed,
                original_error=exc,
            ) from exc

    def _build_fhir_prompt(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> str:
        """Build a prompt for FHIR mapping.

        Args:
            ocr_text: Extracted text
            metadata: Optional context

        Returns:
            Formatted prompt string
        """
        lines = [
            "Convert the following medical document text into a FHIR R4 JSON bundle.",
            "Include appropriate resources (Patient, Observation, Condition, Medication, DocumentReference, DiagnosticReport, etc.).",
            "Ensure all resources have valid identifiers and required fields.",
            "Never use hallucinated resource types like 'ClinicalNote'.",
            "Return ONLY valid JSON.",
            "",
            "Medical Document Text:",
            "---",
            ocr_text[:5000],  # Limit context to prevent huge prompts
            "---",
        ]

        if metadata:
            if "patient_id" in metadata:
                lines.append(f"Patient ID: {metadata['patient_id']}")
            if "source" in metadata:
                lines.append(f"Document Source: {metadata['source']}")

        return "\n".join(lines)

    def _extract_and_validate_fhir(self, response_text: str) -> dict[str, Any]:
        """Extract and validate FHIR bundle from response."""
        import json
        import uuid
        import re

        text = response_text.strip()
        
        # Try to extract JSON from markdown code block first
        match = re.search(r'```(?:json)?\s*(\{.*\}|\[.*\])\s*```', text, re.DOTALL)
        if match:
            text = match.group(1).strip()
        else:
            # Fallback: find the outermost JSON object in case there's leading/trailing text
            start_idx = text.find('{')
            end_idx = text.rfind('}')
            list_start_idx = text.find('[')
            list_end_idx = text.rfind(']')
            
            # Use whichever bounds look like they enclose the outer structure
            if start_idx != -1 and end_idx != -1 and (list_start_idx == -1 or start_idx < list_start_idx):
                text = text[start_idx:end_idx+1]
            elif list_start_idx != -1 and list_end_idx != -1:
                text = text[list_start_idx:list_end_idx+1]

        try:
            bundle = json.loads(text)
        except json.JSONDecodeError as exc:
            raise MapperValidationError(
                f"Failed to parse FHIR response as JSON: {str(exc)}\nSnippet: {text[:100]}...",
                original_error=exc,
            ) from exc

        if not isinstance(bundle, dict) or "resourceType" not in bundle:
            raise MapperValidationError("FHIR bundle must be a JSON object with resourceType")

        if bundle.get("resourceType") == "Bundle":
            bundle["type"] = "transaction"
            entries = bundle.get("entry", [])
            if isinstance(entries, list):
                ref_map = {}
                valid_entries = []
                
                # 1. Assign URN UUIDs
                for entry in entries:
                    res = entry.get("resource")
                    if not isinstance(res, dict): continue
                    
                    res_type = res.get("resourceType")
                    if not res_type: continue
                        
                    new_uuid = str(uuid.uuid4())
                    urn = f"urn:uuid:{new_uuid}"
                    
                    old_id = str(res.get("id", ""))
                    old_full_url = str(entry.get("fullUrl", ""))
                    if old_id:
                        ref_map[old_id] = urn
                        ref_map[f"{res_type}/{old_id}"] = urn
                        ref_map[f"#{old_id}"] = urn
                    if old_full_url:
                        ref_map[old_full_url] = urn
                        
                    res["id"] = new_uuid
                    entry["fullUrl"] = urn
                    entry["request"] = {"method": "POST", "url": res_type}
                    valid_entries.append(entry)
                    
                bundle["entry"] = valid_entries
                
                # 2. Re-map references and remove dangling ones
                def sanitize_refs(node):
                    if isinstance(node, dict):
                        to_delete = []
                        for k, v in list(node.items()):
                            if k == "reference" and isinstance(v, str):
                                if v in ref_map:
                                    node[k] = ref_map[v]
                                elif not v.startswith("urn:uuid:") and not v.startswith("http"):
                                    to_delete.append(k)
                            elif isinstance(v, (dict, list)):
                                sanitize_refs(v)
                        for k in to_delete:
                            del node[k]
                    elif isinstance(node, list):
                        for item in node:
                            sanitize_refs(item)
                
                sanitize_refs(bundle)

                # 3. Ensure XHTML narrative strings are well-formed for HAPI parsing
                def normalize_xhtml(html: str) -> str:
                    def self_close_void(match: re.Match) -> str:
                        raw = match.group(0)
                        if raw.endswith("/>"):
                            return raw
                        return raw[:-1] + "/>"

                    fixed = re.sub(r"<\s*br\s*/?>", "<br/>", html, flags=re.IGNORECASE)
                    for tag in ("hr", "img", "input", "meta", "link", "base", "area", "col", "param", "source", "track", "wbr"):
                        fixed = re.sub(rf"<\s*{tag}(\s[^>]*)?>", self_close_void, fixed, flags=re.IGNORECASE)
                    return fixed

                def sanitize_xhtml(node):
                    if isinstance(node, dict):
                        for k, v in list(node.items()):
                            if k == "div" and isinstance(v, str) and "<div" in v:
                                node[k] = normalize_xhtml(v)
                            elif isinstance(v, (dict, list)):
                                sanitize_xhtml(v)
                    elif isinstance(node, list):
                        for item in node:
                            sanitize_xhtml(item)

                sanitize_xhtml(bundle)

        return bundle
