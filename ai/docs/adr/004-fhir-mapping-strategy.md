# ADR-004: FHIR mapping strategy — LLM-direct (default) vs. deterministic extraction (opt-in)

## Status
Accepted as implemented, but **flagged for reconsideration** — see Consequences.

## Context
Turning OCR'd document text into valid FHIR resources needs some kind of mapping step. Two genuinely different strategies exist side by side in this codebase, not as a historical migration (one replacing the other) but as two live, selectable code paths, controlled by a single config flag (`structured_pipeline_enabled`, `gateway/config.py:39`, defaults to `False`).

## Constraints
- FHIR R5 structural validity matters — an invalid bundle delivered downstream is a real integration failure for whatever consumes it.
- The Mapper LLM (`llama.cpp` + Gemma-4, see [ADR-006](006-local-model-serving-mapper.md)) is a single model instance serving multiple roles by prompt alone, not multiple specialized models.

## Options

### Option A — LLM directly emits the entire FHIR bundle (this is the current default)
`mapper.py`'s `_call_mapper_service` sends OCR text to the LLM with a long inline system prompt (~15 hand-written FHIR R5 structural rules, `mapper.py:154`) and asks for a complete bundle back, then runs it through ~500 lines of regex/structural repair (`mapper.py:_fix_r5_common_errors`, lines 409-840) to patch known LLM mistakes. Pros: one LLM call handles arbitrarily varied document types without per-type extraction logic. Cons: **no schema validation gate gives a pass/fail verdict on the final default-path output** — the repair pass is best-effort text surgery, not a validator that can reject and retry; an FHIR-invalid bundle can still be delivered.

### Option B — Classify → extract to an intermediate schema → deterministically map to FHIR (opt-in, `structured_pipeline_enabled=True`)
Three narrower LLM calls (`doc_classifier.py`, `structured_extractor.py` — explicitly instructed "Do not produce FHIR") produce a validated intermediate JSON schema, then a **pure-Python, no-LLM** mapper (`fhir_mapper.py:map_to_fhir`) builds FHIR resources deterministically from that schema, using a hardcoded LOINC lookup table and deterministic resource builders. Pros: the LLM's job is narrowed to extraction (a task it's more reliably checkable at) and the actual FHIR construction is deterministic — same intermediate schema always produces the same bundle structure, and `FhirValidator` (added alongside this pipeline, per `git log` on `ccd835c`) can validate before delivery. Cons: three LLM calls instead of one (more latency, more failure points to handle), and the intermediate schema has to anticipate every document type's fields.

## Decision
As implemented: Option A is the default; Option B exists and is fully built but is opt-in.

## Why
No commit message, README section, or code comment in the repository states why the safer path (B) isn't the default. This is a genuine gap, not something this ADR can responsibly reconstruct a justification for — the honest answer is: **undocumented.** What's verifiable is the sequence: Option A's code (`mapper.py`) predates Option B's (`git log` shows the structured pipeline — `structured_pipeline.py`, `fhir_mapper.py`, `FhirValidator` — added in a single later commit, `ccd835c`, "Implement FHIR validation, intermediate schema, and structured extraction pipeline"). The most defensible inference is that B was built as a more auditable replacement candidate but the default flag was never flipped — but that's an inference about intent, not a documented decision, and is presented as such.

## Consequences

### Positive (of the current default, Option A)
- Handles document-type variation without needing an intermediate schema to anticipate every field ahead of time.

### Negative (of the current default, Option A)
- `ai/src/DOC2FHIR/README.md` describes the pipeline's FHIR mapping as "deterministic" — **that claim is only true of Option B, which isn't what runs by default.** This is a real documentation-vs-behavior gap a reviewer would catch immediately by reading the config default next to the README claim.
- No schema-validation gate on the default path means an invalid bundle can reach the downstream consumer without the system itself detecting it.

### New risks
- Both options currently share the same broken OCR-to-text handoff (see [`FAILURE_MODES.md`](../FAILURE_MODES.md)) — Option B's extra rigor at the mapping stage doesn't protect it from receiving corrupted input at the OCR stage, so flipping the default alone would not fix end-to-end reliability; the OCR contract bug would need fixing regardless of which mapping strategy is default.

## Evidence
- `gateway/config.py:39` — `structured_pipeline_enabled: bool = False`.
- `gateway/orchestrator.py:278-300` — the actual branch selecting between the two paths.
- `mapper.py:409-840` (`_fix_r5_common_errors`) — the regex-repair pass, confirming no validation gate on the default path.
- `fhir_mapper.py:581` (`map_to_fhir`) — confirmed pure-Python, no LLM call in this function.
- `git show -s --format=%B ccd835c` — commit introducing the structured/deterministic pipeline, confirming it was added later, as an addition not a replacement.
- `ai/src/DOC2FHIR/README.md:3` — the "deterministic FHIR mapping" claim, which this ADR shows is default-path-inaccurate.

## Revisit Trigger
This should be revisited now, not deferred — the gap between what's documented (deterministic mapping) and what actually runs by default (LLM-direct with best-effort repair) is exactly the kind of mismatch a technical reviewer treats as disqualifying if found independently rather than disclosed. At minimum, `README.md`'s claim needs to be scoped to "the opt-in structured pipeline," or the default should be flipped once Option B's added latency/failure surface is judged acceptable.
