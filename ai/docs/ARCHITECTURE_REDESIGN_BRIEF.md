# Architecture Redesign — Technical Brief

**Branch:** `ai-code-updates` (off `ai-repo-readme`) · **Commits:** `86421ce..85da43a` (9 commits, 2026-07-28 – 2026-08-25) · **Scope:** 14 files, +913/-91 lines across DOC2FHIR and the Clinical AI System.

This brief covers the implementation phase that followed an evidence-based audit of the Clinical AI System's actual architecture (as opposed to its documentation's framing). The audit's finding, in one line: the system is a deterministic LangGraph workflow with one bounded LLM-regenerate loop, real hybrid retrieval, and a real but structural-only citation check — not the "agentic RAG" / "MCP-native" system its own docs implied. Every change below is scoped to something the audit identified as a genuine correctness, safety, or grounding gap — nothing was added because a pattern is fashionable (see the constraints in `docs/adr/` and this brief's own "explicitly not done" section).

**This brief covers commits 1–9 only** (`86421ce..85da43a`). Later work on the same branch — the graded retrieval evaluator, the bounded ReAct loop, DOC2FHIR's fail-closed review gate, and OCR-to-page evidence grounding — is documented directly as ADRs [008](adr/008-local-model-serving-clinical-ai.md), [010](adr/010-graded-retrieval-evaluator.md), [011](adr/011-bounded-react-mcp-evidence-gathering.md), [014](adr/014-fail-closed-review-gate-doc2fhir.md), and [015](adr/015-evidence-page-grounding-doc2fhir.md), rather than being retrofitted into this document's per-commit structure.

## Summary table

| # | Commit | Date | Area | One-line change |
|---|---|---|---|---|
| 1 | `86421ce` | 2026-07-28 | Clinical AI — API | `patient_id` now flows from `ChatRequest` into the agent graph instead of being hardcoded to `None`; dropped a hardcoded Redis password fallback |
| 2 | `081434e` | 2026-08-01 | DOC2FHIR — Gateway | Removed a hardcoded `internal_secret` literal; `ui_v2.py`'s CORS restricted to localhost; its two `DELETE` endpoints now fail closed without a configured secret |
| 3 | `e782c9f` | 2026-08-04 | Clinical AI — config | Added the missing `mcp_server_url` config field that made `MCPToolManager` raise `AttributeError` on import |
| 4 | `86d6dfa` | 2026-08-06 | Clinical AI — agent graph | Audit-retry-exhausted path now abstains ("insufficient evidence") instead of returning an unverified answer |
| 5 | `60973ee` | 2026-08-10 | Clinical AI — evidence | New semantic (NLI) claim-evidence verification layer, additive to the existing citation-ID audit; ships disabled |
| 6 | `9a0aba1` | 2026-08-13 | Clinical AI — retrieval | Bounded, deterministic retry with a relaxed threshold when retrieval scores below the sufficiency gate |
| 7 | `b48b07c` | 2026-08-18 | Clinical AI — MCP | MedMCP/VizMCP calls now go through the real MCP protocol by default, not a REST bypass; added retry+backoff |
| 8 | `8b55d89` | 2026-08-21 | MedMCP — reliability | Per-source circuit breakers (PubMed/MedlinePlus/OpenFDA); one source failing no longer blanks out the others |
| 9 | `85da43a` | 2026-08-25 | Clinical AI — evaluation | Harness comparing the new NLI verifier against the existing term-overlap faithfulness heuristic, on the same corpus |

---

## 1. Safety and correctness fixes (commits 1–4)

These were treated as bugs, not architecture decisions — no evaluation was needed to justify them, only verification that the fix was correct.

**Patient-scope propagation.** `ChatRequest` (`src/api/FastAPI_Backend.py`) never carried a `patient_id`; `_run_agent_graph` hardcoded it to `None`, so the agentic `/chat` path's retrieval fell through to an unfiltered, all-patient Qdrant search. `retrieve_patient_context` already knew how to consume a real `patient_id` — it just never received one. Fixed by adding the field and passing it through.

**Hardcoded secrets.** Three were removed: a literal Redis password fallback (`FastAPI_Backend.py`), DOC2FHIR's `internal_secret` default (`gateway/config.py`), and — new hardening, not just removal — `ui_v2.py`'s CORS wildcard and its two unauthenticated `DELETE` endpoints (run-history deletion, FHIR resource deletion). The deletes now fail closed: no configured secret means no deletes, not "anyone can delete."

