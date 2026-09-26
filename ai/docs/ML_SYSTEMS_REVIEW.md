# ML Systems Review (Huyen framework)

An evaluation of `ai/` against Chip Huyen's *Designing Machine Learning Systems* (O'Reilly, Ch. 1-7): what already applies, what could be applied, and what should be applied, in that priority order. This is a diagnostic document, not an ADR — it doesn't propose a specific implementation, it names gaps against a published framework so they can be triaged deliberately.

## Framing: why most of the book doesn't apply the way you'd expect

`ai/` is two subsystems — **DOC2FHIR** (OCR → LLM mapping → FHIR delivery) and **Clinical AI** (`src/ai`, a LangGraph RAG/agentic copilot) — both built entirely on off-the-shelf pretrained/quantized models (llama.cpp GGUF Mapper/reasoner models, PaddleOCR-VL) plus hybrid dense+sparse retrieval (Qdrant + BGE + SPLADE, fused via manual RRF per [ADR-002](adr/002-hybrid-retrieval-manual-rrf.md)). **There is no training or fine-tuning pipeline anywhere in the repo.**

That fact determines which chapters are load-bearing:

- **Ch.3 (Training Data)** and **Ch.4 (Feature Engineering)** — not applicable to model training, since nothing here is trained. Ch.3's sampling-method framework is still relevant, but only to how the *evaluation* corpora were built (see §3).
- **Ch.2 (Data Engineering)** applies narrowly, to the ingestion/chunking pipeline (`src/ai/src/ingestion/`), not to a data warehouse — this system has no OLTP/OLAP split to speak of.
- **Ch.1 (RSMA requirements), Ch.5 (model development & offline evaluation), Ch.6 (deployment), Ch.7 (why ML systems fail)** are the chapters that actually bite, and each turns up a real gap already visible in the repo's own ADRs and `FAILURE_MODES.md`.

## 1. What already applies

Credit where it's due — the system already reflects parts of the framework, not just gaps:

