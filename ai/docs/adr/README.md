# Architecture Decision Records — `ai/`

Real decisions only — each one is either sourced from an explicit rationale in code/docs/commit history, or explicitly labeled as reconstructed engineering justification where no such source exists. See [`../SYSTEM_OVERVIEW.md`](../SYSTEM_OVERVIEW.md) for how these fit into the system as a whole, and [`../FAILURE_MODES.md`](../FAILURE_MODES.md) for what can go wrong at runtime.

| ADR | Decision | Evidence strength |
|---|---|---|
| [001](001-multi-intent-routing-graph.md) | Multi-intent, confidence-gated LangGraph routing (Clinical AI System) | Reconstructed — capability delta verified in code, no sourced design rationale |
| [002](002-hybrid-retrieval-manual-rrf.md) | Hybrid dense + sparse retrieval, manual RRF (Clinical AI System) | Strong — `qdrant-client==1.7.0` pin + an internal benchmark report |
| [003](003-deterministic-bounded-reasoning.md) | Deterministic, bounded citation reasoning — no LLM/external knowledge in the core reasoner (Clinical AI System) | Strong — structurally verified in code (no LLM/HTTP imports) |
| [004](004-fhir-mapping-strategy.md) | FHIR mapping: LLM-direct (default) vs. deterministic extraction (opt-in) (DOC2FHIR) | Strong on what exists; **the "why this is the default" is undocumented** — flagged for reconsideration |
| [005](005-vlm-based-ocr.md) | VLM-based OCR (PaddleOCR-VL) instead of classical OCR (DOC2FHIR) | Reconstructed — no sourced rationale found anywhere in the repo |
| [006](006-local-model-serving-mapper.md) | Local, self-hosted model serving for the Mapper (DOC2FHIR) | Strong — explicit data-residency rationale in `Mapper/README.md` |
| [007](007-gpu-concurrency-one.md) | Single shared GPU semaphore, concurrency = 1, across OCR + Mapper (DOC2FHIR) | Reconstructed — real constraint, no sourced rationale for the specific concurrency=1 choice |
| [008](008-local-model-serving-clinical-ai.md) | Local-only model serving as the default for the Clinical AI System (Clinical AI System) | Strong — contemporaneous, implemented and documented in the same effort |
| [009](009-two-tier-evidence-verification.md) | Two-tier evidence verification: citation attribution vs. semantic/NLI entailment (Clinical AI System) | Strong — contemporaneous |
| [010](010-graded-retrieval-evaluator.md) | Graded retrieval evaluator — corrective and agentic retrieval branches (Clinical AI System) | Strong — contemporaneous |
| [011](011-bounded-react-mcp-evidence-gathering.md) | Bounded ReAct loop, scoped to MCP evidence-gathering only (Clinical AI System) | Strong — contemporaneous |
| [012](012-mcp-protocol-adoption.md) | MCP Host/Client/Server protocol adoption, REST kept as an explicit fallback (Clinical AI System) | Strong — contemporaneous |
| [013](013-per-source-circuit-breakers-medmcp.md) | Per-source circuit breakers for MedMCP's external medical APIs (Clinical AI System) | Strong — contemporaneous |
| [014](014-fail-closed-review-gate-doc2fhir.md) | Fail-closed review gate before delivery (DOC2FHIR) | Strong — contemporaneous |
| [015](015-evidence-page-grounding-doc2fhir.md) | Ground extracted evidence to real OCR bounding boxes (DOC2FHIR) | Strong — contemporaneous |

Three of the first seven (004, 005, 007) carry an explicit "no sourced rationale" flag rather than a fabricated one — that's deliberate. An ADR that invents a plausible-sounding "why" for a decision nobody actually documented is worse than one that says so plainly; the reconstructed technical justification is still useful, but it should never be mistaken for what the original author actually reasoned through.

ADRs 008–015 are a different case: the design choice and its rationale were captured by the same work that implemented it, not reconstructed afterward — labeled "contemporaneous" rather than citing a pre-existing external source the way 002/003/006 do, so that distinction stays visible rather than implying a source document that doesn't exist.