**Dead-but-imported code.** `MCPToolManager` (`src/agent/mcp_client.py`) referenced `config.mcp_server_url`, which didn't exist on `InfraConfig` — importing the module raised `AttributeError`. This wasn't cosmetic: `scripts/test_mcp_gui.py` imports it directly, so the break was live. Fixed by adding the field, not by removing the (otherwise correct) client — it's the same client this brief's §4 later wires into the live call path.

**Fail-closed audit exhaustion.** `route_after_audit` sent an unresolved citation-audit failure straight to `compute_confidence` after `MAX_AUDIT_RETRIES` (2), with only a server-side warning log — the response reached the user regardless of whether its claims ever verified. Added an explicit `abstain` node: exhausting the retry budget without passing now replaces the response with "insufficient evidence" instead.

*Correction made during this work:* the original audit had flagged `ClinicalWorkflow` (`src/agent/workflow.py`) and `MCPToolManager` as dead code. Checking importers before touching either showed both are used by real scripts (`scripts/test_ddx.py`, `scripts/test_mcp_gui.py`) — `ClinicalWorkflow` was left untouched entirely; `MCPToolManager` was fixed, not deleted.

## 2. Evidence verification layer (commit 5)

**The gap.** `audit_claims` checked that a claim's cited IDs *exist* among retrieved evidence. It never checked whether the cited text *supports* what the claim says — citation attribution and semantic support were conflated.

**What was built.** `src/agent/verification.py`: `Evidence`, `ClaimEvidenceLink`, `VerificationResult`, and `ClaimVerifier` — a local NLI cross-encoder (`cross-encoder/nli-deberta-v3-base` via `sentence-transformers`, already a project dependency) that scores each (claim, cited-evidence) pair as contradiction / entailment / neutral. Aggregation rule: any contradiction among a claim's citations fails it regardless of other support; otherwise any entailment passes it; all-neutral fails it.

**Rollout posture — deliberately conservative.** Two independent flags, both off by default (`src/retrieval/config.py`):
- `semantic_verification_enabled` — compute the check at all (loads the model).
- `semantic_verification_gating_enabled` — let a failed semantic check actually block a response (add it to `audit_failures`, set `audit_passed=False`).

