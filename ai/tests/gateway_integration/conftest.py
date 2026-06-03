from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOC2FHIR_SRC = PROJECT_ROOT / "src" / "DOC2FHIR"
if str(DOC2FHIR_SRC) not in sys.path:
    sys.path.insert(0, str(DOC2FHIR_SRC))

from gateway.app import create_app
from gateway.config import GatewaySettings


@pytest.fixture
def integration_settings(tmp_path: Path) -> GatewaySettings:
    runtime_dir = tmp_path / "runtime"
    settings = GatewaySettings(
        runtime_dir=runtime_dir,
        db_path=runtime_dir / "gateway.db",
        upload_dir=runtime_dir / "uploads",
        request_timeout_sec=2,
        max_upload_mb=2,
        queue_max_size=32,
        gpu_lock_timeout_sec=1,
    )
    settings.ensure_directories()
    return settings


@pytest.fixture
def app(integration_settings: GatewaySettings):
    app = create_app(integration_settings)

    async def _noop_process_job(job_id: str) -> None:
        return None

    app.state.orchestrator.process_job = _noop_process_job

    # Prevent the queue worker from starting so we can control the queue manually
    app.router.on_startup.clear()
    return app


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def repo(app):
    return app.state.repository


@pytest.fixture
def job_queue(app):
    return app.state.job_queue


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    return b"%PDF-1.4 tiny stub for upload tests"
