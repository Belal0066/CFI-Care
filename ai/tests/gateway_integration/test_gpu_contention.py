from __future__ import annotations

import asyncio
import logging

import pytest

from gateway.observability import StructuredLogger
from gateway.orchestrator import ServerBusyError

pytestmark = [pytest.mark.performance_concurrency]


class TestGpuLockContention:
    def test_concurrent_uploads_all_succeed(self, job_queue, client, sample_pdf_bytes):
        """5 rapid-fire uploads should all succeed and queue up without conflict."""
        def _upload(_):
            return client.post(
                "/v1/documents/upload",
                files={"file": ("test.pdf", sample_pdf_bytes, "application/pdf")},
            )

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(_upload, range(5)))

        for i, resp in enumerate(results):
            assert resp.status_code == 200, f"Upload {i} failed: {resp.text}"
        assert job_queue.size() == 5

    @pytest.mark.asyncio
    async def test_gpu_lock_timeout_raises_server_busy(self, app):
        """When GPU semaphore is held, acquisition times out with ServerBusyError."""
        orch = app.state.orchestrator
        sem = orch._gpu_semaphore
        await sem.acquire()

        log = StructuredLogger(logging.getLogger(__name__), correlation_id="test-gpu-timeout")
        try:
            with pytest.raises(ServerBusyError):
                await orch._run_gpu_bound_stage(
                    job_id="test-gpu-timeout",
                    stage_name="test",
                    stage_timeout_sec=1,
                    operation=lambda: asyncio.sleep(0.01),
                    log=log,
                )
        finally:
            sem.release()


class TestQueueCapacity:
    def test_queue_accepts_up_to_max_size(self, job_queue, sample_pdf_bytes, client, repo):
        """Upload exactly queue_max_size (32) documents — all should succeed."""
        ids_created = []
        for i in range(32):
            resp = client.post(
                "/v1/documents/upload",
                files={"file": ("doc.pdf", sample_pdf_bytes, "application/pdf")},
            )
            assert resp.status_code == 200, f"Upload {i} failed: {resp.text}"
            body = resp.json()
            assert body["state"] == "PENDING"
            ids_created.append(body["job_id"])

        assert job_queue.is_full()
        assert job_queue.size() == 32

        for jid in ids_created:
            job = repo.get_job_by_id(jid)
            assert job.state == "PENDING"

    def test_queue_rejects_overflow_with_503(self, job_queue, client, sample_pdf_bytes):
        """Fill the queue to capacity, then verify the next upload gets HTTP 503."""
        for i in range(32):
            job_queue.enqueue_nowait(f"prefill-{i}")
        assert job_queue.is_full()

        resp = client.post(
            "/v1/documents/upload",
            files={"file": ("overflow.pdf", sample_pdf_bytes, "application/pdf")},
        )
        assert resp.status_code == 503
        body = resp.json()
        message = body.get("message", "")
        assert "busy" in message.lower() or "capacity" in message.lower()

    def test_queue_capacity_matches_setting(self, job_queue, integration_settings):
        """The queue capacity equals the configured queue_max_size."""
        assert job_queue.capacity() == integration_settings.queue_max_size
        assert job_queue.capacity() == 32

    def test_enqueue_nowait_raises_queue_full(self, job_queue):
        """Direct enqueue beyond capacity raises QueueFullError."""
        from gateway.job_queue import QueueFullError

        for i in range(32):
            job_queue.enqueue_nowait(f"direct-{i}")
        assert job_queue.is_full()

        with pytest.raises(QueueFullError):
            job_queue.enqueue_nowait("overflow-direct")
