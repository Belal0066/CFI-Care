# ADR-014: Fail-closed review gate before DOC2FHIR delivery

## Status
Accepted (implemented, `ai-code-updates` branch) — contemporaneous rationale. Promoted out of an earlier inline "Update" note on ADR-004 into its own decision, since it deserves full treatment (options, edge cases, optimizations) rather than a bolted-on paragraph.

## Context
`_confidence_policy` (`gateway/structured_pipeline.py:46-52`) already computed `review_required = True` whenever any extracted entity's confidence was below 0.6, and `FhirValidator.validate_bundle()` already ran a real JSON-schema check against the bundle. Neither one ever blocked anything: a failed validation was logged via `self.safety_logger.log_validation_errors(validation.errors)` (`structured_pipeline.py:248`) and the bundle was returned anyway; `review_required` was returned in `StructuredPipelineOutput` but `orchestrator.py`'s delivery path never read it. Traced precisely: `process_job` proceeded from the mapping stage straight to downstream delivery with no `if review_required` / `if not validation.ok` check anywhere in between. Fail-open, not fail-closed — on a pipeline whose output is real clinical data.

## Constraints
- The bundle at the point of this decision is already fully assembled (composition extracted, PDF attached, cross-references applied) — the gate needs to hold that finished artifact for a reviewer, not a partial draft.
- `JobStatus` (`gateway/models.py`) had no state for "computed but not delivered" — `PENDING, SERVER_BUSY, OCR_PROCESSING, MAPPING, COMPLETED, FAILED` were the only options, none of which honestly describe a job whose bundle exists but wasn't sent anywhere.
- This only applies where a confidence/validation signal exists to gate on at all — the default (non-opt-in) mapping path has no per-entity confidence output, so a fix here cannot silently be assumed to cover both paths.

## Options

### Option A — Fail-open, log only (status quo)
A failed validation or low-confidence extraction was recorded but delivered anyway — the actual defect this ADR fixes.

### Option B — Fail hard, reject the job entirely
Rejected: this throws away a bundle that might still be substantially correct and useful for a human to review — a low-confidence extraction isn't necessarily a wrong one, and destroying the work product on any confidence dip is a worse failure mode than making someone look at it once.

### Option C — Fail-closed hold with manual resume (chosen)
Added `JobStatus.NEEDS_REVIEW` (`gateway/models.py:19`). `_run_structured_pipeline_stage` computes `needs_review = output.review_required or not output.validation_ok` (`gateway/orchestrator.py:697`) and returns it alongside the bundle; `process_job` checks `fhir_output.get("needs_review")` (`orchestrator.py:349`) immediately before the downstream-delivery call and, if set, persists the already-assembled bundle, transitions to `NEEDS_REVIEW`, and returns without delivering. A new `POST /v1/document/{job_id}/approve-and-deliver` (`gateway/app.py:675`) resumes delivery for a held job, checking `job.state != JobStatus.NEEDS_REVIEW` (`app.py:690`) before acting.

## Decision
Option C.

## Why
DOC2FHIR has no natural "regenerate" step the way the Clinical AI System's audit-and-retry loop does — re-running the same LLM call on the same document is unlikely to fix a genuinely low-confidence extraction. So the correct-shaped response isn't a retry loop, it's a single deterministic checkpoint that redirects to a human instead of silently proceeding. A pipeline that delivers a bundle past a validator that already said something was wrong is a worse failure mode than asking someone to look at it once.

## Edge Cases Handled
- **Default (non-structured) mapping path**: has no per-entity confidence signal or `ValidationResult` to gate on — `fhir_output.get("needs_review")` returns `None`/falsy for this path's dict shape (`mapper_result.to_dict()` never sets this key) by construction, not by an added branch checking which path is active. This was verified directly, not just asserted: the default path's return shape was confirmed to never carry the key at all.
- **The held bundle is the fully post-processed one**: the gate sits after composition-extraction, PDF-attachment, and cross-reference application, and after the bundle is saved to disk (`fhir_output_path`) — a reviewer opening a `NEEDS_REVIEW` job sees exactly what would have been delivered, not an earlier, incomplete draft.
- **Approving a job not actually in `NEEDS_REVIEW`**: `approve-and-deliver` explicitly rejects with a 400 if the job's current state isn't `NEEDS_REVIEW` (`app.py:690`) — can't be used to re-trigger delivery on an already-completed or still-in-progress job.
- **Which downstream target `approve-and-deliver` uses**: reuses the orchestrator's own `_build_downstream_adapter` static selection logic (Node.js or HAPI, whichever `downstream_type` configures) rather than hardcoding a specific target — delivers to the same place normal completion would have.

## Optimizations
- Reuses the existing `push-to-hapi` manual-endpoint pattern (already built for "downstream delivery failed") for the new resume action, rather than inventing a second, divergent manual-delivery mechanism.
- `StructuredPipelineOutput` gained two fields (`validation_ok`, `validation_errors`, `structured_pipeline.py:32-33`) to stop discarding an already-computed result, rather than adding new validation logic — the fix is "stop throwing this away," not "compute something new."

## Consequences

### Positive
- Closes a real fail-open gap on the one path that had any confidence/validation signal to act on at all.
- No new delivery mechanism was built — the resume path reuses proven adapter-selection code.

### Negative
- The default (non-opt-in) mapping path — the one that actually runs by default — still has no equivalent gate, because it has no per-entity confidence or validation signal to gate on. This ADR closes the gap for Option B of ADR-004, not for the system's actual default.
- `NEEDS_REVIEW` jobs require a manual action to ever complete — no automatic re-processing or escalation exists yet if a held job is never reviewed.

### New risks
- A `NEEDS_REVIEW` job sitting indefinitely unreviewed is a new possible state that didn't exist before (previously every job either completed or failed) — no alerting or SLA exists yet for how long a job may sit in this state.

## Evidence
- `gateway/models.py:19` — `JobStatus.NEEDS_REVIEW`.
- `gateway/structured_pipeline.py:32-33,248,262-263` — `validation_ok`/`validation_errors` fields, no-longer-discarded validation result.
- `gateway/orchestrator.py:349,354,361,697,712,719` — the gate check, state transition, and `needs_review` computation.
- `gateway/app.py:675,690` — `approve-and-deliver` endpoint and its state check.

## Revisit Trigger
Extend an equivalent gate to the default mapping path once it has some structured confidence or validation signal to gate on — until then, the default path's negative consequence (no schema-validation gate, per ADR-004) remains unaddressed by this ADR.
