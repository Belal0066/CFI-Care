# ADR-002: Hybrid dense + sparse retrieval, manual Reciprocal Rank Fusion

## Status
Accepted (current implementation)

## Context
Clinical text mixes free-text narrative (where semantic/dense retrieval helps — "elevated glucose" should match "hyperglycemia") with exact tokens that matter precisely because they're exact (drug names, lab codes, dosages — where dense embeddings under-rank exact matches that don't paraphrase well). A single retrieval mode has a real, known failure mode for one of these query types.

## Constraints
- `requirements.txt` pins `qdrant-client==1.7.0` (`requirements.txt:9`) — this version predates Qdrant's native `Prefetch`/`FusionQuery` server-side fusion API.
- Retrieval must run against the same collection for both dense and sparse queries (no separate infrastructure).

## Options

### Option A — Dense-only retrieval (embedding similarity alone)
Pros: simplest, one query type, one score to reason about. Cons: `optimization_results_2026-06-12.md` (an internal benchmark report) explicitly evaluated multiple dense-only embedding models (BGE-base, BGE-small, MiniLM) and selected BGE-base for best Recall@3 (0.661) among dense-only options — but that number is still measured against a 10-document corpus, and the report's own stated motivation for adding sparse fusion afterward is that dense-only under-ranks exact clinical terms. This is the real, if narrow, evidence trail for why dense-only wasn't the final answer.

### Option B — Sparse-only (BM25/SPLADE alone)
Not implemented or benchmarked anywhere in the repo — no evidence exists for or against this as a serious alternative; not a real comparison, just noting it wasn't tried.

### Option C — Upgrade `qdrant-client` and use native server-side fusion (`Prefetch`/`FusionQuery`)
Pros: less custom code, fusion computed server-side. Cons: not evaluated — the pin to `1.7.0` predates this API, and there's no evidence in the repo of anyone testing whether upgrading was tried and rejected, or simply never attempted. Treat "why not upgrade" as genuinely undocumented, not as a considered-and-rejected option.

### Option D — Hybrid dense + sparse, fused client-side via manual RRF (chosen)
`HybridRetriever` (`src/retrieval/service.py`) runs a dense query (BGE-base-en-v1.5) and a sparse query (`NamedSparseVector`, SPLADE `prithivida/Splade_PP_en_v1`) separately, then fuses ranks by hand using the RRF formula with a configurable rank constant (`rrf_rank_constant = 60`, `retrieval/config.py:38` area — see `optimization_results_2026-06-12.md` for the parameter sweep that arrived at this default).

## Decision
Option D.

## Why
- The `qdrant-client==1.7.0` pin is a real, verifiable constraint (Option C's native fusion API genuinely doesn't exist in that client version) — this is the strongest, most directly sourced reason in this ADR.
- The dense-vs-hybrid tradeoff is evidenced by an actual internal experiment (`optimization_results_2026-06-12.md`), not just intuition — sparse fusion was added because dense-only embedding evaluation alone didn't close the exact-term-matching gap.
- The RRF rank constant (60) and other fusion parameters were swept, not guessed — `optimization_results_2026-06-12.md` documents the sweep range (`rrf_rank_constant` 30-200, etc.) and states no parameter significantly changed recall at the 10-document scale tested, which is itself an honest limitation, not a strength, of the current parameter choice.

## Consequences

### Positive
- No dependency on a newer `qdrant-client` API; works with the pinned version.
- The fusion logic is inspectable, ordinary Python — not opaque server-side behavior.

### Negative
- Two round-trips to Qdrant per query (dense + sparse) instead of one fused server-side call.
- The RRF implementation is custom code that has to be maintained and could silently drift from the standard RRF formula without a dedicated unit test comparing it against a reference implementation (not confirmed to exist — flag as unverified, not as absent, since this wasn't specifically checked).

### New risks
- All retrieval benchmark numbers currently in [`ai/src/ai/README.md`](../../src/ai/README.md#results) (Recall@3 0.408, Recall@10 0.875) are measured against a 10-document corpus — too small to be conclusive at the stated targets (>0.90, >0.95). The parameter choices in this ADR (RRF constant, thresholds) are therefore tuned against a benchmark too small to trust the tuning itself.

## Evidence
- `requirements.txt:9` — `qdrant-client==1.7.0`.
- `src/retrieval/service.py` — manual RRF implementation, `NamedSparseVector` usage.
- `results/optimization_results_2026-06-12.md` — embedding model comparison, parameter sweep, and the corpus-size limitation explicitly noted by the report itself.

## Revisit Trigger
If `qdrant-client` is upgraded past the version supporting native `Prefetch`/`FusionQuery`, re-evaluate whether the manual RRF implementation should be replaced with the server-side equivalent — and re-run the retrieval benchmark against a corpus larger than 10 documents before trusting any recall number as a real target-vs-actual comparison.
