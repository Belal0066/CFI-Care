from __future__ import annotations

import logging
from pathlib import Path

import httpx
import pytest

from gateway.adapters.ocr import OCRAdapter, OCRError, OCRErrorType, OCROutput
from gateway.config import GatewaySettings
from gateway.models import JobStatus
from gateway.observability import StructuredLogger
from gateway.orchestrator import JobOrchestrator
from gateway.repository import JobRepository


pytestmark = [pytest.mark.epic_c]


def test_C1_ocr_retries_transient_failures_then_succeeds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    file_path = tmp_path / "doc.pdf"
    file_path.write_bytes(b"pdf")

    adapter = OCRAdapter("http://ocr", max_retries=2, retry_delay_sec=0.01)
    monkeypatch.setattr("gateway.adapters.ocr.time.sleep", lambda _: None)

    calls = {"n": 0}

    def _fake_call(_: Path):
        calls["n"] += 1
        if calls["n"] < 3:
            raise OCRError(OCRErrorType.TIMEOUT, "timeout", retry_allowed=True)
        return OCROutput(raw_output={"text": "ok"}, extracted_text="ok", layouts=[], processing_time_sec=0.1)

    monkeypatch.setattr(adapter, "_call_ocr_service", _fake_call)

    result = adapter.process_document(file_path)
    assert result.extracted_text == "ok"
    assert calls["n"] == 3


@pytest.mark.parametrize(
    "raw, expected_text, expected_layout_len",
    [
        ({"text": "hello"}, "hello", 0),
        ({"pages": [{"page_number": 1, "content": "p1", "blocks": []}]}, "p1", 1),
        ({"blocks": [{"text": "a"}, {"text": "b"}]}, "a b", 1),
    ],
)
def test_C2_ocr_normalization_variants(raw, expected_text, expected_layout_len):
    adapter = OCRAdapter("http://ocr")
    out = adapter._normalize_output(raw, 0.2)
    assert out.extracted_text == expected_text
    assert len(out.layouts) == expected_layout_len


def test_C3_orchestrator_ocr_stage_persists_artifact_and_event(tmp_path: Path):
    runtime = tmp_path / "runtime"
    settings = GatewaySettings(runtime_dir=runtime, db_path=runtime / "gateway.db", upload_dir=runtime / "uploads")
    settings.ensure_directories()
    repo = JobRepository(settings.db_path)
    repo.bootstrap()

    upload_file = settings.upload_dir / "c3.pdf"
    upload_file.write_bytes(b"pdf")

    repo.create_job(
        job_id="job_c3",
        filename="c3.pdf",
        content_type="application/pdf",
        metadata={},
        detail="queued",
        upload_path=str(upload_file),
    )

    class FakeOCR:
        def process_document(self, _):
            return OCROutput(
                raw_output={"text": "clinical note"},
                extracted_text="clinical note",
                layouts=[{"page": 1}],
                processing_time_sec=0.33,
            )

    orchestrator = JobOrchestrator(repo, settings, ocr_adapter=FakeOCR())

    import asyncio

    log = StructuredLogger(logging.getLogger("test"), correlation_id="job_c3")
    result = asyncio.run(orchestrator._run_ocr_stage("job_c3", str(upload_file), log=log))
    assert result["extracted_text"] == "clinical note"

    job = repo.get_job_by_id("job_c3")
    assert job.state == JobStatus.OCR_PROCESSING
    assert job.ocr_output_path is not None
    assert Path(job.ocr_output_path).exists()

    events = repo.list_job_events("job_c3")
    assert events[-1]["payload"]["text_length"] == len("clinical note")


def test_C4_ocr_error_classification_retry_policy():
    adapter = OCRAdapter("http://ocr")
    req = httpx.Request("POST", "http://ocr/ocr")

    timeout_kind = adapter._classify_error(httpx.TimeoutException("t"), 0)
    network_kind = adapter._classify_error(httpx.ConnectError("c", request=req), 0)

    resp_500 = httpx.Response(500, request=req)
    err_500 = httpx.HTTPStatusError("boom", request=req, response=resp_500)
    service_kind = adapter._classify_error(err_500, 0)

    resp_400 = httpx.Response(400, request=req)
    err_400 = httpx.HTTPStatusError("bad", request=req, response=resp_400)
    invalid_kind = adapter._classify_error(err_400, 0)

    assert timeout_kind == OCRErrorType.TIMEOUT
    assert network_kind == OCRErrorType.NETWORK
    assert service_kind == OCRErrorType.SERVICE_ERROR
    assert invalid_kind == OCRErrorType.INVALID_FORMAT
