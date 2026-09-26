from __future__ import annotations

from pathlib import Path

import pytest

from gateway.config import GatewaySettings
from gateway.models import JobStatus


pytestmark = [pytest.mark.epic_a]


def test_A1_create_app_bootstrap_and_root_metadata(app):
    assert hasattr(app.state, "settings")
    assert hasattr(app.state, "repository")
    assert hasattr(app.state, "orchestrator")


def test_A1_root_endpoint_returns_service_metadata(client):
    response = client.get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "DOC2FHIR Gateway"
    assert payload["health"] == "/v1/health"


def test_A2_upload_and_status_response_contract(client):
    upload = client.post(
        "/v1/document/upload",
        files={"file": ("doc.pdf", b"%PDF-1.4 test", "application/pdf")},
        data={"metadata": '{"patient_id": "P123"}'},
    )
    assert upload.status_code == 200
    body = upload.json()
    assert {"job_id", "state", "detail", "created_at"}.issubset(body.keys())
    assert body["state"] == JobStatus.PENDING.value

    status = client.get(f"/v1/document/status/{body['job_id']}")
    assert status.status_code == 200
    status_body = status.json()
    expected = {
        "job_id",
        "state",
        "detail",
        "filename",
        "progress",
        "created_at",
        "updated_at",
        "started_at",
        "finished_at",
        "error_code",
        "error_message",
        "correlation_id",
        "metadata",
    }
    assert expected.issubset(status_body.keys())
    assert status_body["state"] in {s.value for s in JobStatus}


def test_A3_from_env_and_directory_creation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    runtime = tmp_path / "env_runtime"
    monkeypatch.setenv("DOC2FHIR_GATEWAY_RUNTIME_DIR", str(runtime))
    monkeypatch.setenv("DOC2FHIR_GATEWAY_APP_NAME", "Gateway Test")
    monkeypatch.setenv("DOC2FHIR_GATEWAY_ALLOWED_EXTENSIONS", ".pdf,.png")

    settings = GatewaySettings.from_env()
    settings.ensure_directories()

    assert settings.app_name == "Gateway Test"
    assert settings.allowed_extensions == (".pdf", ".png")
    assert settings.runtime_dir.exists()
    assert settings.upload_dir.exists()


def test_A4_validation_error_is_standardized(client):
    response = client.post("/v1/document/upload", data={"metadata": "{}"})
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "validation_error"
    assert "details" in payload


def test_A4_http_exception_is_standardized(client):
    response = client.post(
        "/v1/document/upload",
        files={"file": ("doc.pdf", b"%PDF-1.4 test", "application/pdf")},
        data={"metadata": "not-json"},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "http_error"
    assert payload["details"]["status_code"] == 400


def test_A4_internal_exception_is_standardized(client, app):
    def _boom(_: str):
        raise RuntimeError("boom")

    app.state.repository.get_job_by_id = _boom
    response = client.get("/v1/document/status/job_missing")

    assert response.status_code == 500
    payload = response.json()
    assert payload["code"] == "internal_error"
    assert payload["details"]["exception_type"] == "RuntimeError"
