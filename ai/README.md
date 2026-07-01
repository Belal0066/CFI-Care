# AI

Two subsystems make up CFI-Care's AI capabilities. They aren't wired together in code today, but the working hypothesis (see [Architecture & Port Map](docs/ARCHITECTURE.md)) is that they're sequential stages of one pipeline: DOC2FHIR turns scanned documents into FHIR data, and the Clinical AI System reasons over that FHIR data.

## Table of Contents
- [DOC2FHIR — Document to FHIR Pipeline](#doc2fhir--document-to-fhir-pipeline)
- [Clinical AI System — Agentic RAG Copilot](#clinical-ai-system--agentic-rag-copilot)
- [Architecture & Port Map](#architecture--port-map)
- [Testing](#testing)

## DOC2FHIR — Document to FHIR Pipeline

Scanned medical reports (PDF) → OCR → structured extraction → deterministic FHIR mapping → delivery.

- **Start here:** [src/DOC2FHIR/README.md](src/DOC2FHIR/README.md)
- **API contract:** [src/DOC2FHIR/DocOnFHIR_API_Spec.md](src/DOC2FHIR/DocOnFHIR_API_Spec.md)
- **Developer/AI reference:** [src/DOC2FHIR/DOC2FHIR_AI_Context.md](src/DOC2FHIR/DOC2FHIR_AI_Context.md)
- **Mapper component** (llama.cpp + Gemma-4 GGUF, does the structured-to-FHIR reasoning): [src/DOC2FHIR/Mapper/README.md](src/DOC2FHIR/Mapper/README.md)

## Clinical AI System — Agentic RAG Copilot

Deterministic, citation-backed clinical reasoning over longitudinal patient data, built on hybrid (dense + sparse) vector search over Qdrant, routed by a self-correcting LangGraph agent.

- **Start here:** [src/ai/README.md](src/ai/README.md)
- **Launch guide:** [src/ai/LAUNCH.md](src/ai/LAUNCH.md)
- **API reference:** [src/ai/API.md](src/ai/API.md)
- **Codebase context index** (module map, known bugs, file:line references — written for devs/LLMs navigating the code): [src/ai/context.md](src/ai/context.md)
- **Further specs & design docs:** [src/ai/docs/](src/ai/docs/) — ticket specs under `docs/specs/`, plus `complete-system-guide.md`, `launch-guide.md`, and others

Not indexed here: `src/ai/docs/thesis/` (thesis write-up materials) and `src/ai/docs/myCV.latex` (a contributor's CV) are present in that directory but aren't project documentation.

## Architecture & Port Map

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the two subsystems above relate (flagged there as an inferred hypothesis, not confirmed by either subsystem's owners), the combined port map across both, and two known port collisions if both stacks run on the same host.

## Testing

- **DOC2FHIR:** acceptance, integration, and quality-evaluation suites under [tests/](tests/), run via [tests/run_all_tests.sh](tests/run_all_tests.sh)
- **Clinical AI System:** `PYTHONPATH=$PWD python3 scripts/validate_system.py` from within `src/ai/` (23 tests; see [src/ai/README.md](src/ai/README.md#validation-results))
