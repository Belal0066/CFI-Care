"""Adapter for Node.js job completion/failure callbacks.

Sends POST /v1/internal/jobs/callback to the Node.js backend
when a job reaches a terminal state (COMPLETED or FAILED).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

from ..models import CallbackErrorPayload, CallbackPayload

logger = logging.getLogger(__name__)


class NodeJsCallbackError(Exception):
    """Raised when callback delivery fails after all retries."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass
class CallbackResult:
    success: bool
    status_code: int | None
    delivery_time_sec: float
    error: str | None = None


class NodeJsCallbackAdapter:
    """HTTP client that POSTs job status updates to the Node.js backend.

    Carries the X-Internal-Secret header for authentication.
    Retries with exponential backoff on transient failures.
    Dead-letters undeliverable payloads after exhausting retries.
    """

    def __init__(
        self,
        callback_url: str,
        internal_secret: str,
        max_retries: int = 3,
        backoff_base: float = 1.0,
        timeout_sec: int = 10,
        dead_letter_dir: str | None = None,
    ):
        self.callback_url = callback_url.rstrip("/")
        self.internal_secret = internal_secret
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.timeout_sec = timeout_sec
        self.dead_letter_dir = dead_letter_dir

    async def send(
        self,
        job_id: str,
        status: str,
        completed_at: str,
        error: Optional[CallbackErrorPayload] = None,
    ) -> CallbackResult:
        """Send a job status callback to the Node.js backend.

        Args:
            job_id: Gateway job ID.
            status: "COMPLETED" or "FAILED".
            completed_at: ISO-8601 timestamp of when the job finished.
            error: Optional error details for FAILED status.

        Returns:
            CallbackResult with delivery outcome.
        """
        payload = CallbackPayload(
            job_id=job_id,
            status=status,
            completed_at=completed_at,
            error=error,
        )

        start_time = time.time()

        for attempt in range(self.max_retries + 1):
            try:
                result = await self._do_post(payload)
                logger.info(
                    "Callback sent for job %s: status=%s HTTP %s",
                    job_id, status, result.status_code,
                )
                return result

            except NodeJsCallbackError as exc:
                if attempt < self.max_retries and exc.status_code is not None and exc.status_code >= 500:
                    delay = self.backoff_base * (2 ** attempt)
                    logger.warning(
                        "Callback retry %d/%d for job %s: %s (retry in %.1fs)",
                        attempt + 1, self.max_retries, job_id, exc.message, delay,
                    )
                    await asyncio.sleep(delay)
                elif attempt < self.max_retries and exc.status_code is None:
                    delay = self.backoff_base * (2 ** attempt)
                    logger.warning(
                        "Callback retry %d/%d for job %s: %s (retry in %.1fs)",
                        attempt + 1, self.max_retries, job_id, exc.message, delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    self._save_dead_letter(job_id, payload, exc.message)
                    elapsed = time.time() - start_time
                    return CallbackResult(
                        success=False,
                        status_code=exc.status_code,
                        delivery_time_sec=elapsed,
                        error=exc.message,
                    )

        elapsed = time.time() - start_time
        return CallbackResult(
            success=False,
            status_code=None,
            delivery_time_sec=elapsed,
            error="Callback delivery failed: exhausted retries",
        )

    async def _do_post(self, payload: CallbackPayload) -> CallbackResult:
        payload_dict = payload.model_dump(mode="json")
        start_time = time.time()

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            try:
                response = await client.post(
                    self.callback_url,
                    json=payload_dict,
                    headers={
                        "X-Internal-Secret": self.internal_secret,
                        "Content-Type": "application/json",
                    },
                )
            except httpx.TimeoutException as exc:
                raise NodeJsCallbackError(f"Callback timeout: {exc}")
            except httpx.ConnectError as exc:
                raise NodeJsCallbackError(f"Callback connection refused: {exc}")
            except httpx.HTTPError as exc:
                raise NodeJsCallbackError(f"Callback HTTP error: {exc}")

            elapsed = time.time() - start_time

            if response.status_code >= 500:
                raise NodeJsCallbackError(
                    f"Node.js returned {response.status_code}: {response.text[:200]}",
                    status_code=response.status_code,
                )

            return CallbackResult(
                success=200 <= response.status_code < 300,
                status_code=response.status_code,
                delivery_time_sec=elapsed,
            )

    def _save_dead_letter(self, job_id: str, payload: CallbackPayload, error: str) -> None:
        if not self.dead_letter_dir:
            return
        try:
            dl_path = Path(self.dead_letter_dir)
            dl_path.mkdir(parents=True, exist_ok=True)
            record = {
                "job_id": job_id,
                "timestamp": time.time(),
                "payload": payload.model_dump(mode="json"),
                "error": error,
                "adapter": "nodejs_callback",
            }
            file_path = dl_path / f"callback_deadletter_{job_id}_{int(time.time() * 1000)}.json"
            with open(file_path, "w") as f:
                json.dump(record, f, indent=2, default=str)
        except Exception:
            pass
