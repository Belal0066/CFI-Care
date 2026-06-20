# ADR-001: Multi-intent, confidence-gated routing graph

## Status
Accepted (current implementation)

## Context
The Clinical AI System needed to answer both patient-specific questions (grounded in that patient's own records) and general medical questions (drug safety, treatment guidelines — not necessarily patient-specific), through a single conversational entry point, while keeping citation-audit self-correction as a first-class part of the flow rather than exception-handling bolted on afterward.

A second, narrower implementation exists in the same codebase: `src/agent/workflow.py` (`ClinicalWorkflow`, labeled "Ticket 2.2" in its own docstring), also LangGraph-based (`StateGraph`), with nodes `retrieve → reason → audit → format/reject`. **This is not a sequential evolution** — `git show --stat ef231ab` confirms both `src/agent/workflow.py` and `src/agent/graph/workflow.py` (plus `graph/nodes.py`, `graph/state.py`) were added in the *same* commit, dated 2026-05-30, not one replacing the other over time. Only `src/agent/graph/workflow.py` is wired into the active launch path (`dashboard.py`, `FastAPI_Backend.py`) — `src/agent/workflow.py` is imported solely by `scripts/test_ddx.py`. **Both old and new use LangGraph** — the decision documented here is not "why LangGraph" (no alternatives-comparison for the graph library itself exists anywhere in the repo's history; treat that earlier choice as undocumented, not as evidence-backed), it's why the multi-intent routing graph has the shape it does, compared to the narrower, single-purpose graph that was built alongside it but never wired in as the active path.

## Constraints
- Must support both a manual mode toggle (`chat`/`local`/`mcp`) for testing/debugging and automatic intent-based routing.
- Must not let a low-confidence intent classification trigger an internet search — ungrounded external evidence is worse than falling back to the patient's own (already-verified) data.
- Must keep the citation-audit retry bounded (no infinite loop risk).

## Options

### Option A — Keep the single-purpose linear graph (`ClinicalWorkflow`)
`retrieve → reason → audit → format`, one path, no routing. Pros: simpler, already built and (per `context.md`) reasonably well-understood. Cons: **verified in code** — no conditional routing exists at all (`add_conditional_edges` is only used for the retrieve/audit outcome branches, not for choosing a data source), so it has no way to route a general drug-safety question away from patient-record retrieval; MCP/internet search integration would have to be bolted on as another linear stage, not a genuine choice.

### Option B — Two separate, independently-invoked entry points (one for RAG, one for MCP), no shared graph
Caller (the FastAPI endpoint or UI) decides which to call. Pros: simplest possible code. Cons: pushes the confidence-gating and intent-classification logic into the caller, duplicating it across `FastAPI_Backend.py`'s `/chat` and `dashboard.py` — evidenced by the fact that `FastAPI_Backend.py:396-409` already has to special-case visualization-intent detection before even reaching the agent graph, which is exactly the kind of routing logic this option would spread across every caller instead of centralizing it once.

### Option C — Single multi-intent graph with a confidence-gated router (chosen)
`classify_intent → route_intent → (rag_retrieve | mcp_search | visualize | generate) → generate → audit_claims`, with `route_intent` sending low-confidence classifications to RAG rather than MCP (`workflow.py:123-126`) and the audit loop bounded at `MAX_AUDIT_RETRIES = 2` (`nodes.py:289`).

## Decision
Option C — the current `src/agent/graph/workflow.py`.

## Why
This is a reconstructed engineering rationale based on capability deltas verified in the code (the original commit, `ef231ab`, has no design-rationale in its message — only a feature list) — not a sourced decision record:
- Centralizing routing in one node (`route_intent`) means the confidence threshold and RAG-intent list are defined once (`workflow.py:118-121`), not duplicated per caller, unlike Option B.
- The confidence gate's specific direction (low confidence → RAG, not MCP) is a real, deliberate safety choice — the code comment says so explicitly (`workflow.py:123`: "Low confidence → broad RAG (safer than hallucinating from internet sources)").
- A graph-native retry edge (`audit_claims` → `generate` on failure, bounded) is more legible than exception-based retry logic would have been, and keeps the bound (`MAX_AUDIT_RETRIES`) in one place.

## Consequences

### Positive
- New intents/routes are one more `add_conditional_edges` branch, not a new caller-side `if`.
- The safety-biased confidence gate is enforced once, not per-integration.

### Negative
- The graph has no dedicated automated test suite (`context.md §10.3`) — it's only exercised via manual dashboard interaction. This is the single largest testing gap flagged in [`ai/src/ai/README.md`](../../src/ai/README.md#honest-status).
- A LangGraph dependency and its state-machine mental model is a real onboarding cost versus linear code, for a project this size.

### New risks
- `audit_claims` retry exhaustion still returns a response (marked `audit_passed: False`) rather than refusing to answer — worth a deliberate second look at whether that's the right default for a clinical-reasoning system.

## Evidence
- `src/agent/graph/workflow.py` — conditional edges, retry edge, `MAX_AUDIT_RETRIES`.
- `src/agent/workflow.py` (co-introduced, not wired into the active path) — confirmed via direct read to be linear, no data-source routing.
- `git show --stat ef231ab` — confirms both files were added in the same commit, 2026-05-30, not sequentially.
- `git show -s --format=%B ef231ab` — the introducing commit's message (feature list only, no alternatives discussion).

## Revisit Trigger
If the system needs true parallelism (e.g., querying RAG and MCP simultaneously and merging results, rather than choosing one), or persistent memory across requests, a single `StateGraph` may no longer be the right shape — that would be an orchestrator-worker or multi-agent question, not a routing-graph one.
