# ADR-013: Per-source circuit breakers for MedMCP's external medical APIs

## Status
Accepted (implemented, `ai-code-updates` branch) — contemporaneous rationale.

## Context
`retriever_node` (`mcps/router.py`) wrapped calls to PubMed, MedlinePlus, and OpenFDA in one blanket `try/except`: if any single source raised an exception, the whole retrieval aborted and returned an error, discarding whatever the *other* sources had already successfully returned for that query. There was also no mechanism to stop hammering a source that was actually down — every query would retry the call structure against it from scratch.

## Constraints
- The three sources are independent third-party dependencies with their own uptime and rate limits, outside this system's control.
- The Clinical AI agent's own call into the MCP server (a separate hop from MedMCP's calls out to these three APIs) is a co-located, non-rate-limited dependency — a fix scoped to "add resilience to external calls" should not conflate these two genuinely different hops.
- Existing per-call timeouts already exist upstream of any new resilience layer — a new mechanism should complement that, not duplicate or replace it.

## Options

### Option A — No circuit breaker (status quo)
One blanket `try/except` around the whole node — a single source failing aborts the entire retrieval, discarding other sources' results. This was the actual, real defect motivating this change.

### Option B — One shared circuit breaker across all three sources
Rejected: PubMed being down says nothing about whether OpenFDA is also down — a shared breaker would couple three unrelated failure domains and could trip (or fail to trip) based on the wrong source's behavior.

### Option C — One circuit breaker per source (chosen)
`_pubmed_breaker`, `_medlineplus_breaker`, `_openfda_breaker` (`mcps/router.py:21-23`), each an independent `CircuitBreaker("<name>", failure_threshold=3, reset_timeout_sec=60.0)` instance (`mcps/adapters/circuit_breaker.py:36-37`). `retriever_node` was restructured (`_search_pubmed_safe`, `mcps/router.py:149`; `_search_medlineplus_safe`, `mcps/router.py:163`) so each source's call is individually guarded, catching `CircuitOpenError` per source (`router.py:155,166,223`) rather than one shared exception boundary for the whole node.

### Option D — Add a circuit breaker to the agent→MCP-server hop too
Rejected: that hop is co-located and has no rate limit to protect against — a breaker there adds real complexity (a new failure mode of its own: the breaker itself tripping incorrectly) without a corresponding problem it would solve. Explicitly not built, per this session's own architecture-review constraint against adding resilience patterns "because they sound sophisticated" rather than because a real failure mode justifies them.

## Decision
Option C.

## Why
Three independent, rate-limited, externally-operated dependencies are exactly the shape of problem circuit breakers exist for — and the demonstrated defect (one source's failure blanking out working sources' results) is a real, present bug, not a hypothetical one.

## Edge Cases Handled
- **A half-open trial call itself fails**: must reopen the circuit immediately, not require the full `failure_threshold` (3) to be reached again from scratch (`circuit_breaker.py:65`, checking `current == CircuitState.HALF_OPEN` as an independent re-open condition) — this is the specific detail naive circuit breaker implementations get wrong, and was verified directly with a dedicated test case (open → cooldown → half-open trial fails → immediately open again, not requiring 3 more failures).
- **A source that's merely slow vs. genuinely down**: handled by the existing per-call timeout, upstream of and independent from the breaker's failure counting — a single slow-but-eventually-successful call doesn't count as a breaker failure.
- **One source down, others healthy**: verified directly (not just asserted) — a test forced `search_pubmed` to fail while `search_medlineplus` succeeded, confirming the query still returns MedlinePlus's results rather than an empty/error response for the whole retrieval.

## Optimizations
- Breakers are scoped narrowly to the one hop that's actually an unstable external dependency (MedMCP → PubMed/MedlinePlus/OpenFDA) — not applied by default to every call in the codebase, and not added to the agent→MCP-server hop where there's no corresponding failure mode to guard against (see Option D).
- The state-machine implementation (`mcps/adapters/circuit_breaker.py`) is a small, self-contained ~80-line module reused by all three source breakers — one implementation, three independent instances, not three copies of the same logic.

## Consequences

### Positive
- One source's outage degrades gracefully instead of blanking out every source's results for a query — a real, demonstrated behavioral fix, not just added defensive code with no prior failure to point to.
- Repeated calls to a known-down source fail fast (once the breaker opens) instead of continuing to pay the full timeout cost on every retry.

### Negative
- Three more pieces of long-lived state (one breaker per source) to reason about in production — a source that's flaky in a pattern the fixed thresholds (`failure_threshold=3`, `reset_timeout_sec=60.0`) don't suit well could behave surprisingly (e.g., trip and reopen too eagerly or too slowly) until those numbers are tuned against real traffic.

### New risks
- The breaker's own state could, in principle, mask a source recovering faster than the 60-second cooldown allows — a real, accepted tradeoff of any fixed-cooldown breaker, not unique to this implementation.

## Evidence
- `mcps/adapters/circuit_breaker.py:36-37,49,65` — `CircuitBreaker` class, half-open transition, immediate-reopen-on-half-open-failure logic.
- `mcps/router.py:21-23` — the three independent breaker instances.
- `mcps/router.py:149,155,163,166,223` — `_search_pubmed_safe`, `_search_medlineplus_safe`, and the OpenFDA call site's `CircuitOpenError` handling.

## Revisit Trigger
If real production traffic shows the fixed `failure_threshold=3`/`reset_timeout_sec=60.0` values trip too eagerly or too slowly for any one of the three sources' actual failure patterns, tune per-source rather than assuming one set of numbers fits all three — they currently share identical parameters by default, not because the three sources are known to behave identically.
