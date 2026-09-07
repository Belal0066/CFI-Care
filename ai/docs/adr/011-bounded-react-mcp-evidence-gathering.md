# ADR-011: Bounded ReAct loop, scoped to MCP evidence-gathering only

## Status
Accepted (implemented, disabled by default, `ai-code-updates` branch) — contemporaneous rationale.

## Context
`query_mcp` made exactly one MCP call per turn: classify the question, construct or optimize a query, call `get_medical_data` once, return whatever came back. A genuinely multi-hop external-evidence question (e.g., a drug-interaction query where confirming one interaction naturally raises "what about this second drug class too") needs a decision made *after seeing the first result* — something a single deterministic call structurally cannot do, no matter how good the initial query construction is.

## Constraints
- The one property this whole redesign has protected throughout is that `ClinicalReasoner` — the component that decides what's clinically true from *this patient's own record* — stays fully deterministic. Any new model-controlled loop must not touch that component or its inputs.
- A loop that a model can extend indefinitely is a real cost and latency risk on a system with a single shared GPU (see ADR-007's sibling constraint on the DOC2FHIR side) — any such loop needs a hard, code-enforced cap, not a cap the model is merely asked to respect.
- Per this session's own architecture-quality review: "do not expose unrestricted internal chain-of-thought" and "store structured action decisions/results" were explicit requirements, not suggestions.

## Options

### Option A — Keep the single-shot MCP call (status quo)
Cannot handle the multi-hop case at all — not a defect exactly, but a real capability gap for exactly the kind of question this path exists to answer.

### Option B — Unrestricted agent loop with tool access across the whole system, including patient-record reasoning
Rejected outright, not just deprioritized: giving a model iterative control over whether/how to re-reason about a patient's own record would trade away the one guarantee (`ClinicalReasoner`'s determinism) that makes the rest of this system's claims auditable. This was never seriously considered as an option for that reason.

### Option C — Bounded ReAct loop, scoped to MedMCP's `get_medical_data` tool only (chosen)
`_run_mcp_react_loop` (`src/agent/graph/nodes.py:990`) implements observe → the model decides an action → act → observe → ... → finish, hard-capped at `MAX_REACT_ITERATIONS` (`nodes.py:926`, from `retriever_config.mcp_react_max_iterations`, default `3`, `src/retrieval/config.py:77`). The action space is deliberately narrower than "every MCP tool" — `MCPReActActionName = Literal["get_medical_data", "finish"]` (`src/agent/react.py:25`) — `render_clinical_viz` (VizMCP) is not offered as an action here, because rendering a chart belongs to a different graph branch (`visualize`), not to evidence-gathering, and including it would make the loop's purpose incoherent rather than more capable.

## Decision
Option C.

## Why
The multi-hop case is real and MedMCP's tools are read-only, side-effect-free external lookups — safe territory for a model to iterate over, unlike patient-record reasoning. Scoping the action space to exactly the tool this loop's problem is about (rather than reusing a generic "every tool is available" design) keeps the loop's behavior easy to reason about and matches the actual failure mode being fixed, not a hypothetical broader one.

## Edge Cases Handled
- **Model requests a disallowed action**: `_mcp_react_decide` (`nodes.py`) explicitly checks `if action not in ("get_medical_data", "finish")` (`nodes.py:974`) and raises, which is caught by the surrounding `try/except` and converted into a `finish` step (`nodes.py:975` and the except handler) — the loop fails toward *stopping*, not toward re-prompting indefinitely for a valid action.
- **Malformed JSON decision**: same exception path — a JSON parse failure produces a `finish` step with `thought="decision step failed, stopping"`, not a crash and not an infinite retry.
- **Iteration cap hit without the model ever choosing `finish`**: the `for...else` construct (`nodes.py:1006-1025`) logs this explicitly and proceeds with whatever evidence was gathered in the completed iterations — this is treated as a normal termination condition, not an error state, and is exactly the case an adversarial test (a mock that always requests another action) was built to confirm actually happens.
- **Every individual tool call still goes through the existing MCP client, retry+backoff, and (server-side) circuit breakers** (ADR-012, ADR-013) — this loop only decides *whether and how many times* to call, never *how* an individual call executes or recovers from failure.

## Optimizations
- Decision steps are stored as structured data (`MCPReActStep{step_index, thought, action, action_input, observation_summary}`, `react.py:28`), not hidden free-form chain-of-thought — the loop's trace is auditable data from the start, not something that would need a separate parsing effort to inspect later.
- Uses prompted JSON (the same convention `mcps/router.py`'s `classification_node` already used elsewhere in this codebase — "respond in strict JSON format"), not a new prompting convention invented for this one loop.

## Consequences

### Positive
- Genuinely satisfies ReAct's defining characteristic (the model iteratively decides actions and observes results) for the one sub-problem where that's actually useful, without extending that control to the rest of the system.
- The failure-toward-stopping design means a malformed or adversarial decision step degrades gracefully rather than needing a separate watchdog.

### Negative
- Adds up to `MAX_REACT_ITERATIONS` additional model calls (and MCP tool calls) to a query that takes this path — real latency/cost increase when the flag is on, versus the single-call default.
- Not grammar-constrained decoding (this codebase has none, confirmed absent elsewhere in this session's audit) — a sufficiently unusual model output could still fail to parse as JSON at all, which is handled (see Edge Cases) but is a real, not eliminated, failure surface.

### New risks
None beyond the latency/cost tradeoff already noted — the iteration cap and action allowlist are both enforced in code, not by asking the model nicely, so there's no new unbounded-behavior risk this design introduces.

## Evidence
- `src/agent/graph/nodes.py:990` — `_run_mcp_react_loop`.
- `src/agent/graph/nodes.py:926` — `MAX_REACT_ITERATIONS = retriever_config.mcp_react_max_iterations`.
- `src/agent/graph/nodes.py:974-975` — allowlist check and rejection.
- `src/agent/graph/nodes.py:1006-1025` — the bounded loop and its `for...else` cap-hit handling.
- `src/agent/react.py:25,28` — `MCPReActActionName`, `MCPReActStep`.
- `src/retrieval/config.py:76-77` — `mcp_react_loop_enabled` (default `False`), `mcp_react_max_iterations` (default `3`).

## Revisit Trigger
Before enabling `mcp_react_loop_enabled` by default, measure whether the multi-hop case it's meant to solve actually occurs often enough in real query traffic to justify the added latency on every MCP-routed query — this ADR is justified by a plausible, real capability gap, not by a measured frequency of that gap actually mattering.
