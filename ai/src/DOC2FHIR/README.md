# DocOnFHIR — Medical Document to FHIR Pipeline

Scanned medical reports (PDF) → OCR → structured extraction → deterministic FHIR mapping → delivery.

## Quick Start

```bash
# Start full pipeline
./scripts/run.sh all --with-ui --foreground (lw leek/i access 3la bws)

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
| `DocOnFHIR_API_Spec.md` | OpenAPI 3.0 spec — the source of truth for all endpoints, schemas, and data types. **Start here** if you're integrating with the API. |
| `DOC2FHIR_AI_Context.md` | AI/developer reference — endpoint shapes, error codes, FHIR navigation table, code snippets (JS + Dart), summary extraction guide. |


### Mock Data

Location: **`ai/tests/mock/`**

Ready-to-use HTTP server serving responses at real API paths:

```bash
python3 ai/tests/mock/scripts/serve_mock.py
# → http://0.0.0.0:8002
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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/documents/upload` | POST | Upload document (multipart: `file`, `patient_id`, `pdf_id`, `upload_time`) |
| `/v1/documents/{job_id}/status` | GET | Poll job state (PENDING → OCR_PROCESSING → MAPPING → COMPLETED\|FAILED) |
| `/v1/documents/{job_id}/result` | GET | Full result: job info + events + OCR output + FHIR bundle + validation |
| `/v1/health` | GET | Health check |
| `/v1/metrics` | GET | Runtime metrics |

See `DocOnFHIR_API_Spec.md` for full OpenAPI spec.

---

## Port Map

| Port | Service |
|------|---------|
| 8001 | Gateway (FastAPI) — production API |
| 8002 | Mock server (Python) — offline testing |
| 8070 | Mapper (llama.cpp / Gemma-4) |
| 8080 | HAPI FHIR JPA Server |
| 8502 | Pipeline UI (Streamlit) |

---

## Architecture

```
Client (Flutter/Web) ──▶ Gateway (8001) ──▶ OCR (7862) ──▶ Mapper (8070) ──▶ HAPI FHIR (8080)
                              │
                              └──▶ Callback ──▶ Node.js (3000) (under work di :| )
```

Job lifecycle: `PENDING → OCR_PROCESSING → MAPPING → COMPLETED | FAILED`
