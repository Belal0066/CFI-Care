# ADR-003: Deterministic, bounded clinical reasoning — no external knowledge in the core reasoner

## Status
Accepted (current implementation)

## Context
A clinical reasoning system that lets its core reasoner draw on the LLM's general medical training data (rather than only the documents it was actually given) can produce claims that sound authoritative but aren't traceable to this patient's actual record — a real risk in a domain where an unsupported claim isn't just wrong, it's clinically dangerous. The system needed a way to guarantee that at least one part of the pipeline reasons *only* over evidence it can point to.

## Constraints
- Every claim in a response must be checkable against retrieved documents (`audit_claims`, see [ADR-001](001-multi-intent-routing-graph.md)) — that check is only meaningful if there's a code path that structurally can't introduce ungrounded claims in the first place.
- General medical knowledge (drug interactions, published guidelines) is still sometimes the right answer to a query — the system can't refuse to ever use it.

## Options

### Option A — One reasoner, LLM-driven, given retrieved context as "grounding" in the prompt
Pros: simpler, one code path handles both patient-specific and general questions. Cons: prompt-based grounding is a request, not a guarantee — an LLM can still generate an unsupported claim even when told not to; the only backstop would be the audit step catching it *after* generation, which is strictly weaker than a reasoner that structurally cannot introduce an ungrounded claim.

### Option B — Two separate reasoning paths: a bounded, non-LLM-knowledge deterministic reasoner for patient-specific claims, and a separately-routed LLM+MCP path for general medical questions (chosen)
`ClinicalReasoner` (`src/agent/clinical_reasoning.py`) has zero imports of any LLM client or HTTP library — verified directly by reading the file's imports (only `pydantic`, `RetrievalContext`, `ClinicalDocument`). It only reasons over documents it's handed. General medical questions are routed elsewhere entirely (`route_intent` → MCP path, see ADR-001), which explicitly *does* use an LLM over external evidence (PubMed/OpenFDA/MedlinePlus) — a structurally separate path, not a flag on the same one.

## Decision
Option B.

## Why
- The separation is structural, not a prompt instruction — `ClinicalReasoner` cannot call an LLM even if you wanted it to, because it doesn't import one. That's a stronger guarantee than "the prompt says don't."
- This is consistent with, and reinforced by, the fact that the audit step (`audit_claims`) checks `source_node_ids` against `encounter_groups` (ADR-001) — the check is meaningful specifically because the reasoner it's checking is architecturally constrained to only cite what it was given.

## Consequences

### Positive
- A patient-specific claim from `ClinicalReasoner` is, by construction, traceable to a specific retrieved document — not just "probably grounded because the prompt asked for it."
- The boundary is enforceable in code review: an LLM/HTTP import appearing in `clinical_reasoning.py` would be an immediate, obvious violation of the design, not a subtle prompt regression.

### Negative
- Two reasoning paths (deterministic reasoner + LLM/MCP path) is more code to maintain than one, and the intent classifier (`route_intent`) — not the reasoner itself — is what decides which path a query takes. A misclassified intent routes to the wrong reasoning mode, not a wrong answer within the right mode; that's a different failure surface than a single-reasoner design would have.
- The deterministic reasoner's *retrieval* input can still be wrong (see the `/chat` patient-isolation gap, [`FAILURE_MODES.md`](../FAILURE_MODES.md)) — this ADR only guarantees the reasoner doesn't add ungrounded claims on top of whatever it was given, not that what it was given was correct or correctly scoped.

## Evidence
- `src/agent/clinical_reasoning.py` — direct read of imports, confirmed no LLM/HTTP client.
- `src/agent/graph/nodes.py:642` (`query_mcp`) — the separate, explicitly LLM+internet path for general medical questions.
- `src/agent/graph/nodes.py:292` (`audit_claims`) — the check that structurally depends on this separation being real.

## Revisit Trigger
If a future requirement needs the deterministic reasoner itself to incorporate general medical knowledge (not just retrieved patient documents), that's not a config change — it's a removal of the guarantee this ADR documents, and should be treated as a new decision requiring the same level of scrutiny as this one, not a quiet prompt edit.
