from __future__ import annotations

from pathlib import Path

import pytest

from gateway.adapters.downstream import DownstreamAdapter, DownstreamError, DownstreamResponse
from gateway.adapters.mapper import MapperOutput
from gateway.adapters.ocr import OCROutput
from gateway.config import GatewaySettings
from gateway.models import JobStatus
from gateway.orchestrator import JobOrchestrator
from gateway.repository import JobRepository


pytestmark = [pytest.mark.epic_e]


def test_E1_downstream_payload_contract(monkeypatch: pytest.MonkeyPatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        text = "ok"

        @staticmethod
        def json():
            return {"accepted": True}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr("gateway.adapters.downstream.httpx.Client", FakeClient)

    # The adapter posts to the configured URL with any trailing slash stripped (DownstreamAdapter.__init__).
    adapter = DownstreamAdapter("http://downstream/v1/docfhir/")
    response = adapter.deliver_fhir_bundle("job_e1", {"resourceType": "Bundle"}, {"source": "gateway"})

    assert response.success is True
    assert captured["url"] == "http://downstream/v1/docfhir"
    assert captured["json"]["job_id"] == "job_e1"
    assert "bundle" in captured["json"]
    assert captured["json"]["metadata"]["source"] == "gateway"


def test_E2_downstream_success_parses_json_or_text(monkeypatch: pytest.MonkeyPatch):
    class JsonResponse:
        status_code = 201
        text = ""

        @staticmethod
        def json():
            return {"ok": 1}

    class TextResponse:
        status_code = 202
        text = "accepted"

        @staticmethod
        def json():
            raise ValueError("not json")

    class FakeClient:
        calls = 0

        def __init__(self, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json):
            FakeClient.calls += 1
            return JsonResponse() if FakeClient.calls == 1 else TextResponse()

    monkeypatch.setattr("gateway.adapters.downstream.httpx.Client", FakeClient)

    adapter = DownstreamAdapter("http://downstream")
    r1 = adapter.deliver_fhir_bundle("job1", {"resourceType": "Bundle"})
    r2 = adapter.deliver_fhir_bundle("job2", {"resourceType": "Bundle"})

    assert r1.body == {"ok": 1}
    assert r2.body == "accepted"


def test_E3_downstream_retries_and_writes_dead_letter(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    dead = tmp_path / "dead"
    adapter = DownstreamAdapter("http://downstream", max_retries=2, dead_letter_dir=str(dead))
    monkeypatch.setattr("gateway.adapters.downstream.time.sleep", lambda _: None)

    calls = {"n": 0}

    def _always_fail(*args, **kwargs):
        calls["n"] += 1
        raise DownstreamError("svc down", retry_allowed=True)

    monkeypatch.setattr(adapter, "_call_downstream_service", _always_fail)

    with pytest.raises(DownstreamError):
        adapter.deliver_fhir_bundle("job_e3", {"resourceType": "Bundle"}, {"x": 1})

    assert calls["n"] == 3
    dead_files = list(dead.glob("deadletter_job_e3_*.json"))
    assert len(dead_files) >= 1


def test_E4_orchestrator_terminal_state_rules(tmp_path: Path):
    runtime = tmp_path / "runtime"
    settings = GatewaySettings(runtime_dir=runtime, db_path=runtime / "gateway.db", upload_dir=runtime / "uploads")
    settings.ensure_directories()

    repo = JobRepository(settings.db_path)
    repo.bootstrap()

    upload_file = settings.upload_dir / "e4.pdf"
    upload_file.write_bytes(b"pdf")

    repo.create_job(
        job_id="job_e4_ok",
        filename="e4.pdf",
        content_type="application/pdf",
        metadata={},
        detail="queued",
        upload_path=str(upload_file),
    )
    repo.create_job(
        job_id="job_e4_fail",
        filename="e4.pdf",
        content_type="application/pdf",
        metadata={},
        detail="queued",
        upload_path=str(upload_file),
    )

    class FakeOCR:
        def process_document(self, _):
            return OCROutput(raw_output={"text": "x"}, extracted_text="x", layouts=[], processing_time_sec=0.1)

    class FakeMapper:
        def map_to_fhir(self, ocr_text, metadata):
            return MapperOutput(
                fhir_bundle={"resourceType": "Bundle", "id": "b"},
                raw_response='{"resourceType":"Bundle"}',
                processing_time_sec=0.1,
                model_name="m",
            )

    class GoodDownstream:
        def deliver_fhir_bundle(self, job_id, bundle, metadata):
            return DownstreamResponse(status_code=200, body={"ok": True}, delivery_time_sec=0.1)

    class BadDownstream:
        def deliver_fhir_bundle(self, job_id, bundle, metadata):
            raise DownstreamError("boom", retry_allowed=False)

    import asyncio

    ok_orch = JobOrchestrator(repo, settings, ocr_adapter=FakeOCR(), mapper_adapter=FakeMapper(), downstream_adapter=GoodDownstream())
    asyncio.run(ok_orch.process_job("job_e4_ok"))
    assert repo.get_job_by_id("job_e4_ok").state == JobStatus.COMPLETED

    bad_orch = JobOrchestrator(repo, settings, ocr_adapter=FakeOCR(), mapper_adapter=FakeMapper(), downstream_adapter=BadDownstream())
    asyncio.run(bad_orch.process_job("job_e4_fail"))
    failed = repo.get_job_by_id("job_e4_fail")
    assert failed.state == JobStatus.FAILED
    assert failed.error_code == "downstream_error"
    assert "boom" in (failed.error_message or "")
