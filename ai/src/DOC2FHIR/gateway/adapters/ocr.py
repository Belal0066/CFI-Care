"""OCR adapter for vLLM PaddleOCR service."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import httpx


class OCRErrorType(str, Enum):
    """Classification of OCR errors."""

    TIMEOUT = "timeout"
    NETWORK = "network"
    SERVICE_ERROR = "service_error"
    INVALID_FORMAT = "invalid_format"
    FILE_ERROR = "file_error"
    UNKNOWN = "unknown"


class OCRError(Exception):
    """Base OCR adapter exception."""

    def __init__(
        self,
        error_type: OCRErrorType,
        message: str,
        retry_allowed: bool = True,
        original_error: Exception | None = None,
    ):
        self.error_type = error_type
        self.message = message
        self.retry_allowed = retry_allowed
        self.original_error = original_error
        super().__init__(message)


class OCROutput:
    """Normalized OCR output payload."""

    def __init__(
        self,
        raw_output: dict[str, Any],
        extracted_text: str,
        layouts: list[dict[str, Any]],
        processing_time_sec: float,
    ):
        self.raw_output = raw_output
        self.extracted_text = extracted_text
        self.layouts = layouts
        self.processing_time_sec = processing_time_sec
        self.timestamp = datetime.now(timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "extracted_text": self.extracted_text,
            "layouts": self.layouts,
            "processing_time_sec": self.processing_time_sec,
            "timestamp": self.timestamp.isoformat(),
            "raw_output": self.raw_output,
        }


class OCRAdapter:
    """Client for vLLM PaddleOCR inference service."""

    def __init__(
        self,
        base_url: str,
        timeout_sec: int = 300,
        max_retries: int = 3,
        retry_delay_sec: float = 2.0,
    ):
        """Initialize OCR adapter.

        Args:
            base_url: Base URL for OCR service (e.g., http://127.0.0.1:7862)
            timeout_sec: Request timeout in seconds
            max_retries: Maximum number of retries for transient failures
            retry_delay_sec: Initial delay between retries (exponential backoff)
        """
        self.base_url = base_url.rstrip("/")
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries
        self.retry_delay_sec = retry_delay_sec

    def _classify_error(self, error: Exception, attempt: int) -> OCRErrorType:
        """Classify error to determine if retry is allowed."""
        if isinstance(error, httpx.TimeoutException):
            return OCRErrorType.TIMEOUT
        if isinstance(error, (httpx.NetworkError, httpx.ConnectError)):
            return OCRErrorType.NETWORK
        if isinstance(error, httpx.HTTPStatusError):
            # 5xx errors are retryable; 4xx generally are not
            if 500 <= error.response.status_code < 600:
                return OCRErrorType.SERVICE_ERROR
            return OCRErrorType.INVALID_FORMAT
        return OCRErrorType.UNKNOWN

    def process_document(self, file_path: Path) -> OCROutput:
        """Process a document through OCR.

        Args:
            file_path: Path to the document file

        Returns:
            OCROutput with normalized results

        Raises:
            OCRError: If processing fails after retries
        """
        if not file_path.exists():
            raise OCRError(
                OCRErrorType.FILE_ERROR,
                f"File not found: {file_path}",
                retry_allowed=False,
            )

        attempt = 0
        last_error = None

        while attempt <= self.max_retries:
            try:
                return self._call_ocr_service(file_path)
            except OCRError as exc:
                last_error = exc
                if not exc.retry_allowed or attempt >= self.max_retries:
                    raise
                delay = self.retry_delay_sec * (2 ** attempt)
                time.sleep(delay)
                attempt += 1
            except Exception as exc:
                error_type = self._classify_error(exc, attempt)
                retry_allowed = error_type in (
                    OCRErrorType.TIMEOUT,
                    OCRErrorType.NETWORK,
                    OCRErrorType.SERVICE_ERROR,
                )
                ocr_error = OCRError(
                    error_type,
                    f"OCR service error: {str(exc)}",
                    retry_allowed=retry_allowed,
                    original_error=exc,
                )
                last_error = ocr_error
                if not retry_allowed or attempt >= self.max_retries:
                    raise ocr_error
                delay = self.retry_delay_sec * (2 ** attempt)
                time.sleep(delay)
                attempt += 1

        # Should not reach here; ensure we raise the last error
        if last_error:
            raise last_error
        raise OCRError(OCRErrorType.UNKNOWN, "OCR processing failed without error details")

    def _call_ocr_service(self, file_path: Path) -> OCROutput:
        """Make the actual call to the OCR service.

        Args:
            file_path: Path to the document file

        Returns:
            OCROutput with normalized results

        Raises:
            OCRError: On service or format errors
        """
        start_time = time.time()
        url = f"{self.base_url}/parse_api"

        try:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f, "application/octet-stream")}
                with httpx.Client(timeout=self.timeout_sec) as client:
                    response = client.post(url, files=files)
                    response.raise_for_status()

            result = response.json()
            processing_time = time.time() - start_time

            # Normalize OCR output
            return self._normalize_output(result, processing_time)

        except httpx.TimeoutException as exc:
            raise OCRError(
                OCRErrorType.TIMEOUT,
                f"OCR service timeout after {self.timeout_sec}s",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except (httpx.NetworkError, httpx.ConnectError) as exc:
            raise OCRError(
                OCRErrorType.NETWORK,
                f"Cannot reach OCR service at {url}",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except httpx.HTTPStatusError as exc:
            retry_allowed = 500 <= exc.response.status_code < 600
            raise OCRError(
                OCRErrorType.SERVICE_ERROR,
                f"OCR service returned {exc.response.status_code}: {exc.response.text[:200]}",
                retry_allowed=retry_allowed,
                original_error=exc,
            ) from exc
        except (json.JSONDecodeError, ValueError) as exc:
            raise OCRError(
                OCRErrorType.INVALID_FORMAT,
                f"OCR service returned invalid JSON: {str(exc)}",
                retry_allowed=False,
                original_error=exc,
            ) from exc

    def _normalize_output(self, raw_output: dict[str, Any], processing_time: float) -> OCROutput:
        """Normalize raw OCR service output to canonical format.

        Args:
            raw_output: Raw response from OCR service
            processing_time: Processing time in seconds

        Returns:
            OCROutput with normalized data

        Raises:
            OCRError: If output format is invalid
        """
        try:
            # PaddleOCR-VL typically returns structured layout data
            # Normalize to common format: extracted text + layout metadata
            extracted_text = ""
            layouts = []

            # Handle different response formats
            if isinstance(raw_output, dict):
                # If service returns text directly
                if "text" in raw_output:
                    extracted_text = str(raw_output.get("text", ""))
                # If service returns layout/page data
                if "pages" in raw_output:
                    for page in raw_output.get("pages", []):
                        layouts.append({
                            "page": page.get("page_number", 0),
                            "content": page.get("content", ""),
                            "blocks": page.get("blocks", []),
                        })
                    # Combine all page content for full text
                    extracted_text = "\n".join(
                        p.get("content", "") for p in raw_output.get("pages", [])
                    )
                # If service returns blocks/layout directly
                if "blocks" in raw_output:
                    layouts.append({"blocks": raw_output.get("blocks", [])})
                    # Extract text from blocks
                    blocks = raw_output.get("blocks", [])
                    if isinstance(blocks, list):
                        texts = [b.get("text", "") for b in blocks if isinstance(b, dict)]
                        extracted_text = " ".join(texts)

            return OCROutput(
                raw_output=raw_output,
                extracted_text=extracted_text or str(raw_output),
                layouts=layouts,
                processing_time_sec=processing_time,
            )

        except Exception as exc:
            raise OCRError(
                OCRErrorType.INVALID_FORMAT,
                f"Failed to normalize OCR output: {str(exc)}",
                retry_allowed=False,
                original_error=exc,
            ) from exc
