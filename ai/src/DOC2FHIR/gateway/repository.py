from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from .models import JobRecord, JobStatus


SCHEMA_VERSION = 1


class JobNotFoundError(KeyError):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_datetime(value: str | None) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value)


class JobRepository:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def bootstrap(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            current_version = connection.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()[0]
            if current_version < 1:
                self._apply_v1(connection)
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (1, utc_now_iso()),
                )

    def ping(self) -> bool:
        with self.connect() as connection:
            connection.execute("SELECT 1")
        return True

    def _apply_v1(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                content_type TEXT,
                state TEXT NOT NULL,
                detail TEXT NOT NULL,
                progress REAL NOT NULL DEFAULT 0,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                error_code TEXT,
                error_message TEXT,
                correlation_id TEXT,
                upload_path TEXT,
                ocr_output_path TEXT,
                fhir_output_path TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                state TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
            )
            """
        )

    def create_job(
        self,
        *,
        job_id: str,
        filename: str,
        content_type: str | None,
        metadata: dict[str, Any],
        detail: str,
        upload_path: str,
        correlation_id: str | None = None,
    ) -> JobRecord:
        created_at = utc_now_iso()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs (
                    job_id, filename, content_type, state, detail, progress,
                    metadata_json, created_at, updated_at, correlation_id, upload_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    filename,
                    content_type,
                    JobStatus.QUEUED.value,
                    detail,
                    0.0,
                    json.dumps(metadata),
                    created_at,
                    created_at,
                    correlation_id,
                    upload_path,
                ),
            )
            self._insert_event(connection, job_id, JobStatus.QUEUED, detail, {"filename": filename})
        return self.get_job_by_id(job_id)

    def update_job_stage(
        self,
        job_id: str,
        *,
        state: JobStatus,
        detail: str,
        progress: float | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        started_at: str | None = None,
        finished_at: str | None = None,
        ocr_output_path: str | None = None,
        fhir_output_path: str | None = None,
        extra_payload: dict[str, Any] | None = None,
    ) -> JobRecord:
        now = utc_now_iso()
        with self.connect() as connection:
            existing = connection.execute("SELECT job_id FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if existing is None:
                raise JobNotFoundError(job_id)

            columns: list[str] = ["state = ?", "detail = ?", "updated_at = ?"]
            values: list[Any] = [state.value, detail, now]

            if progress is not None:
                columns.append("progress = ?")
                values.append(progress)
            if error_code is not None:
                columns.append("error_code = ?")
                values.append(error_code)
            if error_message is not None:
                columns.append("error_message = ?")
                values.append(error_message)
            if started_at is not None:
                columns.append("started_at = ?")
                values.append(started_at)
            if finished_at is not None:
                columns.append("finished_at = ?")
                values.append(finished_at)
            if ocr_output_path is not None:
                columns.append("ocr_output_path = ?")
                values.append(ocr_output_path)
            if fhir_output_path is not None:
                columns.append("fhir_output_path = ?")
                values.append(fhir_output_path)

            values.append(job_id)
            connection.execute(f"UPDATE jobs SET {', '.join(columns)} WHERE job_id = ?", values)
            self._insert_event(connection, job_id, state, detail, extra_payload or {})

        return self.get_job_by_id(job_id)

    def get_job_by_id(self, job_id: str) -> JobRecord:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None:
                raise JobNotFoundError(job_id)
            return self._row_to_job(row)

    def list_job_events(self, job_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT state, detail, created_at, payload_json FROM job_events WHERE job_id = ? ORDER BY id ASC",
                (job_id,),
            ).fetchall()
        return [
            {
                "state": row["state"],
                "detail": row["detail"],
                "created_at": parse_datetime(row["created_at"]),
                "payload": json.loads(row["payload_json"] or "{}"),
            }
            for row in rows
        ]

    def _insert_event(
        self,
        connection: sqlite3.Connection,
        job_id: str,
        state: JobStatus,
        detail: str,
        payload: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO job_events (job_id, state, detail, created_at, payload_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (job_id, state.value, detail, utc_now_iso(), json.dumps(payload)),
        )

    def _row_to_job(self, row: sqlite3.Row) -> JobRecord:
        return JobRecord(
            job_id=row["job_id"],
            filename=row["filename"],
            content_type=row["content_type"],
            state=JobStatus(row["state"]),
            detail=row["detail"],
            progress=row["progress"],
            metadata=json.loads(row["metadata_json"] or "{}"),
            created_at=parse_datetime(row["created_at"]),
            updated_at=parse_datetime(row["updated_at"]),
            started_at=parse_datetime(row["started_at"]),
            finished_at=parse_datetime(row["finished_at"]),
            error_code=row["error_code"],
            error_message=row["error_message"],
            correlation_id=row["correlation_id"],
            upload_path=row["upload_path"],
            ocr_output_path=row["ocr_output_path"],
            fhir_output_path=row["fhir_output_path"],
        )

    def save_ocr_output(self, job_id: str, output_dir: Path, ocr_data: dict[str, Any]) -> Path:
        """Save OCR output to disk and record path in database.

        Args:
            job_id: Job ID
            output_dir: Directory to save output
            ocr_data: OCR output data

        Returns:
            Path to saved OCR output file
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{job_id}_ocr.json"
        with open(output_path, "w") as f:
            json.dump(ocr_data, f, indent=2, default=str)
        return output_path

    def save_normalized_output(self, job_id: str, output_dir: Path, normalized: dict[str, Any]) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{job_id}_normalized.json"
        with open(output_path, "w") as f:
            json.dump(normalized, f, indent=2, default=str)
        return output_path

    def save_classification_output(self, job_id: str, output_dir: Path, classification: dict[str, Any]) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{job_id}_classification.json"
        with open(output_path, "w") as f:
            json.dump(classification, f, indent=2, default=str)
        return output_path

    def save_intermediate_output(self, job_id: str, output_dir: Path, extraction: dict[str, Any]) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{job_id}_extraction.json"
        with open(output_path, "w") as f:
            json.dump(extraction, f, indent=2, default=str)
        return output_path

    def save_fhir_output(self, job_id: str, output_dir: Path, fhir_bundle: dict[str, Any]) -> Path:
        """Save FHIR output to disk and record path in database.

        Args:
            job_id: Job ID
            output_dir: Directory to save output
            fhir_bundle: FHIR bundle data

        Returns:
            Path to saved FHIR output file
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{job_id}_fhir.json"
        with open(output_path, "w") as f:
            json.dump(fhir_bundle, f, indent=2, default=str)
        return output_path