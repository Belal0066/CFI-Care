**Purpose**
- **Summary:** Detailed technical overview of the CFI-Care codebase and how DOC2FHIR components interact.

**High-Level Architecture**
- **Gateway:** Coordinates ingestion, job lifecycle and delivery — see [ai/src/DOC2FHIR/gateway/app.py](ai/src/DOC2FHIR/gateway/app.py).
- **OCR Service:** External OCR inference (vLLM / PaddleOCR) called via the OCR adapter. Gateway expects this at the URL defined in the gateway settings.
- **Mapper:** Separate mapping service that transforms normalized OCR output into FHIR bundles (models and prompts in Mapper). See [ai/src/Mapper](ai/src/Mapper) for Mapper artifacts and prompts.
- **Downstream:** Delivery target (DocFHIR / Node.js service) where completed FHIR bundles are posted.

**Components & Responsibilities**
- **Gateway (coordination, FastAPI):**
  - **Files:** [ai/src/DOC2FHIR/gateway/app.py](ai/src/DOC2FHIR/gateway/app.py), [ai/src/DOC2FHIR/gateway/main.py](ai/src/DOC2FHIR/gateway/main.py), [ai/src/DOC2FHIR/gateway/config.py](ai/src/DOC2FHIR/gateway/config.py)
  - **Responsibilities:** accept uploads (`/v1/document/upload`), create job records, enqueue jobs for background processing, provide job status (`/v1/document/status/{job_id}`), health checks (`/v1/health`), and standardized error responses.
  - **Job queue & worker:** In-memory queue drives an async worker that calls `JobOrchestrator.process_job` — see [ai/src/DOC2FHIR/gateway/orchestrator.py](ai/src/DOC2FHIR/gateway/orchestrator.py).
  - **Persistence:** SQLite-backed `JobRepository` persists job rows, events, and artifacts — see [ai/src/DOC2FHIR/gateway/repository.py](ai/src/DOC2FHIR/gateway/repository.py).

- **Job Orchestrator:**
  - Drives the state machine: QUEUED → OCR_PROCESSING → MAPPING → COMPLETED/FAILED.
  - Manages a shared GPU semaphore, per-stage timeouts, stage retries and error classification. (See orchestrator file linked above.)

- **Adapters:**
  - **OCRAdapter:** client wrapper and normalization layer for the OCR service, classification of OCR errors and retry/backoff. See [ai/src/DOC2FHIR/gateway/adapters/ocr.py](ai/src/DOC2FHIR/gateway/adapters/ocr.py).
  - **MapperAdapter:** client that calls the Mapper service (map_to_fhir) and returns a validated FHIR bundle.
  - **DownstreamAdapter:** delivers FHIR bundles to downstream endpoints, handles retries and dead-letter persistence.

- **Mapper (model + prompt logic):**
  - Located under `ai/src/Mapper`. Contains prompts, model integration scripts, and a web app for mapping preview (`ai/src/Mapper/web`). The Mapper service accepts normalized text + metadata and returns a FHIR bundle.

- **OCR Pipeline:**
  - The system expects an OCR inference server (PaddleOCR / vLLM style endpoint). Gateway calls that endpoint (configurable via environment variable). Adapter normalizes received layout/text into an `OCROutput` structure consumed by the Mapper.

**Data Flow (short)**
- Client uploads document → Gateway saves file, creates job → enqueue job → Worker (Orchestrator) runs OCRAdapter → persists OCR outputs → MapperAdapter maps OCR text → validate/save FHIR bundle → DownstreamAdapter delivers bundle → Gateway updates job status and stores artifacts in `.gateway_runtime/`.

**Persistence & Files**
- **Runtime directory:** default `.gateway_runtime` (configurable). Contains `uploads/`, `ocr_outputs/`, `fhir_outputs/`, `dead_letters/` and `gateway.db`.
- **DB schema:** `jobs` and `job_events` tables; fields include `job_id`, `state`, `progress`, `metadata_json`, `ocr_output_path`, `fhir_output_path` — see [ai/src/DOC2FHIR/gateway/repository.py](ai/src/DOC2FHIR/gateway/repository.py).

**Configuration & Environment**
- Controlled via `GatewaySettings.from_env()`.
- Important env vars:
  - `DOC2FHIR_GATEWAY_RUNTIME_DIR`, `DOC2FHIR_GATEWAY_PORT`, `DOC2FHIR_OCR_BASE_URL`, `DOC2FHIR_MAPPER_BASE_URL`, `DOC2FHIR_DOWNSTREAM_DOCFHIR_URL`.
  - Defaults are defined in [ai/src/DOC2FHIR/gateway/config.py](ai/src/DOC2FHIR/gateway/config.py).

**Observability & Metrics**
- The gateway exposes health checks and collects stage-level timing metrics (OCR, mapper, downstream). See `observability` module under the gateway folder.

**Testing**
- Gateway acceptance tests live in `ai/tests/gateway_acceptance` and validate API contracts and env behavior (example: [ai/tests/gateway_acceptance/test_epic_a_api_contracts.py](ai/tests/gateway_acceptance/test_epic_a_api_contracts.py)).

**Running Locally (development)**
- Start Gateway (development reload):

  - `uvicorn gateway.main:app --reload --host 0.0.0.0 --port 8001`

- Run gateway tests:

  - `python -m pytest ai/tests/gateway_acceptance -q`

- Start or mock dependencies:
  - OCR service: start the OCR inference server on the host/port configured in env.
  - Mapper service: start the Mapper HTTP service (if available) or mock it for local testing.

**Developer Notes & Recommendations**
- Keep adapters thin: they should normalize and classify errors; business rules belong to `orchestrator` or `mapper`.
- Use the runtime directory for ephemeral artifacts; back up only FHIR outputs needed for audit.
- Mapper models and prompts are large artifacts — keep them in `ai/src/Mapper/models` and use `ai/src/Mapper/scripts` for reproducible downloads.

**Files of Interest**
- Architecture overview: [ai/src/DOC2FHIR/ARCHITECTURE.md](ai/src/DOC2FHIR/ARCHITECTURE.md)
- Gateway entrypoints: [ai/src/DOC2FHIR/gateway/app.py](ai/src/DOC2FHIR/gateway/app.py), [ai/src/DOC2FHIR/gateway/main.py](ai/src/DOC2FHIR/gateway/main.py)
- Orchestration & adapters: [ai/src/DOC2FHIR/gateway/orchestrator.py](ai/src/DOC2FHIR/gateway/orchestrator.py), [ai/src/DOC2FHIR/gateway/adapters/ocr.py](ai/src/DOC2FHIR/gateway/adapters/ocr.py)
- Persistence: [ai/src/DOC2FHIR/gateway/repository.py](ai/src/DOC2FHIR/gateway/repository.py)
- Mapper project folder: [ai/src/Mapper](ai/src/Mapper)
- Tests: [ai/tests/gateway_acceptance](ai/tests/gateway_acceptance)

**Next Steps I can do for you**
- Expand this overview with sequence diagrams (Mermaid) for the most critical flows.
- Generate a `docs/` page with the same content and include diagrams and runnable examples.
- Create a minimal local `docker-compose` sketch that brings up Gateway + mocked OCR + Mapper for local end-to-end testing.

---
Generated from repository inspection on 2026-05-02.