With both off (today's default), the system's behavior is unchanged. With the first on, results are computed and returned via `claim_verifications` for observability only — "shadow mode." Only with both on does semantic support become an enforced gate. This directly follows the constraint against claiming semantic grounding when only ID-existence validation exists — the two are now separately labeled in the failure record (`"type": "citation_missing"` vs `"type": "unsupported_by_evidence"`).

**Verification performed:** unit-tested the aggregation logic against a mocked NLI model — entailment, contradiction, neutral, mixed-evidence (any-entailment-wins), and partial-missing-citation cases all resolve correctly (5/5 cases). Not tested against a live NLI model's actual output distribution — see §7.

See [ADR-009](adr/009-two-tier-evidence-verification.md) for the full design rationale, options considered, and edge cases.

## 3. Bounded adaptive retrieval (commit 6)

`retrieve_patient_context` already computed `has_insufficient_data` on every call — a real, already-existing signal — but nothing consumed it. A query scoring below the retrieval gatekeeper threshold went straight to reasoning on thin evidence anyway.

**What was built.** A new graph node, `retry_retrieval`, and a conditional edge (`route_after_retrieval`) off `rag_retrieve`: if the first pass is insufficient and the retry budget (`max_retrieval_retries`, default 1) isn't exhausted, relax the score threshold by `retrieval_retry_threshold_factor` (default 0.5) and retry once; otherwise proceed regardless.

**Deliberately not an LLM decision.** The retrieval score is already a sufficient signal to decide "try again, more broadly" — no model call is involved in deciding to retry or how. This was a considered choice, not an oversight: an LLM-driven query rewrite (reusing the existing `query_rewriter.py`, built for coreference resolution) was considered and rejected for this purpose, since it would add an unevaluated model call where a deterministic threshold check is sufficient and strictly easier to reason about and bound.

**Verification performed:** the bound was tested directly against realistic state transitions — retries exactly once under persistent insufficiency, never retries on a sufficient first pass, and the iteration counter correctly halts a hypothetical indefinite-insufficiency case.

This mechanism was later extended into a three-way graded evaluator with a model-controlled reformulation branch — see [ADR-010](adr/010-graded-retrieval-evaluator.md), a separate, later decision built on top of this one.

## 4. MCP protocol migration (commit 7)

**The gap.** A real MCP server existed (`mcps/main.py`, FastMCP, SSE-mounted, two registered tools), and a real MCP client existed (`MCPToolManager`, fixed in §1) — but the agent invoked MCP via a raw `httpx` POST to the server's REST wrapper (`/mcp/query`, `/mcp/viz/render`), bypassing the protocol entirely. This is the finding behind the constraint against claiming "MCP-native" architecture while bypassing MCP execution.

**What was built.** Both MCP tool calls (`get_medical_data`/MedMCP, `render_clinical_viz`/VizMCP) now route through `MCPToolManager`'s SSE-based `mcp.ClientSession` by default. Added bounded retry+backoff (`MCP_MAX_RETRIES=2`, exponential) on the query path, which previously had zero retries — a real asymmetry against DOC2FHIR's adapters, which already classify errors and retry.

**Rollback path kept, not deleted.** `MCP_TRANSPORT=rest` reverts to the exact previous REST call. This isn't boilerplate caution: the result-parsing (`_parse_mcp_tool_result`) assumes FastMCP's documented JSON-text serialization of a Pydantic-typed tool return, which could not be exercised against a live server in this environment (no `mcp`/`fastmcp`/`torch` installed in the sandbox this was built in). The flag is the actual safety net until that's verified against a running server.

**A risk that was checked, not assumed.** The graph is invoked both synchronously (`app.invoke()`, from the two Streamlit UI paths) and asynchronously (`app.ainvoke()`, from `/chat`). Calling `asyncio.run()` from a sync node inside an already-running event loop would crash. Rather than assume LangGraph isolates sync nodes into a worker thread under `ainvoke()` (plausible, but unverified here), a dual-mode bridge (`_run_async_from_sync`) was added and tested directly in both configurations — with and without an active loop in the calling thread.

**Also fixed:** `mcp` was imported directly by `src/agent/mcp_client.py` but never declared in `requirements.txt` — added.

See [ADR-012](adr/012-mcp-protocol-adoption.md) for the full design rationale. The evidence-gathering path this protocol now serves was later extended with a bounded ReAct loop — see [ADR-011](adr/011-bounded-react-mcp-evidence-gathering.md).

## 5. Reliability — circuit breakers (commit 8)

**The gap.** `retriever_node` (`mcps/router.py`) wrapped PubMed, MedlinePlus, and OpenFDA calls in one blanket `try/except`: any single source raising an exception discarded whatever the *other* sources had already returned for that query.

**What was built.** `mcps/adapters/circuit_breaker.py` — a standard three-state breaker (closed → open after 3 consecutive failures → half-open trial after a 60s cooldown → closed on recovery), one instance per source. `retriever_node` was restructured so each source's call is individually guarded; a failure or open circuit degrades that source only.

**Scoping note.** This was deliberately scoped to the MedMCP → external-API hop only, not the Clinical-AI-agent → MCP-server hop. The latter is a co-located, non-rate-limited dependency where a breaker adds complexity without a corresponding benefit; the former is three independent third-party APIs outside this system's control, which is the actual justification the redesign required before adding this pattern.

**Verification performed:** the state machine was tested for all real transitions, including the easy-to-get-wrong case — a half-open trial that fails must reopen immediately, not require the full failure threshold again. Also verified end-to-end (via a mocked failing PubMed call) that a source failing no longer blanks out a working source's results, which was the actual behavioral defect being fixed, not just a theoretical resilience improvement.

See [ADR-013](adr/013-per-source-circuit-breakers-medmcp.md) for the full design rationale, including why this was deliberately *not* extended to the agent→MCP-server hop.

## 6. Evaluation harness (commit 9)

While scoping how to responsibly evaluate the new `ClaimVerifier` before ever enabling its gating flag, an existing evaluator was found: `scripts/evaluate_faithfulness.py`, which measures "faithfulness" via lexical term-overlap (its own code comment: "upgradable to NLI"). Its tracked baseline result — 1.0 faithfulness on 9 claims — is exactly the kind of result a gameable lexical metric produces.

**What was built.** `scripts/evaluate_semantic_verification.py` subclasses the existing evaluator and runs `ClaimVerifier` over the identical claims, reporting per-claim agreement/disagreement between the two methods rather than two disconnected aggregate scores.

**Run, and a mistake caught during that run.** The script was executed end-to-end against the real 10-document corpus using a minimal environment lacking `sentence-transformers`/`torch`. It completed and correctly reported every semantic check as "skipped" rather than fabricating a result — confirming `ClaimVerifier`'s graceful-degradation path works under real (not mocked) conditions. That run also overwrote the repository's tracked `results/faithfulness_evaluation.json` with numbers produced by an incomplete environment (missing `fastembed` affected retrieval, and thus which claims got extracted, giving different numbers than the tracked baseline). This was caught via `git status`, reverted with `git checkout --`, and the incomplete run's other output file was deleted before committing — nothing from that run persisted.

**What this harness does not provide:** an actual precision/recall verdict on `ClaimVerifier`, or grounds to enable `semantic_verification_gating_enabled`. It needs a run in the full ML environment, and even then the existing 9-claim corpus is too small for a statistical conclusion — the script says so in its own output.

## 7. What was verified, and how (honesty about sandbox limits)

No step in this branch's implementation had access to a running Qdrant instance, a running MCP server, GPU-served models, or the full Python dependency set (`torch`, `sentence-transformers`, `qdrant-client`, `langgraph`, `mcp`/`fastmcp` were not installed in the environment this was built in). Verification was done at three levels, and each change above is only as trusted as the level it actually received:

1. **Syntax/import checks** on every touched file (`py_compile`, and import-chain resolution with a minimal venv) — all files.
2. **Logic unit tests**, using mocked dependencies to exercise the actual decision logic (retry bounds, circuit-breaker state transitions, NLI aggregation rules, async-bridge behavior, MCP result parsing) — commits 5, 6, 7, 8.
3. **One real end-to-end run** of new code against real data with a partial environment (commit 9), which surfaced a genuine issue (the tracked-file overwrite) that a syntax check or mock could not have caught.

Nothing in this branch was verified against a live LLM, a live MCP server round-trip, or Qdrant with real embeddings. That is the honest state of confidence in this work, not a gap being glossed over — it's why `MCP_TRANSPORT=rest` and the two semantic-verification flags exist as real, working off-switches rather than being presented as already-proven.

## 8. Explicitly not done, and why

- **Confidence calibration (ECE, reliability curves, selective accuracy).** Needs a labeled held-out evaluation set that doesn't exist. Building one is a data/clinical-review task, not a code change — implementing calibration math against fabricated labels would violate the redesign's own constraint against inventing evaluation numbers.
- **Request-level model routing** (local vs. remote backend chosen per-query). Explicitly gated on evaluation showing it beats static selection on cost/latency/quality; no such evaluation exists yet, so the static `llm_backend` config selection is untouched.
- **Reranking / query decomposition** in the retrieval pipeline. Considered and explicitly rejected for now — no evidence the current RRF-fused top-k ordering is the retrieval bottleneck; adding either would be exactly the "add it because production RAG needs one" pattern the redesign was scoped to avoid.
- **A circuit breaker on the Clinical-AI-agent → MCP-server hop.** Considered and rejected — that hop is a co-located dependency, not a rate-limited third party; a breaker there adds complexity without addressing a real failure mode.

## Feature flags introduced (all default to today's existing behavior unless noted)

| Flag | Default | Effect when changed |
|---|---|---|
| `retriever_config.semantic_verification_enabled` | `False` | Compute NLI claim-evidence checks (shadow mode: logged only) |
| `retriever_config.semantic_verification_gating_enabled` | `False` | Let a failed semantic check block a response (requires the flag above) |
| `retriever_config.max_retrieval_retries` | `1` | Cap on the adaptive-retrieval retry loop |
| `retriever_config.retrieval_retry_threshold_factor` | `0.5` | How much the retry relaxes the retrieval score threshold |
| `MCP_TRANSPORT` (env var) | `mcp` | Set to `rest` to roll back to the pre-migration direct HTTP call |
| `DOC2FHIR_INTERNAL_SECRET` (env var) | unset | Must be set for `ui_v2.py`'s delete endpoints to function at all (fail-closed) |
