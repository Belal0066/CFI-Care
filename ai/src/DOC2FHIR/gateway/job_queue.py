from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod


class QueueFullError(RuntimeError):
    """Raised when the queue cannot accept additional jobs."""


class JobQueue(ABC):
    """Queue abstraction for job dispatching.

    Keep this interface stable so Redis/RabbitMQ-backed implementations can be
    dropped in without changing upload or worker flow.
    """

    @abstractmethod
    def enqueue_nowait(self, job_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def dequeue(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def task_done(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def size(self) -> int:
        raise NotImplementedError

    @abstractmethod
    def capacity(self) -> int:
        raise NotImplementedError

    @abstractmethod
    def is_full(self) -> bool:
        raise NotImplementedError


class InMemoryJobQueue(JobQueue):
    """Bounded in-memory queue implementation for local deployments."""

    def __init__(self, max_size: int):
        self._queue: asyncio.Queue[str] = asyncio.Queue(maxsize=max_size)

    def enqueue_nowait(self, job_id: str) -> None:
        try:
            self._queue.put_nowait(job_id)
        except asyncio.QueueFull as exc:
            raise QueueFullError("Job queue is full") from exc

    async def dequeue(self) -> str:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    def size(self) -> int:
        return self._queue.qsize()

    def capacity(self) -> int:
        return self._queue.maxsize

    def is_full(self) -> bool:
        return self._queue.full()
