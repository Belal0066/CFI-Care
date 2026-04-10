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
                        "content": "You are a healthcare data mapping expert. Convert the provided medical document text into a valid FHIR R4 JSON bundle. Return only valid JSON, no markdown.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                "temperature": 0.1,  # Low temperature for deterministic output
                "max_tokens": 4000,
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

            raw_response = result["choices"][0].get("message", {}).get("content", "")
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
            "Include appropriate resources (Patient, Observation, Condition, Medication, etc.).",
            "Ensure all resources have valid identifiers and required fields.",
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
        """Extract and validate FHIR bundle from response.

        Args:
            response_text: Raw response from Mapper

        Returns:
            Validated FHIR bundle dictionary

        Raises:
            MapperValidationError: If bundle is invalid
        """
        import json

        # Try to extract JSON from response (might be wrapped in markdown)
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        try:
            bundle = json.loads(text)
        except json.JSONDecodeError as exc:
            raise MapperValidationError(
                f"Failed to parse FHIR response as JSON: {str(exc)}",
                original_error=exc,
            ) from exc

        # Basic FHIR validation
        if not isinstance(bundle, dict):
            raise MapperValidationError(
                "FHIR bundle must be a JSON object",
            )

        # Validate it looks like a FHIR bundle
        if "resourceType" not in bundle:
            raise MapperValidationError(
                "FHIR bundle missing resourceType",
            )

        expected_type = bundle.get("resourceType")
        if expected_type not in ("Bundle", "Patient", "Observation", "Condition"):
            # Allow other types but at least ensure it's dict-like
            pass

        return bundle
