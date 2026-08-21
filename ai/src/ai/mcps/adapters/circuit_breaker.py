"""
A small async circuit breaker for MedMCP's external API adapters
(PubMed, OpenFDA, MedlinePlus).

These are third-party dependencies outside our control, with their own
rate limits and uptime — this is the hop the architecture redesign
specifically justified a circuit breaker for, as distinct from the
client -> MCP-server hop (a co-located dependency, where a breaker adds
no value and isn't added here).

States: closed (normal) -> open (failing fast after too many consecutive
failures, for reset_timeout_sec) -> half_open (one trial call once the
cooldown elapses) -> closed on success or back to open on failure.
"""
import asyncio
import logging
import time
from enum import Enum
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the circuit is open."""


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 3, reset_timeout_sec: float = 60.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout_sec = reset_timeout_sec
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._opened_at = 0.0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Open transitions to half-open once the cooldown has elapsed, without needing a call to happen."""
        if self._state == CircuitState.OPEN and (time.monotonic() - self._opened_at) >= self.reset_timeout_sec:
            return CircuitState.HALF_OPEN
        return self._state

    async def call(self, func: Callable[..., Awaitable[T]], *args, **kwargs) -> T:
        current = self.state
        if current == CircuitState.OPEN:
            raise CircuitOpenError(
                f"Circuit '{self.name}' is open — failing fast without calling the external API"
            )

        try:
            result = await func(*args, **kwargs)
        except Exception:
            async with self._lock:
                self._consecutive_failures += 1
                if current == CircuitState.HALF_OPEN or self._consecutive_failures >= self.failure_threshold:
                    self._state = CircuitState.OPEN
                    self._opened_at = time.monotonic()
                    logger.warning(
                        f"Circuit '{self.name}' opened after {self._consecutive_failures} "
                        f"consecutive failures — failing fast for {self.reset_timeout_sec:.0f}s"
                    )
            raise
        else:
            async with self._lock:
                if self._state != CircuitState.CLOSED:
                    logger.info(f"Circuit '{self.name}' closed — external API call recovered")
                self._consecutive_failures = 0
                self._state = CircuitState.CLOSED
            return result
