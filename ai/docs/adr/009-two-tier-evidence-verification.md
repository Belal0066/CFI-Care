# ADR-009: Two-tier evidence verification — citation attribution vs. semantic entailment

## Status
Accepted (implemented, disabled by default, `ai-code-updates` branch) — contemporaneous rationale.

## Context
`audit_claims` (`src/agent/graph/nodes.py`) already checked that every claim's cited IDs exist among retrieved evidence — a real check, but one that answers "does this citation point at something real," not "does the cited text actually support what the claim says." An earlier session pass on this same codebase found the pre-existing `evaluate_faithfulness.py` faithfulness script used a lexical term-overlap heuristic for exactly this second question, scoring a perfect 1.0 on a 9-claim corpus — the kind of result a gameable metric produces, not evidence the underlying claims were actually checked.

## Constraints
- The verification step, if added, sees claim text and cited evidence text — content from a specific patient's record — so where that computation happens is itself a data-handling decision (see Why).
- `MAX_AUDIT_RETRIES = 2` (`nodes.py:417`) already bounds the audit-and-regenerate loop — any new verification tier has to fit inside that existing bound, not add a second, uncoordinated one.
- No labeled (claim, evidence, entailed-or-not) dataset exists for this corpus — a genuine precision/recall measurement of any verifier wasn't possible to produce in this session.

## Options

### Option A — Keep the ID-existence check only (status quo)
Cheap, deterministic, already correct at what it does — but conflates "cited" with "grounded," which is not the same claim.

### Option B — LLM-as-judge for semantic support
Ask a second LLM call whether the cited text entails the claim. Rejected as the first tier to build: it means claim/evidence content — patient-specific text — goes through an additional model call, adds latency and cost per claim, and introduces a second place non-deterministic behavior enters the audit path, which is the one part of this system explicitly designed to be checkable.

### Option C — Local NLI cross-encoder (chosen)
A small, local, already-available-as-a-dependency (`sentence-transformers`, already in `requirements.txt`) cross-encoder model (`cross-encoder/nli-deberta-v3-base`) scores each (claim, evidence) pair as contradiction/entailment/neutral. Narrower than an LLM judge, cheaper, and — consistent with ADR-008's stance — stays on the local host rather than adding another model call of any kind, local or remote.

### Option D — Both B and C (tiered escalation: NLI first, LLM judge for ambiguous cases only)
A reasonable future direction, explicitly not built now — it's new scope beyond what this session's evidence justified building, and Option C alone hadn't even been evaluated yet (see Revisit Trigger).

## Decision
Option C, implemented as a second, independent tier alongside the existing ID-existence check — not a replacement for it.

## Why
The two questions ("does the citation exist" vs. "does the evidence support the claim") are genuinely different, and conflating them was the actual defect: a citation-ID check can pass while the underlying claim is unsupported or contradicted by what it cites. A local cross-encoder answers the narrower, cheaper version of the second question without a second model call of any kind (local or remote), keeping this consistent with the project's local-inference stance rather than introducing a new external or LLM-mediated step for something a smaller model can answer directly.

## Edge Cases Handled
- **Model fails to load** (`src/agent/verification.py:76`, `_model = None` sentinel distinguishing "not yet attempted" from "attempted and failed"): falls back to tier-1-only behavior, logged as a warning, not a crash — the citation-ID check still runs regardless of whether the NLI model is available.
- **No cited evidence at all**: returns early with a "claim cites no evidence IDs" result rather than attempting to score against nothing.
- **Cited ID doesn't resolve to any retrieved text**: distinguished explicitly from "cited ID resolves but the text doesn't entail the claim" — these are different failure reasons, not collapsed into one generic "unsupported" bucket.
- **Multiple citations for one claim, mixed labels**: any contradiction among a claim's citations fails it regardless of other support; otherwise any entailment passes it; all-neutral fails it — a claim isn't rescued by one weak supporting citation if another cited source actively contradicts it.

## Optimizations
- Class-level model caching (`ClaimVerifier._model`, `verification.py:76`) — the model loads once per process, not once per claim or per request.
- **Shadow-mode-first rollout**: two independent flags — `semantic_verification_enabled` (compute at all) and `semantic_verification_gating_enabled` (let a failure actually block a response) — both default `False`. With the first on and the second off, the system computes and logs results for observability without any chance of the new, unevaluated capability blocking a real answer. This directly addresses the "no labeled dataset exists yet" constraint: the capability can be measured against real traffic before it's ever allowed to gate anything.

## Consequences

### Positive
- Distinguishes citation attribution from semantic support as two separately-labeled failure types (`"citation_missing"` vs. `"unsupported_by_evidence"`) instead of one conflated pass/fail.
- Adds no new model call class (local or remote) — reuses an already-present dependency rather than introducing a new one.

### Negative
- With gating still off by default, the semantic tier does not yet protect any real answer — it is verified-real but not yet load-bearing.
- No held-out evaluation exists yet quantifying the NLI verifier's actual precision/recall on this corpus — the comparison harness built this session (`scripts/evaluate_semantic_verification.py`) is ready to produce that measurement but hasn't been run in a full ML environment.

### New risks
- An NLI model has its own failure modes (e.g., short or unusually-phrased clinical text may not match its training distribution well) — this is exactly why gating stays off until measured, not assumed reliable by construction.

## Evidence
- `src/agent/verification.py:69` — `class ClaimVerifier`.
- `src/agent/verification.py:76` — the `_model` lazy-load/failure sentinel.
- `src/agent/verification.py:91` — `enabled` resolves from `retriever_config.semantic_verification_enabled`.
- `src/agent/graph/nodes.py` (`audit_claims`) — the two-tier check, `"citation_missing"` vs. `"unsupported_by_evidence"` failure types.
- `scripts/evaluate_semantic_verification.py` — the comparison harness against the pre-existing term-overlap heuristic.

## Revisit Trigger
Before turning on `semantic_verification_gating_enabled` in any real deployment, run the comparison harness in a full ML environment against a clinician-reviewed label set — the existing 9-claim corpus is already documented elsewhere as too small for a statistical conclusion, and this ADR does not treat "it ran without crashing" as equivalent to "it's accurate enough to gate a clinical answer."
