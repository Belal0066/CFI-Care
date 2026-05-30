from __future__ import annotations

import sqlite3

import pytest

from gateway.models import JobStatus
from gateway.repository import JobNotFoundError


pytestmark = [pytest.mark.epic_b]


def test_B1_repository_bootstrap_creates_tables_and_schema(repo):
    with sqlite3.connect(repo.db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        assert "jobs" in tables
        assert "job_events" in tables
        assert "schema_migrations" in tables

        version = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
        assert version == 1


def test_B2_repository_create_update_fetch_and_events(repo, tmp_path):
    upload_path = tmp_path / "input.pdf"
    upload_path.write_bytes(b"pdf")

    created = repo.create_job(
        job_id="job_repo_test",
        filename="input.pdf",
        content_type="application/pdf",
        metadata={"ticket": "B2"},
        detail="Queued",
        upload_path=str(upload_path),
        correlation_id="corr-1",
    )
    assert created.state == JobStatus.QUEUED

    updated = repo.update_job_stage(
        "job_repo_test",
        state=JobStatus.MAPPING,
        detail="Mapping",
        progress=55.0,
        extra_payload={"stage": "mapping"},
    )
    assert updated.state == JobStatus.MAPPING
    assert updated.progress == 55.0

    fetched = repo.get_job_by_id("job_repo_test")
    assert fetched.correlation_id == "corr-1"
    events = repo.list_job_events("job_repo_test")
    assert len(events) >= 2
    assert events[0]["state"] == JobStatus.QUEUED.value
    assert events[-1]["payload"]["stage"] == "mapping"

    with pytest.raises(JobNotFoundError):
        repo.get_job_by_id("not_found")


def test_B3_upload_returns_immediately_and_persists_metadata(client, repo):
    response = client.post(
        "/v1/document/upload",
        files={"file": ("note.pdf", b"%PDF ok", "application/pdf")},
        data={"metadata": '{"source": "intake"}', "correlation_id": "corr-B3"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == JobStatus.QUEUED.value

    record = repo.get_job_by_id(body["job_id"])
    assert record.filename == "note.pdf"
    assert record.metadata["source"] == "intake"
    assert record.metadata["uploaded_file_size"] > 0
    assert record.correlation_id == "corr-B3"


def test_B4_status_reflects_lifecycle_fields(client, repo):
    response = client.post(
        "/v1/document/upload",
        files={"file": ("status.pdf", b"%PDF status", "application/pdf")},
    )
    job_id = response.json()["job_id"]

    repo.update_job_stage(
        job_id,
        state=JobStatus.FAILED,
        detail="Failed downstream",
        progress=90.0,
        error_code="downstream_error",
        error_message="timeout",
        finished_at="2026-01-01T00:00:00+00:00",
    )

    status = client.get(f"/v1/document/status/{job_id}")
    assert status.status_code == 200
    payload = status.json()
    assert payload["state"] == JobStatus.FAILED.value
    assert payload["progress"] == 90.0
    assert payload["error_code"] == "downstream_error"
    assert payload["error_message"] == "timeout"
    assert payload["finished_at"] is not None
