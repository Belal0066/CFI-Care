from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

import httpx
import pytest

pytestmark = [pytest.mark.performance_concurrency, pytest.mark.slow]


class TestSqliteWalIntegrity:
    ITERATIONS = 50

    def _create_test_job(self, repo, suffix: str) -> str:
        import uuid
        jid = f"wal-{suffix}-{uuid.uuid4().hex[:8]}"
        repo.create_job(
            job_id=jid,
            filename=f"test-{suffix}.pdf",
            content_type="application/pdf",
            metadata={"test": True},
            detail="WAL test job",
            upload_path="/tmp/test.pdf",
        )
        return jid

    async def _writer(self, repo, job_id: str, iterations: int, errors: list):
        from gateway.models import JobStatus
        for i in range(iterations):
            try:
                state = JobStatus.OCR_PROCESSING if i % 2 == 0 else JobStatus.MAPPING
                repo.update_job_stage(job_id, state=state, detail=f"iter {i}")
            except Exception as exc:
                errors.append(f"writer:{exc}")

    async def _db_reader(self, repo, job_id: str, iterations: int, errors: list):
        for i in range(iterations):
            try:
                repo.get_job_by_id(job_id)
            except Exception as exc:
                errors.append(f"db_reader:{exc}")

    async def _event_reader(self, repo, job_id: str, iterations: int, errors: list):
        for i in range(iterations):
            try:
                repo.list_job_events(job_id)
            except Exception as exc:
                errors.append(f"event_reader:{exc}")

    async def _http_reader(self, client, job_id: str, iterations: int, errors: list):
        for i in range(iterations):
            try:
                resp = await client.get(f"/v1/documents/{job_id}/status")
                if resp.status_code != 200:
                    errors.append(f"http_reader:status={resp.status_code}")
            except Exception as exc:
                errors.append(f"http_reader:{exc}")

    def test_concurrent_read_write_no_locks(self, app, repo):
        """Fire concurrent write/read operations and assert zero database locks."""
        job_ids = [self._create_test_job(repo, str(i)) for i in range(3)]

        errors: list[str] = []

        async def run_concurrent():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                tasks = []
                for jid in job_ids:
                    tasks.append(self._writer(repo, jid, self.ITERATIONS, errors))
                for jid in job_ids:
                    tasks.append(self._db_reader(repo, jid, self.ITERATIONS, errors))
                for jid in job_ids:
                    tasks.append(self._event_reader(repo, jid, self.ITERATIONS // 2, errors))
                for jid in job_ids:
                    tasks.append(self._http_reader(client, jid, self.ITERATIONS // 2, errors))
                await asyncio.gather(*tasks)

        asyncio.run(run_concurrent())

        assert len(errors) == 0, f"Errors during concurrent load ({len(errors)}): {errors[:5]}"

        for jid in job_ids:
            events = repo.list_job_events(jid)
            assert len(events) == 1 + self.ITERATIONS, (
                f"Job {jid}: expected {1 + self.ITERATIONS} events, got {len(events)}"
            )

    def test_wal_mode_is_enabled(self, repo):
        """Verify the database is opened with WAL journal mode."""
        conn = sqlite3.connect(str(repo.db_path))
        try:
            journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert journal_mode == "wal", f"Expected 'wal', got '{journal_mode}'"
        finally:
            conn.close()

    def test_repo_ping_during_concurrent_load(self, repo):
        """repo.ping() returns True even during concurrent load."""
        jid = self._create_test_job(repo, "ping")
        from gateway.models import JobStatus

        errors: list[str] = []
        ping_results: list[bool] = []

        async def storm():
            async def writer():
                for i in range(20):
                    try:
                        repo.update_job_stage(jid, state=JobStatus.OCR_PROCESSING, detail=f"ping {i}")
                    except Exception as exc:
                        errors.append(f"writer_ping:{exc}")

            async def pinger():
                for i in range(20):
                    try:
                        ping_results.append(repo.ping())
                    except Exception as exc:
                        errors.append(f"pinger:{exc}")

            await asyncio.gather(writer(), writer(), pinger())

        asyncio.run(storm())
        assert len(errors) == 0, f"Ping errors: {errors}"
        assert all(ping_results), "Some ping() calls returned False"
        assert len(ping_results) == 20