- **RSMA "Reliable"** (Ch.1: correctness under fault, including *silent* failure, is ML's defining production risk): per-source circuit breakers ([ADR-013](adr/013-per-source-circuit-breakers-medmcp.md)), a fail-closed `NEEDS_REVIEW` gate before FHIR delivery ([ADR-014](adr/014-fail-closed-review-gate-doc2fhir.md)), and a bounded ReAct loop capped at 3 iterations ([ADR-011](adr/011-bounded-react-mcp-evidence-gathering.md)) are real, specific defenses against exactly this risk, not generic error handling.
- **Deployment myth: "expect many models per product, not one"** (Ch.6): already true here — distinct local models per role (Mapper, OCR-VLM, Clinical reasoner/generator), each pinned to a specific quantization, rather than one general-purpose model doing everything.
- **Model-selection discipline: start simple, avoid the SOTA trap** (Ch.5): the deterministic `ClinicalReasoner` ([ADR-003](adr/003-deterministic-bounded-reasoning.md)) has zero LLM/HTTP imports for patient-specific claims — reaching for a structurally simpler, more reliable mechanism before defaulting to an LLM is exactly this principle in practice.
- **Disciplined (if incomplete) rollout gating**: new evaluators — semantic verification ([ADR-009](adr/009-two-tier-evidence-verification.md)), the graded retrieval evaluator ([ADR-010](adr/010-graded-retrieval-evaluator.md)), the ReAct loop — all ship **disabled by default** pending real measurement, rather than flipped on and trusted. This is the right instinct; §3-4 explain why it isn't finished yet.

## 2. Explicit non-gaps

Things Huyen's framework would normally ask about, that genuinely don't apply here — named so they aren't mistaken for oversights:

- **No feature store, model registry, or experiment tracker** (MLflow/DVC/W&B) anywhere in the repo. Normal and low-priority for a system with no training loop to track experiments against; config-pinned quantized model files (e.g. `medgemma-1.5-4b-it-Q6_K.gguf`) serve the equivalent purpose of a registry here.
- **Ch.3/Ch.4's training-data and feature-engineering machinery** — weak/semi-supervision, the hashing trick, feature crossing, positional embeddings — none of it applies; there's no training pipeline to apply it to.

## 3. What can be applied

Feasible, not yet done, worth deliberately deciding on:

- **Slice-based evaluation (Ch.5)**: current eval numbers (Retrieval Recall@3 = 0.575, Faithfulness = 1.000, Hallucination = 0.000, from corpora of roughly 9-10 documents/claims) are reported in aggregate. Once the corpora grow past toy size, slice by intent type (patient-specific vs. general-medical) and by MCP source — aggregate metrics can hide or even invert the true comparison across subgroups (Simpson's paradox, Ch.5).
- **Baseline discipline (Ch.5)**: there's no evidence the retrieval numbers were compared against a random or trivial-heuristic baseline. Recall@10/MRR = 1.000 on a 9-10-item ground truth set is very likely near-trivial rather than a meaningfully strong result — worth confirming against a baseline before citing it anywhere.
- **Data-leakage check, applied to evaluation rather than training (Ch.4)**: it's unverified whether any document used to tune prompts, thresholds, or RRF weights also appears in the reported eval set. Ch.4's rule — never touch what you're using for final reporting — applies to eval corpora just as much as to test splits.
- **Distribution-shift monitoring for retrieval (Ch.7)**: no drift detection exists, which is consistent with there being no training pipeline to retrain in response to drift. But Ch.7's diagnostic taxonomy (covariate shift: P(query) changes; concept drift: what counts as relevant changes) still applies to retrieval quality — if production query patterns diverge from the eval corpus's query distribution, Recall@3 stops meaning anything, and nothing today would surface that silently.
- **Feedback loop, closed carefully (Ch.7)**: `src/ai/Data/feedback.jsonl` already collects thumbs-up/down and free-text comments on `/chat` responses, but nothing in the codebase consumes it — it's collection, not a loop. Before anyone wires it into ranking or retraining, Ch.7's degenerate-feedback-loop warning applies pre-emptively: any system where implicit user feedback becomes a training signal is a degenerate-loop candidate by default, and needs popularity/diversity instrumentation from day one, not added after the fact.
- **Batch/online hybridization (Ch.6)**: DOC2FHIR jobs that hit `SERVER_BUSY` currently dead-end with no requeue (already documented in `FAILURE_MODES.md`). Ch.6 argues online (low-latency) and batch (high-throughput, async) prediction should be hybridized rather than treated as one-or-the-other — reframing this as "there's no batch-retry path for load-shed jobs" rather than just a bug points at the actual fix.

## 4. What should be applied

Highest priority, given this handles clinical data:

- **The ADR-004 default-path gap is the single highest-priority item.** [ADR-004](adr/004-fhir-mapping-strategy.md) documents that the *default* FHIR-mapping path is LLM-direct with **no validation gate**, while the validated/deterministic path is opt-in. This is precisely the silent-failure mode Ch.1 names as ML's defining production risk — here, in a pipeline whose stated guarantee is "an extraction we're not confident about is held for review, not silently delivered." The default currently doesn't enforce that guarantee.
- **Minimum monitoring before enabling any currently-gated evaluator (Ch.1 "Reliable"/"Maintainable").** DOC2FHIR has structured logging with correlation IDs; Clinical AI has neither — no structured logging, no tracing, per the repo's own "Known Limitations" (Prometheus/OpenTelemetry are listed only as future work in `src/ai/mcps/docs/PRODUCTION_UPGRADE.md`, not shipped). Ch.1's argument is that without monitoring, failures become invisible rather than absent. Treat baseline observability on Clinical AI as a prerequisite before flipping on semantic verification or the graded retrieval evaluator — otherwise there's no way to tell if enabling them helped or quietly broke something.
- **Enlarge eval corpora before trusting the currently-disabled evaluators enough to enable them (Ch.5).** The §3 baseline and slicing recommendations aren't just nice-to-haves — without them, enabling semantic verification or graded retrieval means trusting a decision made on ~9-10 examples. Grow the corpus first, then decide.

## Out of scope

`FAILURE_MODES.md` already documents real app-security issues (a hardcoded fallback secret, unauthenticated DELETE endpoints in a debug UI) that this review deliberately excludes — those are application-security gaps, not ML-systems-design gaps, and belong in a security review, not here.
