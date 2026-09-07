# ADR-008: Local-only model serving as the default for the Clinical AI System

## Status
Accepted (implemented, `ai-code-updates` branch) — contemporaneous rationale, written alongside the code it describes, not reconstructed after the fact.

## Context
ADR-006 documents why DOC2FHIR's Mapper stage runs a local, self-hosted LLM instead of a hosted API, for data-residency reasons. The Clinical AI System has the same shape of decision — `InfraConfig.llm_backend` (`src/shared/config.py:47`) selects between a local `llama.cpp` model and a remote Lightning AI endpoint — but nothing documented why local is the default here. This subsystem is arguably the more sensitive of the two: it reasons directly over a specific patient's retrieved encounter history and answers natural-language clinical questions about them, not just document text being converted to structured fields.

## Constraints
- Retrieved patient encounter content and the clinician's own query text both reach the LLM at generation time (`generate_response`, `src/agent/graph/nodes.py`).
- A single-GPU host budget, same as DOC2FHIR (see ADR-007) — local inference has to fit realistic VRAM limits, which is part of why the local model is quantized (see Optimizations).
- A genuinely larger, more capable remote model (MedGemma 27B, 128K context) already exists as an option and is sometimes worth the tradeoff — this ADR is about what the *default* should be, not about removing the option.

## Options

### Option A — Local-only, no remote option at all
Simplest data-residency story, but forecloses ever using the larger 27B model for cases where the local 4B model's capability genuinely isn't enough (e.g., very long context questions). Not implemented — `lightning_base_url`/`lightning_model_name` exist as real, working config fields (`src/shared/config.py:54-55`), not stubs.

### Option B — Remote-only, no local option
Would mean every clinical query's content leaves the host by default. Not implemented, and not seriously considered — the `active_llm_base_url`/`active_llm_model`/`active_llm_api_key` properties (`src/shared/config.py:60-78`) resolve to the local `llama.cpp` endpoint whenever `llm_backend != "lightning"`, and `llm_backend` itself defaults to `"local"` (`config.py:47`).

### Option C — Local by default, remote opt-in (chosen)
`InfraConfig.llm_backend: str = Field(default="local", ...)` (`config.py:47`). An operator can switch to Lightning AI explicitly (`launch.sh --lightning`, per this session's earlier verified facts), but nothing in the running system silently escalates to the remote backend on its own — the switch is a deliberate, visible operational choice, not a runtime fallback.

## Decision
Option C.

## Why
Keeping patient-specific query and encounter content on the local host by default is the same data-residency stance ADR-006 already established for DOC2FHIR's Mapper — extended here to the component that actually handles per-patient clinical reasoning, where the sensitivity is arguably higher (a specific patient's diagnosis history and medication timeline, not just an OCR'd document's raw text). The remote option is kept, not removed, because there are real cases (context length, model capability) where it's the right tool — but the default has to be the one that doesn't require trusting a third-party endpoint with PHI-adjacent content unless someone explicitly opts into that.

## Edge Cases Handled
- **Explicit opt-in to remote (`--lightning`)**: data genuinely does leave the host in this mode — this is stated plainly here, not softened. This ADR does not claim the system prevents that; it claims the *default* keeps data local, and switching away from the default is a visible, deliberate operator action, not something a request can trigger on its own.
- **Remote endpoint unreachable**: there is no automatic fallback from `lightning` back to `local` in `active_llm_base_url`'s resolution logic (`config.py:60-63`) — if an operator has switched to `lightning` and that endpoint is down, requests fail rather than silently falling back to a different backend with different data-handling properties. This is intentional: an automatic fallback would mean the effective data-residency behavior could change without anyone deciding it should.
- **128K vs. 16K context**: the remote model's much larger context window is a real capability difference, not just a location difference — this ADR doesn't claim the local model is strictly better, only that it's the correct *default*.

## Optimizations
- The local default model is GGUF-quantized (`medgemma-1.5-4b-it-Q6_K.gguf`, `config.py:51`) — a VRAM/quality tradeoff that makes local-by-default actually practical on a single-GPU host shared with retrieval and embedding workloads, rather than local-by-default being true in config but impractical in practice.

## Consequences

### Positive
- No patient query or encounter content leaves the host under the default configuration — the common case requires no operator action to get the more conservative data-handling posture.
- The remote path remains available for the cases where it's genuinely needed, without requiring a code change to reach it.

### Negative
- The local 4B model is less capable than the remote 27B model — some queries may get a lower-quality answer under the (safer) default than they would under the (less safe, by data-residency) remote option.
- No automated policy exists to decide *when* a query is sensitive enough to require local-only vs. when remote would be acceptable — the choice is host-wide and operator-set, not per-request.

### New risks
None beyond the capability tradeoff already noted — this decision doesn't introduce new failure modes, it declines to introduce a new data-exposure default.

## Evidence
- `src/shared/config.py:47` — `llm_backend: str = Field(default="local", ...)`.
- `src/shared/config.py:51` — `llamacpp_model: str = Field(default="medgemma-1.5-4b-it-Q6_K.gguf", ...)`.
- `src/shared/config.py:54-55` — `lightning_base_url`, `lightning_model_name` (`google/medgemma-27b-it`) as the real, working opt-in path.
- `src/shared/config.py:60-78` — `active_llm_base_url`/`active_llm_api_key`/`active_llm_model` properties, confirming no automatic fallback between backends.

## Revisit Trigger
If a per-query or per-patient-consent-driven backend selection is ever needed (e.g., "this patient's data may be sent to a remote model, that one may not"), this ADR's host-wide, operator-set default is no longer sufficient and the selection logic in `active_llm_base_url` would need to become request-aware, not just config-aware.
