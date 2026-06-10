"""Observability and logging utilities."""

from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

# Configure structured logging
def configure_logging(log_level: str = "INFO") -> None:
    """Configure JSON structured logging."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(message)s",
    )


class StructuredLogger:
    """Structured JSON logging for observability."""

    def __init__(self, logger: logging.Logger, correlation_id: Optional[str] = None):
        self.logger = logger
        self.correlation_id = correlation_id

    def _format_event(
        self,
        level: str,
        message: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Format a log event as structured JSON."""
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
        if self.correlation_id:
            event["correlation_id"] = self.correlation_id
        event.update(kwargs)
        return event

    def info(self, message: str, **kwargs: Any) -> None:
        """Log info level event."""
        event = self._format_event("INFO", message, **kwargs)
        self.logger.info(json.dumps(event))

    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning level event."""
        event = self._format_event("WARNING", message, **kwargs)
        self.logger.warning(json.dumps(event))

    def error(self, message: str, exception: Optional[Exception] = None, **kwargs: Any) -> None:
        """Log error level event."""
        if exception:
            kwargs["exception"] = {
                "type": type(exception).__name__,
                "message": str(exception),
            }
        event = self._format_event("ERROR", message, **kwargs)
        self.logger.error(json.dumps(event))

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug level event."""
        event = self._format_event("DEBUG", message, **kwargs)
        self.logger.debug(json.dumps(event))

    @contextmanager
    def timer(self, operation: str, **kwargs: Any) -> Iterator[dict[str, Any]]:
        """Context manager for timing operations.

        Usage:
            with logger.timer("ocr_processing", job_id=job_id) as timing:
                # do work
                timing["ocr_pages"] = 5
        """
        timing_data: dict[str, Any] = {}
        start_time = time.time()
        try:
            yield timing_data
        finally:
            elapsed_sec = time.time() - start_time
            timing_data["duration_sec"] = elapsed_sec
            self.info(f"{operation} completed", **{f"{operation}_duration_sec": elapsed_sec, **timing_data, **kwargs})


class MetricsCollector:
    """Collect and track metrics for observability."""

    def __init__(self):
        self.metrics: dict[str, list[float]] = {}
        self.counters: dict[str, int] = {}

    def record_metric(self, name: str, value: float) -> None:
        """Record a metric value."""
        if name not in self.metrics:
            self.metrics[name] = []
        self.metrics[name].append(value)

    def increment_counter(self, name: str, amount: int = 1) -> None:
        """Increment a counter."""
        self.counters[name] = self.counters.get(name, 0) + amount

    def get_summary(self) -> dict[str, Any]:
        """Get summary of all metrics and counters."""
        summary = {
            "counters": self.counters,
            "metrics": {},
        }

        for name, values in self.metrics.items():
            if values:
                summary["metrics"][name] = {
                    "count": len(values),
                    "min": min(values),
                    "max": max(values),
                    "avg": sum(values) / len(values),
                    "total": sum(values),
                }

        return summary


# Global metrics collector
_metrics = MetricsCollector()


def get_metrics() -> MetricsCollector:
    """Get the global metrics collector."""
    return _metrics


def record_job_metric(job_id: str, stage: str, duration_sec: float) -> None:
    """Record job stage timing metric."""
    _metrics.record_metric(f"stage_{stage}_sec", duration_sec)
    _metrics.increment_counter(f"jobs_{stage}_completed")


def record_job_error(job_id: str, error_type: str) -> None:
    """Record job error."""
    _metrics.increment_counter(f"errors_{error_type}")
    _metrics.increment_counter("jobs_failed")
