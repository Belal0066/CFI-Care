#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -x "$ROOT_DIR/OCR/OCRpipelie/venv/bin/python3" ]]; then
  PYTHON_BIN="$ROOT_DIR/OCR/OCRpipelie/venv/bin/python3"
else
  PYTHON_BIN="python3"
fi

export PYTHONPATH="$ROOT_DIR:${PYTHONPATH:-}"

"$PYTHON_BIN" - <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from gateway.app import create_app
from gateway.config import GatewaySettings

with TemporaryDirectory() as tmp:
    runtime = Path(tmp) / "runtime"
    settings = GatewaySettings(
        runtime_dir=runtime,
        db_path=runtime / "gateway.db",
        upload_dir=runtime / "uploads",
        request_timeout_sec=2,
    )
    app = create_app(settings)

    async def _noop_process_job(job_id: str) -> None:
        return None

    app.state.orchestrator.process_job = _noop_process_job

    with TestClient(app, raise_server_exceptions=False) as client:
        upload = client.post(
            "/v1/document/upload",
            files={"file": ("smoke.pdf", b"%PDF-1.4 smoke", "application/pdf")},
            data={"metadata": '{"source":"smoke"}'},
        )
        assert upload.status_code == 200, upload.text
        payload = upload.json()
        status = client.get(f"/v1/document/status/{payload['job_id']}")
        assert status.status_code == 200, status.text

print("gateway smoke check passed")
PY
