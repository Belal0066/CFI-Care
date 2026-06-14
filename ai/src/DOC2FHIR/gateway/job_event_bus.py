from __future__ import annotations

import asyncio
from typing import Any


class JobEventBus:
    """In-memory pub/sub bus for real-time job status events.

    Each WebSocket subscriber for a job_id gets its own asyncio.Queue.
    The orchestrator publishes an event dict after every stage transition;
    the WebSocket endpoint drains the queue and forwards it to the client.
    """

    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}

    def subscribe(self, job_id: str) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._queues.setdefault(job_id, []).append(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        listeners = self._queues.get(job_id)
        if listeners and q in listeners:
            listeners.remove(q)
        if not listeners:
            self._queues.pop(job_id, None)

    async def publish(self, job_id: str, event: dict[str, Any]) -> None:
        for q in list(self._queues.get(job_id, [])):
            await q.put(event)

    def publish_nowait(self, job_id: str, event: dict[str, Any]) -> None:
        """Fire-and-forget publish from sync context."""
        for q in list(self._queues.get(job_id, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def subscriber_count(self, job_id: str) -> int:
        return len(self._queues.get(job_id, []))
