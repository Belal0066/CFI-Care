# DocOnFHIR — Medical Document to FHIR Pipeline

Scanned medical reports (PDF) → OCR → structured extraction → FHIR mapping → delivery.

System-wide docs spanning both AI subsystems (architecture, failure modes, decisions) live in [`../../docs/`](../../docs/) — see the full documentation map in [`../../README.md`](../../README.md).

**Two FHIR-mapping strategies exist; the default is not deterministic.** Out of the box (`structured_pipeline_enabled=False`), the Mapper LLM emits the entire FHIR bundle directly, then a regex/structural repair pass patches known mistakes — non-deterministic sampling (`temperature=0.7`), no schema-validation gate. A genuinely deterministic, no-LLM-at-mapping-time path exists (`structured_pipeline_enabled=True`) but is opt-in. See [`../../docs/adr/004-fhir-mapping-strategy.md`](../../docs/adr/004-fhir-mapping-strategy.md).

## Quick Start

```bash
# Start full pipeline
./scripts/run.sh all --with-ui --foreground

# Or just test the API with mock data
# (see Mock Data section below)
```

---
## Download Only What You Need

Don't clone the whole monorepo — use sparse checkout to grab just the relevant files:

```bash
# For Flutter / Node.js / Frontend — API spec + AI context + mock data
git sparse-checkout set ai/src/DOC2FHIR/DocOnFHIR_API_Spec.md ai/src/DOC2FHIR/DOC2FHIR_AI_Context.md ai/tests/mock/
git checkout main
```

Now you have exactly three things locally:
- `ai/src/DOC2FHIR/DocOnFHIR_API_Spec.md` — API contract
- `ai/src/DOC2FHIR/DOC2FHIR_AI_Context.md` — developer reference
- `ai/tests/mock/` — mock server + response files

---

## Team Guide

| Team | APIs |
|------|------|
| **Flutter** (mobile) | Upload + status |
| **Node.js** (backend) | Status + results |
| **Web Frontend** | Check summaries in `summaries.json` — test size and layout |

---

## Key Files

| File | Purpose |
|------|---------|
| `DocOnFHIR_API_Spec.md` | An OpenAPI 3.0 export covering the 3 core client-facing operations (upload/status/result); its response schemas are currently placeholders (`properties: {}`) rather than filled-in field types — for real request/response shapes, read `gateway/models.py` directly. |
| `DOC2FHIR_AI_Context.md` | AI/developer reference — endpoint shapes, error codes, FHIR navigation table, code snippets (JS + Dart), summary extraction guide. |


### Mock Data

Location: **`ai/tests/mock/`**

Ready-to-use HTTP server serving responses at real API paths:

```bash
python3 ai/tests/mock/scripts/serve_mock.py
# → http://0.0.0.0:8001  (default MOCK_PORT — collides with the real Gateway if both run at once;
#                          set MOCK_PORT to something else to run them side by side)
```

| File | Mocks |
|------|-------|
| `responses/upload_202.json` | `POST /v1/documents/upload` — accepted response |
| `responses/status_pending.json` | `GET /v1/documents/{id}/status` — PENDING |
| `responses/status_processing.json` | `GET /v1/documents/{id}/status` — OCR_PROCESSING |
| `responses/status_mapping.json` | `GET /v1/documents/{id}/status` — MAPPING |
| `responses/status_completed.json` | `GET /v1/documents/{id}/status` — COMPLETED |
| `responses/status_failed.json` | `GET /v1/documents/{id}/status` — FAILED |
| `responses/result_completed.json` | `GET /v1/documents/{id}/result` — full result with FHIR bundle |
| `responses/result_404.json` | `GET /v1/documents/{id}/result` — job not found |
| `responses/summaries.json` | Example summaries (≤100 chars visible text) for UI layout testing |


---

## API Overview

The 3 core client-facing operations, documented in `DocOnFHIR_API_Spec.md`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/documents/upload` | POST | Upload document (multipart: `file`, `patient_id`, `pdf_id`, `upload_time`) |
| `/v1/documents/{job_id}/status` | GET | Poll job state (see lifecycle below) |
| `/v1/documents/{job_id}/result` | GET | Full result: job info + events + OCR output + FHIR bundle + validation |

Plus, real and wired but **not covered by any spec doc** — see `gateway/app.py` for exact request/response shapes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/health` | GET | Health check |
| `/v1/metrics` | GET | Runtime metrics |
| `/v1/document/{job_id}/push-to-hapi` | POST | Manually push a completed job's bundle to HAPI FHIR |
| `/v1/document/sqs/ingest` | POST | SQS-triggered ingestion path |
| `/v1/internal/callback` | POST | Internal callback receiver — **no auth check**, despite the name |
| `/v1/documents/{job_id}/stream` | WebSocket | Live job-status stream |
| `/ui`, `/` | GET | Debug UI / root |

There are also 4 legacy singular-`/document/...` route aliases (`include_in_schema=False`, hidden from OpenAPI) kept for backward compatibility — prefer the `/documents/...` (plural) routes above for anything new.

---

## Port Map

| Port | Service |
|------|---------|
| 8001 | Gateway (FastAPI) — production API |
| 7862 | OCR service (proxies to a vLLM backend on 8118) |
| 8070 | Mapper (llama.cpp / Gemma-4) |
| 8080 | HAPI FHIR JPA Server |
| 8502 | Pipeline UI (Streamlit) |
| 8503 | Enhanced/Command-Center UI (`gateway/ui_v2.py`, `run.sh enhanced-ui`) — **unauthenticated, wildcard-CORS DELETE endpoints on FHIR data; do not expose this port publicly** |
| 3000 | Node.js downstream (default delivery target — see Architecture below) |
| (dev/testing only) | Mock server (Python, `ai/tests/mock/scripts/serve_mock.py`) — defaults to **8001**, same as the real Gateway; override `MOCK_PORT` to avoid a collision |

---

## Architecture

```
Client (Flutter/Web) ──▶ Gateway (8001) ──▶ OCR (7862) ──▶ Mapper (8070) ──▶ Downstream delivery:
                              │                                                 Node.js (3000, default)
                              │                                                 or HAPI FHIR (8080, opt-in/manual)
                              └──▶ Callback ──▶ Node.js (3000, fire-and-forget)
```

Job lifecycle: `PENDING → SERVER_BUSY | OCR_PROCESSING → MAPPING → COMPLETED | FAILED`. `SERVER_BUSY` (set on upload-queue-full or GPU-lock timeout) is currently a dead end — no code requeues a `SERVER_BUSY` job; see [`../../docs/FAILURE_MODES.md`](../../docs/FAILURE_MODES.md).
