# ADR-010: Graded retrieval evaluator — corrective and agentic retrieval branches

## Status
Accepted (implemented, disabled by default, `ai-code-updates` branch) — contemporaneous rationale.

## Context
The existing adaptive-retrieval retry (`route_after_retrieval`, `workflow.py`) used a single binary check: `has_insufficient_data` true or false, with one bounded retry that relaxed the same query's score threshold and searched again. It could not distinguish "the match is weak, a broader net would probably find it" from "this plainly isn't in this patient's record, searching again won't help" — and it never tried a *different* query, only a more permissive threshold on the same one.

## Constraints
- Any new retrieval decision has to stay inside the existing `max_retrieval_retries` budget (`src/retrieval/config.py:48`, default `1`) — not add a second, separate iteration counter.
- A model-controlled reformulation step, if added, means an extra LLM call on some fraction of queries — has to be justified by a real problem the deterministic threshold couldn't solve, not added by default.
- No corpus-level evaluation of retrieval quality exists to tune graded thresholds precisely — the chosen boundary reuses numbers already established elsewhere in this codebase (see Optimizations) rather than introducing new, untested ones.

## Options

### Option A — Keep the single-threshold retry (status quo)
Simple, already deterministic, but blind to the *degree* of insufficiency — a query that's obviously unmatched gets the same treatment (relax and retry) as one that's borderline.

### Option B — Always reformulate on any insufficiency
Would mean every insufficient-retrieval case spends an LLM call, including cases (clearly out-of-scope queries) where reformulating the same patient's index isn't going to produce a different answer. Rejected — this spends model calls on cases a threshold can already identify as unlikely to benefit.

### Option C — Three-way graded split: sufficient / ambiguous / insufficient (chosen)
`_grade_retrieval` (`src/agent/graph/nodes.py`) grades `retrieval_avg_top3` into three bands using two thresholds instead of one. Only the ambiguous band spends a model call (`reformulate_query`); the insufficient band gets a deterministic corrective decision (`handle_insufficient_evidence`) with no LLM call for the routing decision itself.

### Option D — Full CRAG with an external web-search fallback
Rejected as out of scope: this system has no web-search source to fall back to, and building one is a materially larger, separately-scoped change than what this session's evidence justified. The system should be described as implementing the graded/corrective *shape* of CRAG, not the full published pattern — see the accompanying pattern-classification work from this session.

## Decision
Option C.

## Why
The single threshold conflated two situations that need different responses. "Ambiguous" (some signal, low confidence) is exactly the case where a semantic judgment about *how* to search differently can plausibly help, and is where spending a model call is justified. "Insufficient" (very low signal) is a case where relaxing the same query further, or spending a model call to reformulate it, is unlikely to produce a materially different retrieval result — the better response is a *different kind* of action (fall back to general knowledge, or say plainly that nothing matched), which is a routing decision a threshold can make correctly without needing a model at all.

## Edge Cases Handled
- **Reformulation itself fails or times out** (`reformulate_query`, `nodes.py`): falls back to the original query text, logged as a warning — does not propagate the failure or leave the query empty.
- **Grade is still bad after reformulation**: the retry is bounded by the same `retrieval_iterations`/`max_retrieval_retries` counter the plain threshold-retry path already used (`route_after_retrieval`, `workflow.py:172`) — a second ambiguous or insufficient grade after one reformulation attempt proceeds to reasoning (or the insufficient branch) rather than reformulating again.
- **Insufficient grade with no general-knowledge-applicable intent**: `handle_insufficient_evidence` (`nodes.py:782`) checks intent against a fixed set (`diagnosis`, `differential`, `medication`, `rationale`, `allergy`) before routing to the general-knowledge MCP fallback; anything outside that set routes to the existing `abstain` node instead of silently guessing at a fallback that doesn't fit the query.
- **Flag off (default)**: `route_after_retrieval` reproduces the old single-threshold behavior exactly — this was verified directly, not assumed, by mirroring both code paths in a test and confirming identical outputs for the same inputs.

## Optimizations
- `retrieval_insufficient_threshold` (`src/retrieval/config.py:70`, default `0.075`) is not a new, separately-tuned number — it equals the existing retry path's already-relaxed threshold (`retrieval_gatekeeper_threshold * retrieval_retry_threshold_factor`), so the new grading boundary is consistent with a number this codebase already treated as meaningful, not an arbitrary new one.
- Reuses the already-computed `retrieval_avg_top3` signal for grading — no new retrieval mechanism, no additional Qdrant query.
- General-knowledge fallback reuses the existing `mcp_search` node and its existing MCP protocol client (ADR-012) rather than building a second external-lookup path.

## Consequences

### Positive
- A materially better-targeted response to retrieval quality than a single threshold could give, without adding an LLM call to the (more common) clearly-sufficient or clearly-insufficient cases.
- The "Agentic RAG" and "Corrective RAG" labels this session's architecture review discussed become accurate in a narrow, defensible sense for this specific mechanism, rather than being applied to the system as a whole.

### Negative
- Adds one more model-call class to the retrieval path (reformulation), on the ambiguous band only — a real latency/cost increase for that subset of queries when the flag is on.
- The graded thresholds haven't been validated against a labeled retrieval-quality benchmark — they're reused from an existing, already-accepted number, not independently justified from scratch.

### New risks
- A reformulated query could, in principle, drift further from the clinician's actual intent than the original — bounded to one attempt specifically to limit how much damage a bad reformulation can do before falling through to reasoning anyway.

## Evidence
- `src/agent/graph/nodes.py` — `_grade_retrieval`, `reformulate_query`, `handle_insufficient_evidence`.
- `src/agent/graph/workflow.py:172` — `route_after_retrieval`, flag-gated branch selection.
- `src/agent/graph/workflow.py:217` — `route_after_insufficient_evidence`.
- `src/retrieval/config.py:69-70` — `graded_retrieval_evaluator_enabled` (default `False`), `retrieval_insufficient_threshold` (default `0.075`).

## Revisit Trigger
Before enabling `graded_retrieval_evaluator_enabled` by default, measure reformulation's actual effect on downstream claim-support rate against a held-out query set — this ADR's threshold reuse is a reasonable starting point, not a substitute for that measurement.
