from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from gateway.adapters.downstream import DownstreamError
from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

pytestmark = [pytest.mark.performance_concurrency]


class TestFailedStateTransition:
    @pytest.mark.asyncio
    async def test_downstream_failure_transitions_to_failed_state(self, app, repo, tmp_path: Path):
        """When downstream delivery fails after retries, the job enters FAILED state with a FAILED event."""
        orch = app.state.orchestrator
        import uuid
        job_id = f"test-fail-state-{uuid.uuid4().hex[:8]}"

        repo.create_job(
            job_id=job_id,
            filename="test.pdf",
            content_type="application/pdf",
            metadata={"test": True},
            detail="FAILED state test",
            upload_path="/tmp/test.pdf",
        )

        dl_dir = tmp_path / "dead_letters"
        test_adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        original_adapter = orch.downstream_adapter
        orch.downstream_adapter = test_adapter

        with patch.object(test_adapter, "_async_sleep", AsyncMock()):
            with pytest.raises((DownstreamError, HapiFhirDownstreamError)):
                await orch._run_downstream_stage(
                    job_id=job_id,
                    mapper_output={"fhir_bundle": {"resourceType": "Bundle", "type": "transaction", "entry": []}},
                )

        orch.downstream_adapter = original_adapter

        job = repo.get_job_by_id(job_id)
        assert job.state == "FAILED", f"Expected FAILED, got {job.state}"

        events = repo.list_job_events(job_id)
        failed_events = [e for e in events if e["state"] == "FAILED"]
        assert len(failed_events) >= 1, f"No FAILED event in {events}"

        dl_files = list(dl_dir.glob(f"deadletter_{job_id}_*.json"))
        assert len(dl_files) == 1


class TestHapiFhirRetryAndDeadLetter:
    SAMPLE_BUNDLE = {"resourceType": "Bundle", "type": "transaction", "entry": []}

    def test_retry_three_attempts_on_connection_failure(self, tmp_path: Path):
        """HapiFhirDownstreamAdapter retries 3 times before raising."""
        from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

        dl_dir = tmp_path / "dead_letters"
        adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        with patch.object(adapter, "_async_sleep", AsyncMock()):
            with pytest.raises(HapiFhirDownstreamError) as exc_info:
                import asyncio
                asyncio.run(adapter.deliver_fhir_bundle("dl-001", self.SAMPLE_BUNDLE))

        assert "HAPI FHIR" in str(exc_info.value) or "service error" in str(exc_info.value).lower()

    def test_dead_letter_file_written_after_exhausted_retries(self, tmp_path: Path):
        """After retries are exhausted, a dead letter file is saved."""
        from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

        dl_dir = tmp_path / "dead_letters"
        adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        with patch.object(adapter, "_async_sleep", AsyncMock()):
            with pytest.raises(HapiFhirDownstreamError):
                import asyncio
                asyncio.run(adapter.deliver_fhir_bundle("dl-002", self.SAMPLE_BUNDLE))

        dl_files = list(dl_dir.glob("deadletter_dl-002_*.json"))
        assert len(dl_files) == 1, f"Expected 1 dead letter file, got {len(dl_files)}"

    def test_dead_letter_contains_correct_payload(self, tmp_path: Path):
        """Dead letter JSON includes job_id, bundle, error, timestamp, and adapter."""
        from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

        dl_dir = tmp_path / "dead_letters"
        adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        with patch.object(adapter, "_async_sleep", AsyncMock()):
            with pytest.raises(HapiFhirDownstreamError):
                import asyncio
                asyncio.run(adapter.deliver_fhir_bundle("dl-003", self.SAMPLE_BUNDLE))

        dl_files = list(dl_dir.glob("deadletter_dl-003_*.json"))
        assert len(dl_files) == 1
        payload = json.loads(dl_files[0].read_text())
        assert payload["job_id"] == "dl-003"
        assert payload["bundle"] == self.SAMPLE_BUNDLE
        assert "error" in payload
        assert payload["adapter"] == "hapi_fhir"
        assert "timestamp" in payload

    def test_no_dead_letter_on_successful_delivery(self, tmp_path: Path):
        """When delivery succeeds, no dead letter file is created."""
        from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter

        dl_dir = tmp_path / "dead_letters"
        adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        async def _mock_success(*args, **kwargs):
            from gateway.adapters.hapi_fhir import HapiFhirDeliveryResult
            return HapiFhirDeliveryResult(
                status_code=200,
                response_body={},
                delivery_time_sec=0.1,
                created_resources=["Patient/1"],
            )

        adapter._call_hapi_fhir = _mock_success
        import asyncio
        result = asyncio.run(adapter.deliver_fhir_bundle("dl-004", self.SAMPLE_BUNDLE))
        assert result.success
        assert len(list(dl_dir.glob("deadletter_dl-004_*.json"))) == 0

    def test_retry_backoff_timing(self, tmp_path: Path):
        """Retries use exponential backoff (1s, 2s, 4s) — verify with mocked sleep."""
        from gateway.adapters.hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError

        dl_dir = tmp_path / "dead_letters"
        adapter = HapiFhirDownstreamAdapter(
            base_url="http://localhost:19999",
            max_retries=3,
            dead_letter_dir=str(dl_dir),
            timeout_sec=1,
        )

        sleep_durations = []
        async def _tracking_sleep(delay: float) -> None:
            sleep_durations.append(delay)

        import asyncio

        with patch.object(adapter, "_async_sleep", _tracking_sleep):
            with pytest.raises(HapiFhirDownstreamError):
                asyncio.run(adapter.deliver_fhir_bundle("dl-005", self.SAMPLE_BUNDLE))

        # After attempt 0 fails: sleep 1.0, attempt 1 fails: sleep 2.0, attempt 2 fails: sleep 4.0
        assert sleep_durations == [1.0, 2.0, 4.0], f"Unexpected backoff: {sleep_durations}"
