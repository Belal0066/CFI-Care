# ADR-006: Local model serving (llama.cpp + Gemma-4 GGUF) for the Mapper, instead of a hosted LLM API

## Status
Accepted (current implementation) — well-documented rationale

## Context
The Mapper stage reasons directly over clinical document content (patient names, diagnoses, medications) to extract structured facts or emit FHIR resources. Where and how that inference happens is a real data-handling decision, not just a cost/performance one.

## Constraints
- Clinical document content is sensitive (PHI-adjacent, even in a demo/thesis setting the pattern matters).
- Single GPU host budget (shared with OCR, see [ADR-007](007-gpu-concurrency-one.md)).

## Options

### Option A — Hosted LLM API (OpenAI, Anthropic, or similar)
Pros: no local GPU/model management, likely stronger baseline model capability. Cons: sends clinical document content to a third party over the network for every document processed — the documented rationale below explains why this was rejected.

### Option B — Local, self-hosted inference via `llama.cpp` (chosen)
`unsloth/gemma-4-E4B-it-GGUF` (Q4_K_M quantization) served via `llama-server`'s OpenAI-compatible `/v1/chat/completions` endpoint (`Mapper/scripts/run_llama_server.sh`, `Mapper/models/unsloth-gemma-4-e4b-it-gguf/Modelfile:1`). One model instance serves three distinct roles (classification, structured extraction, direct bundle generation) via different prompts, not separate fine-tuned models.

## Decision
Option B.

## Why
This is the one decision in this document with **explicit, documented rationale**, not reconstruction: `Mapper/README.md:112-115` states the operating notes directly — "Keep inference fully self-hosted," "Disable external telemetry," "sanitized logs" — under a "Notes for medical data residency" heading. This is a real, sourced design constraint, not an inferred one.

## Consequences

### Positive
- Clinical document content never leaves the local pipeline for inference — directly satisfies the stated data-residency constraint.
- One quantized model, three prompted roles, is cheaper to operate than three separately-hosted models would be.

### Negative
- A single Q4_K_M-quantized 4B-class local model likely trails a larger hosted model's raw capability — this tradeoff (data residency vs. capability) is exactly what Option A vs. B represents, and the repo's own README explicitly accepts the tradeoff in that direction; not evaluated quantitatively anywhere (no head-to-head accuracy comparison against a hosted alternative exists in the repo).
- One model instance serving three roles via prompting alone (rather than a model per role) means a prompt regression in one role's system prompt is one shared blast radius, not isolated per role.

### New risks
None beyond what's already covered in the GPU-concurrency ADR (this model shares the GPU-serialization constraint).

## Evidence
- `Mapper/README.md:112-115` — explicit "medical data residency" rationale, the strongest sourced evidence in any ADR in this set.
- `Mapper/models/unsloth-gemma-4-e4b-it-gguf/Modelfile:1` — confirms the actual model/quantization in use.
- `Mapper/scripts/run_llama_server.sh` — confirms `llama-server`, not a hosted API client, is what's actually invoked.

## Revisit Trigger
If the data-residency constraint changes (e.g., a deployment where a hosted API under a compliant data-processing agreement becomes acceptable), or if the single quantized model's accuracy on structured extraction is measured and found insufficient, this tradeoff should be re-evaluated quantitatively rather than assumed.
