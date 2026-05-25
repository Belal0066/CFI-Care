"""Async adapter for HAPI FHIR JPA Server downstream delivery."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx


class HapiFhirDownstreamError(Exception):
    """Base exception for HAPI FHIR downstream adapter."""

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


@dataclass
class HapiFhirDeliveryResult:
    """Result of a FHIR bundle delivery to HAPI FHIR."""

    status_code: int
    response_body: dict[str, Any]
    delivery_time_sec: float
    created_resources: list[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return 200 <= self.status_code < 300

    def to_dict(self) -> dict[str, Any]:
        return {
            "status_code": self.status_code,
            "delivery_time_sec": self.delivery_time_sec,
            "success": self.success,
            "created_resources": self.created_resources,
            "response_body": self.response_body,
        }


class HapiFhirDownstreamAdapter:
    """Async client for HAPI FHIR JPA Server Starter.

    Delivers FHIR Transaction Bundles via POST to the FHIR server root.
    Parses OperationOutcome responses on failure for debuggable error messages.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8080/fhir",
        fhir_version: str = "5.0",
        verify_fhir_version: bool = False,
        timeout_sec: int = 30,
        max_retries: int = 3,
        dead_letter_dir: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.fhir_version = fhir_version
        self.verify_fhir_version = verify_fhir_version
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries
        self.dead_letter_dir = dead_letter_dir
        self._verified_version: str | None = None

    async def deliver_fhir_bundle(
        self,
        job_id: str,
        fhir_bundle: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> HapiFhirDeliveryResult:
        """Deliver a FHIR Transaction Bundle to HAPI FHIR server.

        Args:
            job_id: Gateway job ID for correlation and dead-letter naming.
            fhir_bundle: FHIR Bundle dict (type=transaction preferred).
            metadata: Ignored by HAPI FHIR but kept for interface compatibility.

        Returns:
            HapiFhirDeliveryResult with response bundle and created resource URLs.

        Raises:
            HapiFhirDownstreamError: If delivery fails after all retries.
        """
        if not fhir_bundle:
            raise HapiFhirDownstreamError(
                "FHIR bundle is empty",
                retry_allowed=False,
            )

        attempt = 0
        last_error: HapiFhirDownstreamError | None = None

        while attempt <= self.max_retries:
            try:
                return await self._call_hapi_fhir(fhir_bundle)
            except HapiFhirDownstreamError as exc:
                last_error = exc
                if not exc.retry_allowed or attempt >= self.max_retries:
                    self._save_to_dead_letter(job_id, fhir_bundle, exc.message)
                    raise
                await self._async_sleep(1.0 * (2 ** attempt))
                attempt += 1
            except Exception as exc:
                last_error = HapiFhirDownstreamError(
                    f"HAPI FHIR service error: {exc}",
                    retry_allowed=attempt < self.max_retries,
                    original_error=exc,
                )
                if not last_error.retry_allowed:
                    self._save_to_dead_letter(job_id, fhir_bundle, last_error.message)
                    raise last_error
                await self._async_sleep(1.0 * (2 ** attempt))
                attempt += 1

        if last_error:
            self._save_to_dead_letter(job_id, fhir_bundle, last_error.message)
            raise last_error
        raise HapiFhirDownstreamError("HAPI FHIR delivery failed")

    async def verify_resource(self, resource_url: str) -> dict[str, Any]:
        """Retrieve a specific resource from HAPI FHIR by its URL.

        Args:
            resource_url: Relative resource path, e.g. 'Patient/123/_history/1'.

        Returns:
            Resource dict as returned by HAPI FHIR.

        Raises:
            HapiFhirDownstreamError: If the resource cannot be retrieved.
        """
        url = f"{self.base_url}/{resource_url.lstrip('/')}"

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.get(url)

            if response.status_code >= 400:
                error_detail = self._parse_operation_outcome(response)
                raise HapiFhirDownstreamError(
                    f"Failed to retrieve {resource_url}: HTTP {response.status_code} — {error_detail}",
                    retry_allowed=response.status_code >= 500,
                )

            return response.json()

    async def _call_hapi_fhir(
        self,
        fhir_bundle: dict[str, Any],
    ) -> HapiFhirDeliveryResult:
        """POST the FHIR bundle to the HAPI FHIR transaction endpoint.

        HAPI FHIR accepts Transaction Bundles at the server root (POST /).
        """
        start_time = time.time()
        url = self.base_url

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            if self.verify_fhir_version:
                await self._ensure_fhir_version(client)
            response = await client.post(
                url,
                json=fhir_bundle,
                headers={"Content-Type": f"application/fhir+json; fhirVersion={self.fhir_version}"},
            )

            delivery_time = time.time() - start_time

            if response.status_code >= 400:
                error_detail = self._parse_operation_outcome(response)
                raise HapiFhirDownstreamError(
                    f"HAPI FHIR rejected bundle: HTTP {response.status_code} — {error_detail}",
                    retry_allowed=response.status_code >= 500,
                )

            body = response.json()

        created_resources = self._extract_created_resources(body)

        return HapiFhirDeliveryResult(
            status_code=response.status_code,
            response_body=body,
            delivery_time_sec=delivery_time,
            created_resources=created_resources,
        )

    async def _ensure_fhir_version(self, client: httpx.AsyncClient) -> None:
        if self._verified_version:
            return
        metadata_url = f"{self.base_url}/metadata"
        response = await client.get(metadata_url)
        response.raise_for_status()
        meta = response.json()
        version = meta.get("fhirVersion")
        if version:
            self._verified_version = version
            if not version.startswith(self.fhir_version):
                raise HapiFhirDownstreamError(
                    f"HAPI FHIR version mismatch: expected {self.fhir_version}, got {version}",
                    retry_allowed=False,
                )

    def _parse_operation_outcome(self, response: httpx.Response) -> str:
        """Extract a human-readable error message from a HAPI FHIR OperationOutcome.

        HAPI FHIR returns OperationOutcome resources on errors with structure:
        {
            "resourceType": "OperationOutcome",
            "issue": [
                {
                    "severity": "error",
                    "code": "processing",
                    "diagnostics": "Detailed error message here",
                    "details": {"text": "Additional context"}
                }
            ]
        }
        """
        try:
            data = response.json()
        except Exception:
            return response.text[:500] if response.text else "No response body"

        if data.get("resourceType") != "OperationOutcome":
            return json.dumps(data)[:500]

        issues = data.get("issue", [])
        if not issues:
            return "OperationOutcome with no issues"

        messages = []
        for issue in issues:
            parts = []
            severity = issue.get("severity", "")
            code = issue.get("code", "")
            diagnostics = issue.get("diagnostics", "")
            detail_text = issue.get("details", {}).get("text", "")

            if severity:
                parts.append(f"[{severity}]")
            if code:
                parts.append(code)
            if diagnostics:
                parts.append(diagnostics)
            if detail_text:
                parts.append(detail_text)

            messages.append(" ".join(parts) if parts else str(issue))

        return " | ".join(messages)

    def _extract_created_resources(self, response_bundle: dict[str, Any]) -> list[str]:
        """Extract created resource URLs from HAPI FHIR response bundle.

        A successful transaction returns a Bundle with entries like:
        {
            "entry": [
                {
                    "response": {
                        "status": "201 Created",
                        "location": "Patient/123/_history/1"
                    }
                }
            ]
        }
        """
        created = []
        for entry in response_bundle.get("entry", []):
            response_info = entry.get("response", {})
            status = response_info.get("status", "")
            location = response_info.get("location", "")

            if status.startswith("201") and location:
                created.append(location)

        return created

    def _save_to_dead_letter(
        self,
        job_id: str,
        fhir_bundle: dict[str, Any],
        error: str,
    ) -> None:
        """Save undeliverable bundle to dead letter directory.

        Uses the same format as the existing DownstreamAdapter for consistency.
        """
        if not self.dead_letter_dir:
            return

        try:
            dl_path = Path(self.dead_letter_dir)
            dl_path.mkdir(parents=True, exist_ok=True)

            payload = {
                "job_id": job_id,
                "timestamp": time.time(),
                "bundle": fhir_bundle,
                "error": error,
                "adapter": "hapi_fhir",
            }

            file_path = dl_path / f"deadletter_{job_id}_{int(time.time() * 1000)}.json"
            with open(file_path, "w") as f:
                json.dump(payload, f, indent=2, default=str)
        except Exception:
            pass

    @staticmethod
    async def _async_sleep(seconds: float) -> None:
        import asyncio
        await asyncio.sleep(seconds)
