# AI Section Architecture — DOC2FHIR ↔ Clinical RAG/Graph Copilot

The `ai/` tree currently holds two subsystems that were developed independently
and, until now, never lived on the same branch:

- **`ai/src/DOC2FHIR/`** — OCR → structured extraction → FHIR mapping pipeline.
  Turns a scanned medical document into FHIR resources.
- **`ai/src/ai/`** — Clinical RAG / "Clinical-Graph Copilot". Reads FHIR data
  for a patient and answers clinical questions over it (retrieval + reasoning),
  backed by Qdrant (vector) and FalkorDB (graph).

## Relationship between the two subsystems

**This is inferred from code, not from any existing design doc — it was never
written down by either subsystem's authors. Treat it as a working hypothesis
to confirm with whoever owns each side, not as settled fact.**

Both subsystems independently target a HAPI FHIR server:

- DOC2FHIR's pipeline ends there: `Client → Gateway (8001) → OCR (7862) →
  Mapper (8070) → HAPI FHIR`. Its default `hapi_fhir_base_url` is
  `http://127.0.0.1:8080/fhir` (`ai/src/DOC2FHIR/gateway/config.py`).
- `ai/src/ai`'s `docker-compose.yml` stands up its own `hapi-fhir` container
  (`hapiproject/hapi:v6.6.0`) bound to host port **8080**, described in its
  README as the system's "Clinical data source."

Those ports now match (see "Fixes applied" below — DOC2FHIR's config default
was pointing at the wrong port until this pass). That match is the only
evidence connecting them: **the working hypothesis is that DOC2FHIR writes
FHIR resources into the same HAPI FHIR instance that the Clinical RAG/Graph
Copilot reads from** — i.e. they are sequential stages of one pipeline
(ingest → reason), not two unrelated tools that happen to share a database
technology.

Nothing in either codebase explicitly wires them together (no shared client,
no integration test, no doc). A `git grep` across `ai/src/ai` for any
DOC2FHIR/OCR/gateway reference turns up nothing except one incidental mention
in a thesis LaTeX file.

**Open question for the subsystem owners:** is this actually the intended
design, and if so, is it meant to be the *same* HAPI FHIR instance in every
environment (dev, staging), or does each subsystem expect to own its own copy
with data synced/migrated between them?

## Fixes applied (Tier 2 — port collisions)

`ai/src/DOC2FHIR/gateway/config.py` had two stale defaults that contradicted
the rest of DOC2FHIR's own codebase and its README:

| Setting | Was | Now | Why |
|---|---|---|---|
| `mapper_base_url` | `:8080` | `:8070` | `scripts/run.sh` starts and health-checks the Mapper on `:8070` in four places; the README's port table and architecture diagram both say `8070`. The `:8080` default was a leftover bug — and collided with HAPI FHIR's own port. |
| `hapi_fhir_base_url` | `:8090/fhir` | `:8080/fhir` | README documents HAPI FHIR on `:8080`; `run.sh` never manages its own HAPI FHIR container (it's treated as an already-running external dependency on the documented port), so `:8090` had no supporting evidence anywhere else in the codebase. |

Both are still overridable via `DOC2FHIR_MAPPER_BASE_URL` /
`DOC2FHIR_HAPI_FHIR_BASE_URL` env vars — only the fallback defaults changed.

A stale comment in `scripts/run.sh` (`mapper ... on :8080`) was also corrected
to `:8070` to match the command's actual behavior four lines later in the same
file.

### Known, pre-existing collision left unfixed — `medgemma_rag_api.py`

`ai/src/ai/src/api/medgemma_rag_api.py` and `ai/src/ai/src/api/FastAPI_Backend.py`
both hardcode `uvicorn.run(app, host="0.0.0.0", port=8001)`. This is **not**
new from the merge — it's already tracked inside the subsystem's own
`ai/src/ai/context.md` as "Bug #1": `medgemma_rag_api.py:79` imports
`shared.db_clients` without the `src.` prefix, which raises
`ModuleNotFoundError` before the app ever reaches `uvicorn.run`. The port
collision is therefore currently unreachable — `medgemma_rag_api.py` crashes
on import before it could bind `:8001`, and the documented launch path
(`launch.sh`) only ever starts `FastAPI_Backend.py`. Left as-is here since
fixing an unrelated, already-crash-dormant "lightweight" alternate API is out
of scope for making the AI section's docs/ports consistent — noting it so it
isn't rediscovered as a surprise later.

## Combined port map (both subsystems)

| Port | Service | Subsystem |
|---|---|---|
| 6333 / 6334 | Qdrant (vector search) | ai/src/ai |
| 6379 | FalkorDB (graph) | ai/src/ai |
| 7862 | OCR service | ai/src/DOC2FHIR |
| 8000 | MedGemma LLM (Ollama) | ai/src/ai |
| 8001 | Gateway (FastAPI, production API) | ai/src/DOC2FHIR |
| 8001 | FastAPI Backend | ai/src/ai — **collides with DOC2FHIR Gateway if both run on the same host** |
| 8002 | Mock server (offline testing) | ai/src/DOC2FHIR |
| 8002 | MCP Server | ai/src/ai — **collides with DOC2FHIR mock server if both run on the same host** |
| 8070 | Mapper (llama.cpp / Gemma-4) | ai/src/DOC2FHIR |
| 8080 | HAPI FHIR JPA Server | shared (see hypothesis above) |
| 8502 | Pipeline UI (Streamlit) | ai/src/DOC2FHIR |
| 8511 | Web dashboard | ai/src/ai |

The `:8001` and `:8002` collisions between the two subsystems are real if
both stacks are ever run on the same host — nothing currently prevents it,
since each subsystem's docs were written assuming it's the only AI service
running. Worth a deliberate port-range convention (e.g. DOC2FHIR keeps
`800x`, `ai/src/ai` moves to `801x`) before both are documented side-by-side
in a single AI-section README.
