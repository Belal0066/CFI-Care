from __future__ import annotations

from pathlib import Path

import pytest

from gateway.adapters.mapper import MapperAdapter, MapperOutput, MapperValidationError
from gateway.config import GatewaySettings
from gateway.models import JobStatus
from gateway.orchestrator import JobOrchestrator
from gateway.repository import JobRepository


pytestmark = [pytest.mark.epic_d]


def test_D1_mapper_request_shape_and_content(monkeypatch: pytest.MonkeyPatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {
                "model": "fake-model",
                "choices": [{"message": {"content": '{"resourceType":"Bundle"}'}}],
            }

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

    monkeypatch.setattr("gateway.adapters.mapper.httpx.Client", FakeClient)

    adapter = MapperAdapter("http://mapper", model_name="llama")
    out = adapter.map_to_fhir("patient has fever", {"patient_id": "P1"})

    assert out.fhir_bundle["resourceType"] == "Bundle"
    assert captured["url"].endswith("/v1/chat/completions")
    assert captured["json"]["model"] == "llama"
    assert isinstance(captured["json"]["messages"], list)


def test_D2_mapper_extract_and_validate_fhir_valid_and_invalid():
    adapter = MapperAdapter("http://mapper")

    valid = adapter._extract_and_validate_fhir('{"resourceType":"Bundle"}')
    assert valid["resourceType"] == "Bundle"

    with pytest.raises(MapperValidationError):
        adapter._extract_and_validate_fhir("not-json")

    with pytest.raises(MapperValidationError):
        adapter._extract_and_validate_fhir('[{"resourceType":"Bundle"}]')

    with pytest.raises(MapperValidationError):
        adapter._extract_and_validate_fhir('{"id":"missing_type"}')


def test_D3_internal_callback_success_and_failure(client, repo):
    upload = client.post(
        "/v1/document/upload",
        files={"file": ("cb.pdf", b"%PDF", "application/pdf")},
    )
    job_id = upload.json()["job_id"]

    success_payload = {
        "job_id": job_id,
        "status": "completed",
        "fhir_bundle": {"resourceType": "Bundle", "id": "b1"},
    }
    success = client.post("/v1/internal/callback", json=success_payload)
    assert success.status_code == 200

    completed = repo.get_job_by_id(job_id)
    assert completed.state == JobStatus.COMPLETED
    assert completed.fhir_output_path is not None
    assert Path(completed.fhir_output_path).exists()

    upload2 = client.post(
        "/v1/document/upload",
        files={"file": ("cb2.pdf", b"%PDF", "application/pdf")},
    )
    job_id_2 = upload2.json()["job_id"]

    failure = client.post(
        "/v1/internal/callback",
        json={"job_id": job_id_2, "status": "failed", "error": "mapper failed"},
    )
    assert failure.status_code == 200
    failed = repo.get_job_by_id(job_id_2)
    assert failed.state == JobStatus.FAILED
    assert failed.error_code == "callback_error"


def test_D4_orchestrator_mapper_stage_persists_fhir_and_metadata(tmp_path: Path):
    runtime = tmp_path / "runtime"
    settings = GatewaySettings(runtime_dir=runtime, db_path=runtime / "gateway.db", upload_dir=runtime / "uploads")
    settings.ensure_directories()
    repo = JobRepository(settings.db_path)
    repo.bootstrap()

    upload_file = settings.upload_dir / "d4.pdf"
    upload_file.write_bytes(b"pdf")

    repo.create_job(
        job_id="job_d4",
        filename="d4.pdf",
        content_type="application/pdf",
        metadata={"source": "unit"},
        detail="queued",
        upload_path=str(upload_file),
    )

    class FakeMapper:
        def map_to_fhir(self, ocr_text, metadata):
            return MapperOutput(
                fhir_bundle={"resourceType": "Bundle", "id": "bundle-1"},
                raw_response='{"resourceType":"Bundle","id":"bundle-1"}',
                processing_time_sec=0.42,
                model_name="llama-test",
            )

    orchestrator = JobOrchestrator(repo, settings, mapper_adapter=FakeMapper())

    import asyncio

    mapper_output = asyncio.run(orchestrator._run_mapper_stage("job_d4", "text", {"source": "unit"}, log=None))
    assert mapper_output["fhir_bundle"]["resourceType"] == "Bundle"

    job = repo.get_job_by_id("job_d4")
    assert job.state == JobStatus.MAPPING
    assert job.fhir_output_path is not None
    assert Path(job.fhir_output_path).exists()

    events = repo.list_job_events("job_d4")
    assert events[-1]["payload"]["model"] == "llama-test"
    assert events[-1]["payload"]["bundle_type"] == "Bundle"
