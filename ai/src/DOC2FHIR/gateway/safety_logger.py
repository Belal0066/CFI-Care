from __future__ import annotations

import logging
from typing import Any


class SafetyLogger:
    def __init__(self, logger: logging.Logger | None = None):
        self.logger = logger or logging.getLogger(__name__)

    def log_confidence(self, item_type: str, text: str | None, confidence: float) -> None:
        self.logger.info(
            "confidence_signal",
            extra={
                "item_type": item_type,
                "text": text,
                "confidence": confidence,
            },
        )

    def log_drop(self, item_type: str, reason: str, details: dict[str, Any] | None = None) -> None:
        self.logger.warning(
            "resource_dropped",
            extra={"item_type": item_type, "reason": reason, "details": details or {}},
        )

    def log_validation_errors(self, errors: list[str]) -> None:
        for err in errors:
            self.logger.error("validator_error", extra={"error": err})
