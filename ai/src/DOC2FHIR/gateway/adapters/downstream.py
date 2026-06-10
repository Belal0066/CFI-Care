"""Downstream adapter for Node.js docfhir service."""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx


class DownstreamError(Exception):
    """Base Downstream adapter exception."""

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


class DownstreamResponse:
    """Response from downstream service."""

    def __init__(
        self,
        status_code: int,
        body: dict[str, Any] | str,
        delivery_time_sec: float,
    ):
        self.status_code = status_code
        self.body = body
        self.delivery_time_sec = delivery_time_sec
        self.success = 200 <= status_code < 300

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "status_code": self.status_code,
            "body": self.body,
            "delivery_time_sec": self.delivery_time_sec,
            "success": self.success,
        }


class DownstreamAdapter:
    """Client for downstream Node.js docfhir service."""

    def __init__(
        self,
        base_url: str,
        timeout_sec: int = 30,
        max_retries: int = 3,
        dead_letter_dir: Optional[str] = None,
    ):
        """Initialize Downstream adapter.

        Args:
            base_url: Base URL for downstream service (e.g., http://127.0.0.1:3000)
            timeout_sec: Request timeout in seconds
            max_retries: Maximum retries for transient failures
            dead_letter_dir: Path to save undeliverable bundles
        """
        self.base_url = base_url.rstrip("/")
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries
        self.dead_letter_dir = dead_letter_dir

    def deliver_fhir_bundle(
        self,
        job_id: str,
        fhir_bundle: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> DownstreamResponse:
        """Deliver FHIR bundle to downstream service.

        Args:
            job_id: Gateway job ID for correlation
            fhir_bundle: FHIR bundle to deliver
            metadata: Optional metadata to include

        Returns:
            DownstreamResponse with status and body

        Raises:
            DownstreamError: If delivery fails after retries
        """
        if not fhir_bundle:
            raise DownstreamError(
                "FHIR bundle is empty",
                retry_allowed=False,
            )

        attempt = 0
        last_error = None

        while attempt <= self.max_retries:
            try:
                return self._call_downstream_service(job_id, fhir_bundle, metadata)
            except DownstreamError as exc:
                last_error = exc
                if not exc.retry_allowed or attempt >= self.max_retries:
                    self._save_to_dead_letter(job_id, fhir_bundle, metadata)
                    raise
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1
            except Exception as exc:
                downstream_error = DownstreamError(
                    f"Downstream service error: {str(exc)}",
                    retry_allowed=attempt < self.max_retries,
                    original_error=exc,
                )
                last_error = downstream_error
                if not downstream_error.retry_allowed:
                    self._save_to_dead_letter(job_id, fhir_bundle, metadata)
                    raise downstream_error
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1

        if last_error:
            self._save_to_dead_letter(job_id, fhir_bundle, metadata)
            raise last_error
        raise DownstreamError("Downstream delivery failed")

    def _call_downstream_service(
        self,
        job_id: str,
        fhir_bundle: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> DownstreamResponse:
        """Make the actual call to the downstream service.

        Args:
            job_id: Gateway job ID
            fhir_bundle: FHIR bundle
            metadata: Optional metadata

        Returns:
            DownstreamResponse with status and body

        Raises:
            DownstreamError: On service errors
        """
        start_time = time.time()
        url = self.base_url

        payload = {
            "job_id": job_id,
            "bundle": fhir_bundle,
        }
        if metadata:
            payload["metadata"] = metadata

        try:
            with httpx.Client(timeout=self.timeout_sec) as client:
                response = client.post(url, json=payload)
                delivery_time = time.time() - start_time

                # Try to parse response as JSON
                try:
                    body = response.json()
                except Exception:
                    body = response.text or f"HTTP {response.status_code}"

                # 5xx errors are retryable; 4xx generally are not
                if response.status_code >= 500:
                    raise DownstreamError(
                        f"Downstream service error {response.status_code}",
                        retry_allowed=True,
                    )
                elif 400 <= response.status_code < 500:
                    raise DownstreamError(
                        f"Downstream rejected request with {response.status_code}",
                        retry_allowed=False,
                    )

                return DownstreamResponse(
                    status_code=response.status_code,
                    body=body,
                    delivery_time_sec=delivery_time,
                )

        except httpx.TimeoutException as exc:
            raise DownstreamError(
                f"Downstream service timeout after {self.timeout_sec}s",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except (httpx.NetworkError, httpx.ConnectError) as exc:
            raise DownstreamError(
                f"Cannot reach downstream service at {url}",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except httpx.HTTPStatusError as exc:
            retry_allowed = exc.response.status_code >= 500
            raise DownstreamError(
                f"Downstream HTTP {exc.response.status_code}",
                retry_allowed=retry_allowed,
                original_error=exc,
            ) from exc

    def _save_to_dead_letter(
        self,
        job_id: str,
        fhir_bundle: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Save undeliverable bundle to dead letter queue.

        Args:
            job_id: Gateway job ID
            fhir_bundle: FHIR bundle
            metadata: Optional metadata
        """
        if not self.dead_letter_dir:
            return

        import json
        from pathlib import Path

        try:
            dl_path = Path(self.dead_letter_dir)
            dl_path.mkdir(parents=True, exist_ok=True)

            payload = {
                "job_id": job_id,
                "timestamp": time.time(),
                "bundle": fhir_bundle,
                "metadata": metadata or {},
            }

            file_path = dl_path / f"deadletter_{job_id}_{int(time.time() * 1000)}.json"
            with open(file_path, "w") as f:
                json.dump(payload, f, indent=2, default=str)
        except Exception:
            # Silent failure - don't block job processing
            pass
