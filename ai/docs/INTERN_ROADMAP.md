# AI Intern Learning Roadmap — CFI-Care `ai/`

A project-specific onboarding path for a new intern joining the `ai/` codebase. Assumes general AI/ML and software engineering knowledge already; this document teaches only what is specific to *this* repo.

## How to use this document (and the research-agent workflow it's built for)

The core of this document is **Section C, the Concept Reference Catalog** — one entry per concept, technology, or pattern actually used in this codebase. Every entry has the same four load-bearing fields:

- **Origin** — where the concept/technology actually comes from (a library, a protocol spec, an academic technique, or "custom to this repo"). This is what you search for online — searching for the *origin*, not the internal file name, is what finds the right docs/papers.
- **Used here** — the exact file(s)/function(s) implementing it in this repo (the "X").
- **Documented here** — the exact ADR/doc file in this repo that explains the decision (the "Y"), or an explicit note that it's undocumented.
- **External resources** — currently marked `_pending research pass_`. This is intentional: a research agent is meant to walk every entry in Section C, search the internet for the official docs / canonical reference / paper for that entry's **Origin**, and fill this field in with links + a one-line note on what each resource clarifies. Do not have the research agent touch the "Used here" or "Documented here" fields — those are verified against this repo's actual code and must stay grounded in it.

**Intended reading loop for the intern, once External resources are filled in:** read the external resource first to get the general-purpose theory → come back to "Used here" and "Documented here" to see exactly how/why this repo implements it, including any deviations from the textbook version (several entries below explicitly note where this repo's implementation diverges from the "standard" version of a concept — that gap is often the most important thing to understand).

Concepts are grouped into 10 categories and numbered `C1`–`C60` for stable cross-referencing from the day-by-day plan in Section D.

---

## A. Executive Summary

`ai/` contains **two independently-deployable subsystems** that are not wired together in code (hypothesized, not confirmed, to be pipeline stages of one product — see [Knowledge Gaps](#g-knowledge-gaps--risks)):

1. **DOC2FHIR** (`ai/src/DOC2FHIR/`) — turns a scanned/photographed medical document into standards-compliant FHIR R5 resources. A VLM-based OCR service reads the document, a locally-served LLM maps the extracted text into FHIR, and low-confidence or invalid output is held for human review instead of being silently delivered.
2. **Clinical AI System** (`ai/src/ai/`) — an agentic RAG copilot that answers a clinician's natural-language question about a patient's history or general medical topics. It retrieves evidence with hybrid (dense+sparse) search, reasons deterministically over that evidence, and audits every generated claim against the retrieved evidence before returning it — abstaining rather than hallucinating when it can't verify a claim.

Both subsystems deliberately avoid sending patient data to third-party inference APIs — the models that touch patient data run locally (`ai/README.md`, [ADR-006](../docs/adr/006-local-model-serving-mapper.md), [ADR-008](../docs/adr/008-local-model-serving-clinical-ai.md)).

**Target end-state after this roadmap:** the intern can start both subsystems locally, trace one request through each system end-to-end (naming the exact functions/nodes involved), explain the key architectural guarantees and *why* they exist, and ship one small, real, useful change.

---

## B. Priority Tiers

Rather than repeat detail already in Section C, this is a quick index by required depth. Concept IDs (`C#`) refer to Section C entries.

- **Must know before contributing:** C1, C2, C5, C7, C8, C11, C18, C19, C22, C23, C31, C41, C42, C46, C52
- **Should know during first few weeks:** C3, C4, C6, C9, C10, C13, C16, C17, C20, C21, C25, C31–C39, C43, C44, C49, C50, C55, C56, C58
- **Learn later:** C12, C26, C29 (remote path), everything under Category 5 not already listed as must/should, C61–C64 eval internals beyond running them
- **Not needed for this project:** fine-tuning/training pipelines, building a vector DB from scratch, DSPy/prompt-optimization frameworks, Kubernetes/production MLOps — none of these appear anywhere in this repo; don't spend study time on them.

---

## C. Concept Reference Catalog

### Category 1 — Agent Orchestration & Reasoning Patterns

#### C1. LangGraph `StateGraph` (agent orchestration)
- **Origin:** LangGraph library (LangChain ecosystem) — graph-based agent orchestration framework.
- **Used here:** `ai/src/ai/src/agent/graph/{workflow.py,nodes.py,state.py}` — `workflow.py` builds `StateGraph(ClinicalAgentState)`, compiles it as `app`; a **second, smaller** LangGraph graph exists independently in `ai/src/ai/mcps/router.py`.
- **Documented here:** [ADR-001](../docs/adr/001-multi-intent-routing-graph.md), `ai/src/ai/docs/diagrams/LangGraph-Agent-Workflow.mmd`, `ai/src/ai/docs/component_diagram.md`.
- **Depth / Priority:** Practice · Must know
- **External resources:** _pending research pass_

#### C2. Conditional graph routing (multi-intent dispatch)
- **Origin:** LangGraph's `add_conditional_edges` mechanism; general graph-based agent design pattern.
- **Used here:** `workflow.py` — `route_intent`, `route_after_retrieval`, `route_after_reason`, `route_after_audit`, `route_after_insufficient_evidence`, all plain Python functions.
- **Documented here:** [ADR-001](../docs/adr/001-multi-intent-routing-graph.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C3. Rule-based intent classification (regex/keyword, not an LLM call)
- **Origin:** classic NLP rule-based text classification (predates ML classifiers) — a deliberate design choice here, not a shortcut.
- **Used here:** `ai/src/ai/src/retrieval/query_understanding.py::IntentClassifier` — the graph's `classify` entry node calls this, **not** an LLM.
- **Documented here:** not explicitly called out in the docs as "rule-based" — this is a common intern misconception to preempt; verify directly in code.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C4. Bounded ReAct (Reason+Act) loop
- **Origin:** ReAct prompting/agent pattern (Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models," 2022).
- **Used here:** `ai/src/ai/src/agent/react.py`, `nodes.py::_run_mcp_react_loop` — capped at 3 iterations, action space restricted to `get_medical_data`/`finish` only; **off by default** (`mcp_react_loop_enabled=False` in `RetrieverConfig`).
- **Documented here:** [ADR-011](../docs/adr/011-bounded-react-mcp-evidence-gathering.md) — explicitly notes it is *not* applied to patient-record reasoning, only external MCP evidence gathering.
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C5. Deterministic, non-LLM reasoning core
- **Origin:** general software-engineering principle (a rule-based/deterministic core insulated from stochastic LLM output) rather than any specific library.
- **Used here:** `ai/src/ai/src/agent/clinical_reasoning.py::ClinicalReasoner` — verified to contain **zero** LLM/HTTP imports; only synthesizes prose from already-retrieved, cited evidence downstream.
- **Documented here:** [ADR-003](../docs/adr/003-deterministic-bounded-reasoning.md).
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

#### C6. Job orchestration state machine (DOC2FHIR)
- **Origin:** general workflow-orchestrator / job-state-machine pattern (not a named library — hand-rolled here).
- **Used here:** `ai/src/DOC2FHIR/gateway/orchestrator.py::JobOrchestrator` drives every job through OCR → Mapping → optional review gate → Delivery; `models.py` defines the `JobStatus` enum including `NEEDS_REVIEW`.
- **Documented here:** `ai/src/DOC2FHIR/README.md`, [ADR-014](../docs/adr/014-fail-closed-review-gate-doc2fhir.md) — note the README's own lifecycle diagram omits the real `NEEDS_REVIEW` state (see [Knowledge Gaps](#g-knowledge-gaps--risks)).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

---

### Category 2 — Retrieval, RAG & Embeddings

#### C7. Hybrid dense + sparse retrieval
- **Origin:** general information-retrieval technique combining semantic (dense) and lexical (sparse) search; popularized as a first-class feature by vector DBs including Qdrant.
- **Used here:** `ai/src/ai/src/retrieval/service.py::HybridRetriever.search()` — queries Qdrant's dense (`text-dense`) and sparse (`text-sparse`) named vectors separately.
- **Documented here:** [ADR-002](../docs/adr/002-hybrid-retrieval-manual-rrf.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C8. Reciprocal Rank Fusion (RRF) — **hand-rolled, not a Qdrant built-in**
- **Origin:** classic IR fusion algorithm (Cormack, Clarke & Buettcher, "Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods," SIGIR 2009) — a general algorithm, not a Qdrant feature. This repo implements it by hand specifically because the pinned `qdrant-client==1.7.0` predates Qdrant's native server-side fusion.
- **Used here:** `service.py::_reciprocal_rank_fusion()` — `score[doc] += 1/(rank_constant + rank + 1)` summed across both dense and sparse result lists, `rank_constant=60` (`retriever_config.rrf_rank_constant`).
- **Documented here:** [ADR-002](../docs/adr/002-hybrid-retrieval-manual-rrf.md) — explicitly records *why* it's manual rather than library-provided.
- **Depth / Priority:** Practice · Must know
- **External resources:** _pending research pass_

#### C9. Dense embeddings — BGE-base-en-v1.5
- **Origin:** BAAI (Beijing Academy of Artificial Intelligence) open embedding model; served locally via the `fastembed` library.
- **Used here:** `ai/src/ai/src/ingestion/service.py` (`fastembed.TextEmbedding("BAAI/bge-base-en-v1.5")`), 768-dim, cosine similarity.
- **Documented here:** `ai/src/ai/docs/data-reference.md`, `ai/src/ai/docs/diagrams/Data-Ingestion-Pipeline-TOON.mmd`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C10. Sparse embeddings — SPLADE
- **Origin:** SPLADE (SParse Lexical AnD Expansion) model family (Naver Labs research); checkpoint `prithivida/Splade_PP_en_v1`, served via `fastembed`.
- **Used here:** `ai/src/ai/src/ingestion/service.py` (`fastembed.SparseTextEmbedding`).
- **Documented here:** `ai/src/ai/docs/diagrams/Data-Ingestion-Pipeline-TOON.mmd`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C11. Qdrant vector database (collections, named vectors, filtering)
- **Origin:** Qdrant — open-source vector database.
- **Used here:** `docker-compose.yml` (`qdrant/qdrant:v1.7.0`), `src/retrieval/service.py`, `src/ingestion/service.py`; also `_INTENT_FILTER_MAP` in `service.py` builds Qdrant `FieldCondition` filters per clinical intent.
- **Documented here:** `ai/src/ai/docs/component_diagram.md`.
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C12. Graded retrieval evaluation (Corrective-RAG-style)
- **Origin:** conceptually related to Corrective Retrieval-Augmented Generation (CRAG) research — the ADR explicitly states this implements "the shape of CRAG," not the full published pattern.
- **Used here:** `nodes.py::_grade_retrieval()` buckets retrieval quality into sufficient/ambiguous/insufficient; `route_after_retrieval` dispatches accordingly. **Off by default** (`graded_retrieval_evaluator_enabled=False`).
- **Documented here:** [ADR-010](../docs/adr/010-graded-retrieval-evaluator.md).
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C13. LLM-driven query reformulation
- **Origin:** general "agentic RAG" pattern — using an LLM call to rewrite an ambiguous query rather than a fixed rule.
- **Used here:** `nodes.py::reformulate_query`, `ai/src/ai/src/agent/query_rewriter.py`; only triggered on the "ambiguous" band of C12's grading.
- **Documented here:** [ADR-010](../docs/adr/010-graded-retrieval-evaluator.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C14. Bounded adaptive retry (deterministic threshold relaxation)
- **Origin:** general retrieval-robustness pattern (no LLM call involved — deliberately deterministic).
- **Used here:** `nodes.py::retry_retrieval` — one relaxed-threshold retry when the first retrieval pass is deemed insufficient.
- **Documented here:** [ADR-010](../docs/adr/010-graded-retrieval-evaluator.md) (context), `ai/docs/SYSTEM_OVERVIEW.md`.
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C15. Sentence-boundary sliding-window chunking
- **Origin:** standard RAG document-chunking technique.
- **Used here:** `ai/src/ai/src/ingestion` `DocumentChunker` — chunk size 400, overlap 50, per `Data-Ingestion-Pipeline-TOON.mmd`.
- **Documented here:** `ai/src/ai/docs/diagrams/Data-Ingestion-Pipeline-TOON.mmd`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C16. TOON (Token-Oriented Object Notation)
- **Origin:** the `python-toon` package (external dependency, pinned `python-toon==0.1.2`) — a FHIR/JSON-to-LLM-optimized text format claiming 30–50% token reduction versus raw JSON.
- **Used here:** `ai/src/ai/src/ingestion/toon.py::ToonNormalizer`, plus an "Inline Builder" path for custom (non-FHIR) nodes.
- **Documented here:** `ai/src/ai/docs/diagrams/Data-Ingestion-Pipeline-TOON.mmd`, `ai/src/ai/docs/data-reference.md`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C17. Encounter-level result grouping
- **Origin:** domain-specific retrieval-aggregation pattern custom to this repo (group chunk-level hits by clinical encounter, not a named external technique).
- **Used here:** `service.py::search_by_encounter()`, `EncounterGroup`, with adaptive prefetch sizing (`_adaptive_prefetch`) based on estimated encounter count.
- **Documented here:** not explicitly documented outside code — flag as a doc gap.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

---

### Category 3 — Evidence Verification & Confidence

#### C18. Two-tier evidence/claim verification
- **Origin:** general RAG faithfulness/grounding engineering pattern (combining a cheap deterministic check with a heavier semantic check).
- **Used here:** `nodes.py::audit_claims` — Tier 1 always on, Tier 2 gated separately.
- **Documented here:** [ADR-009](../docs/adr/009-two-tier-evidence-verification.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C19. Citation-ID grounding check (Tier 1)
- **Origin:** simple existence-check grounding technique (verify a cited ID actually exists in the retrieved set) — custom to this repo, not a named external algorithm.
- **Used here:** `audit_claims` Tier 1 — verifies every `source_node_ids` claim exists among the retrieved `encounter_groups`.
- **Documented here:** [ADR-009](../docs/adr/009-two-tier-evidence-verification.md).
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

#### C20. NLI (Natural Language Inference) cross-encoder verification (Tier 2)
- **Origin:** NLI is a standard NLP task (entailment/contradiction/neutral classification); model used is `cross-encoder/nli-deberta-v3-base` via the `sentence-transformers` library.
- **Used here:** `ai/src/ai/src/agent/verification.py::ClaimVerifier` — runs in **shadow mode** by default (computed/logged but does not gate `audit_passed` unless `semantic_verification_gating_enabled` is also set).
- **Documented here:** [ADR-009](../docs/adr/009-two-tier-evidence-verification.md).
- **Depth / Priority:** Learn · Should know
- **External resources:** _pending research pass_

#### C21. Multi-layer confidence scoring
- **Origin:** general weighted-composite-scoring pattern, custom to this repo (no external library).
- **Used here:** `ai/src/ai/src/agent/confidence.py::compute_overall_confidence` — combines routing/retrieval/generation/validation layers into one confidence value, appended as a human-readable block to the final response.
- **Documented here:** not documented outside code — flag as a doc gap.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C22. Fail-closed abstention
- **Origin:** general AI-safety engineering pattern ("abstain rather than hallucinate/guess").
- **Used here:** `nodes.py::abstain` node — reached when claim verification fails after `MAX_AUDIT_RETRIES=2` regenerations.
- **Documented here:** `ai/docs/SYSTEM_OVERVIEW.md`, `ai/README.md` (invariants section).
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

---

### Category 4 — Models & Inference Serving

#### C23. llama.cpp OpenAI-compatible local serving
- **Origin:** the `llama.cpp` project (`ggml-org`) — a C/C++ LLM inference engine with an OpenAI-compatible HTTP server mode.
- **Used here:** **both** subsystems' default LLM path: `ai/src/ai/launch.sh` (MedGemma, port 8000) and `ai/src/DOC2FHIR/Mapper/scripts/run_llama_server.sh` (Gemma-4, port 8070) — every local LLM call in this repo goes through the same `/v1/chat/completions` pattern via the generic `openai` Python SDK.
- **Documented here:** [ADR-006](../docs/adr/006-local-model-serving-mapper.md), [ADR-008](../docs/adr/008-local-model-serving-clinical-ai.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C24. MedGemma (1.5-4B local / 27B remote)
- **Origin:** Google's MedGemma open model family (medically-tuned Gemma variants).
- **Used here:** `medgemma-1.5-4b-it-Q6_K.gguf` (with `mmproj-F16.gguf` for vision) via llama.cpp locally; `google/medgemma-27b-it` (128k context) via SGLang on Lightning AI remotely — switched by `InfraConfig` (`src/shared/config.py`) / `launch.sh --local|--lightning`.
- **Documented here:** [ADR-008](../docs/adr/008-local-model-serving-clinical-ai.md), `ai/README.md`.
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

#### C25. Gemma-4 (Unsloth quantized) — DOC2FHIR Mapper LLM
- **Origin:** Unsloth's quantized GGUF build (`unsloth/gemma-4-E4B-it-GGUF`, Q4_K_M) of a Gemma-family model.
- **Used here:** `ai/src/DOC2FHIR/Mapper/` — a single model, prompted for three different roles depending on pipeline path: document classification, structured extraction, and (default path) direct FHIR bundle generation.
- **Documented here:** [ADR-006](../docs/adr/006-local-model-serving-mapper.md), `Mapper/models/unsloth-gemma-4-e4b-it-gguf/Modelfile`.
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

#### C26. SGLang remote serving on Lightning AI
- **Origin:** SGLang — an LLM inference server/runtime project; Lightning AI is the cloud GPU host used here.
- **Used here:** `ai/src/ai/.env.example` (`LIGHTNING_BASE_URL`, `LIGHTNING_MODEL_NAME`, `LIGHTNING_ACCESS_TOKEN`), opt-in only.
- **Documented here:** [ADR-008](../docs/adr/008-local-model-serving-clinical-ai.md).
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C27. vLLM inference serving
- **Origin:** the vLLM project — a high-throughput LLM/VLM serving engine.
- **Used here:** backs the DOC2FHIR OCR service's recognition calls (port 8118), launched via `scripts/start_vllm_official_8118.sh`, tuned for low VRAM via `configs/vllm_backend_low_vram.yaml` (`gpu_memory_utilization: 0.35`, `max_model_len: 1536`, `enforce_eager: True`).
- **Documented here:** [ADR-005](../docs/adr/005-vlm-based-ocr.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C28. PaddleOCR-VL (vision-language OCR model)
- **Origin:** Baidu PaddlePaddle's PaddleOCR-VL project — PP-DocLayoutV2 layout detection + PaddleOCR-VL-1.5-0.9B recognition, a genuinely VLM-based (not classical) OCR pipeline.
- **Used here:** `ai/src/DOC2FHIR/OCR/OCRpipelie/app/option3_ui.py` (`PaddleOCRVL(vl_rec_backend="vllm-server", ...)`).
- **Documented here:** [ADR-005](../docs/adr/005-vlm-based-ocr.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C29. GPU concurrency serialization (single shared semaphore)
- **Origin:** general resource-contention-management pattern (mutex/semaphore guarding a shared, single-GPU host) — custom to this repo, not a named library feature.
- **Used here:** `ai/src/DOC2FHIR/gateway/orchestrator.py` — a single `asyncio.Semaphore(1)` serializes the OCR and Mapper GPU stages so they never run simultaneously.
- **Documented here:** [ADR-007](../docs/adr/007-gpu-concurrency-one.md) — notes this is a conservative default; no VRAM benchmark exists yet.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C30. Groq-hosted LLM inference (query classification / optimization)
- **Origin:** Groq Cloud API (LPU-based inference hosting).
- **Used here:** `ai/src/ai/mcps/router.py` (`langchain_groq.ChatGroq`) for classification/entity-extraction/query synthesis in the MCP server — confirmed in code as `llama-3.3-70b-versatile`. **Unverified discrepancy:** `component_diagram.md` separately references `llama-3.1-8b-instant` for the same general purpose — confirm with a senior engineer which is authoritative, or whether both exist for different call sites (see [Knowledge Gaps](#g-knowledge-gaps--risks)).
- **Documented here:** `ai/src/ai/docs/component_diagram.md` (partially conflicting with code — see above).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

---

### Category 5 — MCP Protocol & External Tool Integration

#### C31. Model Context Protocol (MCP)
- **Origin:** Anthropic's open Model Context Protocol specification.
- **Used here:** `ai/src/ai/src/agent/mcp_client.py` (client, `MCPToolManager`), `ai/src/ai/mcps/main.py` (server) — exposes `get_medical_data` (MedMCP) and `render_clinical_viz` (VizMCP) as MCP tools.
- **Documented here:** [ADR-012](../docs/adr/012-mcp-protocol-adoption.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C32. FastMCP framework
- **Origin:** FastMCP — an open-source Python framework for building MCP servers on top of FastAPI-style routing.
- **Used here:** `ai/src/ai/mcps/main.py` (`fastmcp.FastMCP`, `@mcp.tool()` decorators), mounted at `/mcp` (SSE) alongside plain REST endpoints.
- **Documented here:** `ai/src/ai/mcps/requirements.txt`; decision context in [ADR-012](../docs/adr/012-mcp-protocol-adoption.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C33. SSE (Server-Sent Events) transport for MCP
- **Origin:** SSE — a web standard for one-way server-to-client event streaming; used here as MCP's default transport.
- **Used here:** `mcp.client.sse.sse_client` inside `src/agent/mcp_client.py`.
- **Documented here:** [ADR-012](../docs/adr/012-mcp-protocol-adoption.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C34. Dual-transport rollback pattern (protocol vs. REST fallback)
- **Origin:** general resilience/rollback engineering practice (keep an old, simpler path available as an explicit escape hatch for a new one).
- **Used here:** `MCP_TRANSPORT` env var (`mcp` default vs `rest`) — `nodes.py::_call_mcp_endpoint_rest`/`_render_chart_rest` are direct `httpx` calls kept as a documented fallback.
- **Documented here:** [ADR-012](../docs/adr/012-mcp-protocol-adoption.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C35. Circuit breaker pattern (per external source)
- **Origin:** classic distributed-systems resilience pattern, popularized by Netflix Hystrix (closed → open → half-open state machine).
- **Used here:** `ai/src/ai/mcps/adapters/circuit_breaker.py::CircuitBreaker` — one instance per external source (PubMed, MedlinePlus, OpenFDA), `failure_threshold=3`, `reset_timeout_sec=60.0`. Deliberately **not** applied to the agent→MCP-server hop (co-located, not rate-limited) or to Groq/RxNorm.
- **Documented here:** [ADR-013](../docs/adr/013-per-source-circuit-breakers-medmcp.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C36. PubMed E-utilities API
- **Origin:** NCBI/NLM's PubMed E-utilities API.
- **Used here:** `ai/src/ai/mcps/adapters/pubmed.py`.
- **Documented here:** [ADR-013](../docs/adr/013-per-source-circuit-breakers-medmcp.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C37. OpenFDA API
- **Origin:** U.S. FDA's OpenFDA public API (drug/label data).
- **Used here:** `ai/src/ai/mcps/adapters/openfda.py`.
- **Documented here:** [ADR-013](../docs/adr/013-per-source-circuit-breakers-medmcp.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C38. MedlinePlus API
- **Origin:** NIH National Library of Medicine's MedlinePlus consumer health search API.
- **Used here:** `ai/src/ai/mcps/adapters/medlineplus.py`.
- **Documented here:** [ADR-013](../docs/adr/013-per-source-circuit-breakers-medmcp.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C39. RxNorm / RxNav API (drug name normalization)
- **Origin:** NLM's RxNorm/RxNav drug-normalization API.
- **Used here:** `ai/src/ai/mcps/adapters/rxnav.py` — notably has **no** circuit breaker (unlike C36–C38).
- **Documented here:** not explicitly discussed in ADR-013 beyond noting the omission — flag as a thin-doc area.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

---

### Category 6 — FHIR & Clinical Data Standards

#### C40. HL7 FHIR (R5) resource model
- **Origin:** HL7 International's FHIR (Fast Healthcare Interoperability Resources) standard, R5 release.
- **Used here:** `ai/src/DOC2FHIR/gateway/fhir_mapper.py`, `Mapper/schemas/r5/fhir.schema.json` (full official schema, ~75k lines), `fhir.resources` Python package (also a dependency of `ai/src/ai`).
- **Documented here:** [ADR-004](../docs/adr/004-fhir-mapping-strategy.md), `ai/src/DOC2FHIR/DocOnFHIR_API_Spec.md`.
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C41. FHIR `Bundle` / transaction semantics
- **Origin:** FHIR specification's `Bundle` resource and `transaction` interaction type.
- **Used here:** `gateway/adapters/hapi_fhir.py` posts the whole bundle to HAPI FHIR, ideally as `type=transaction`.
- **Documented here:** [ADR-004](../docs/adr/004-fhir-mapping-strategy.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C42. HAPI FHIR server
- **Origin:** HAPI FHIR — an open-source Java FHIR JPA server implementation.
- **Used here:** `docker-compose.yml` (`hapiproject/hapi:v6.6.0` + Postgres 15), `gateway/adapters/hapi_fhir.py`, `scripts/verify_hapi_fhir.py` (note: this script's own default port, 8090, mismatches the gateway's default of 8080 — see [Knowledge Gaps](#g-knowledge-gaps--risks)).
- **Documented here:** `ai/docs/ARCHITECTURE.md` (also the basis for the cross-subsystem hypothesis), `ai/docs/SYSTEM_OVERVIEW.md`.
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C43. FHIR `Provenance` resource construction
- **Origin:** FHIR's `Provenance` resource type (tracking who/what/when produced a record).
- **Used here:** `gateway/provenance_builder.py`.
- **Documented here:** `ai/src/DOC2FHIR/README.md`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C44. Terminology normalization (LOINC etc.)
- **Origin:** LOINC (Logical Observation Identifiers Names and Codes) standard plus a general terminology-service integration pattern.
- **Used here:** `gateway/fhir_mapper.py` (LOINC mapping tables), `gateway/terminology_client.py`.
- **Documented here:** not documented outside code — flag as a doc gap.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C45. JSON Schema validation
- **Origin:** the JSON Schema specification; Python `jsonschema` library.
- **Used here:** `gateway/fhir_validator.py::FhirValidator` validates generated bundles against `Mapper/schemas/r5/fhir.schema.json` (plus an optional, disabled-by-default HL7 Java validator jar). **Only exercised on the opt-in structured pipeline path** — the default LLM-direct path has no schema-validation gate at all.
- **Documented here:** [ADR-014](../docs/adr/014-fail-closed-review-gate-doc2fhir.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

---

### Category 7 — Document Ingestion / OCR Pipeline

#### C46. PDF-to-image rendering (PyMuPDF/`fitz`)
- **Origin:** PyMuPDF — Python bindings for the MuPDF library.
- **Used here:** OCR pipeline's page-rendering step, at configurable DPI, before layout detection/recognition.
- **Documented here:** not documented outside code.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C47. Evidence-page grounding (deterministic bounding-box re-matching)
- **Origin:** custom to this repo — deterministic substring/geometry matching against real OCR layout blocks, built specifically because "the LLM has no way to know real character offsets or page coordinates" (per the module's own docstring).
- **Used here:** `gateway/ocr_normalizer.py::ground_evidence_span()`, called from `structured_pipeline.py::_ground_extraction_evidence()`.
- **Documented here:** [ADR-015](../docs/adr/015-evidence-page-grounding-doc2fhir.md).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C48. Schema-constrained structured extraction
- **Origin:** the OpenAI-compatible `response_format` JSON-schema-constrained decoding feature (implemented by the local llama.cpp server here, not OpenAI itself).
- **Used here:** `gateway/structured_extractor.py` — extracts into `IntermediateExtraction`/`intermediate_schema.py`, explicitly instructed "Do not produce FHIR" (`temperature=0.0`).
- **Documented here:** [ADR-004](../docs/adr/004-fhir-mapping-strategy.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C49. Document classification (doc-type routing)
- **Origin:** general text/document classification pattern.
- **Used here:** `gateway/doc_classifier.py` — the first stage of the opt-in structured pipeline.
- **Documented here:** [ADR-004](../docs/adr/004-fhir-mapping-strategy.md) (context).
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

---

### Category 8 — Reliability & Delivery Patterns

#### C50. Fail-closed review gate (human-in-the-loop hold state)
- **Origin:** general human-in-the-loop (HITL) safety-engineering pattern.
- **Used here:** `orchestrator.py` — `review_required` (confidence < 0.6) OR failed schema validation → `JobStatus.NEEDS_REVIEW`; delivery is skipped until a human calls `POST /v1/document/{job_id}/approve-and-deliver`. **Only exists on the opt-in structured pipeline path.**
- **Documented here:** [ADR-014](../docs/adr/014-fail-closed-review-gate-doc2fhir.md).
- **Depth / Priority:** Learn · Must know
- **External resources:** _pending research pass_

#### C51. Dead-letter queue pattern
- **Origin:** classic messaging/delivery resilience pattern (undeliverable messages routed to a separate store instead of being dropped).
- **Used here:** `gateway/adapters/hapi_fhir.py::HapiFhirDownstreamAdapter` writes undeliverable bundles to a dead-letter directory after retries are exhausted.
- **Documented here:** not documented outside code.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C52. WebSocket status streaming
- **Origin:** the WebSocket protocol standard.
- **Used here:** `GET /v1/documents/{job_id}/stream` (gateway `app.py`) — note the documented `SERVER_BUSY` failure mode where this socket doesn't close properly (a real hang bug, per `FAILURE_MODES.md`).
- **Documented here:** `ai/docs/FAILURE_MODES.md`, `ai/src/DOC2FHIR/DocOnFHIR_API_Spec.md`.
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

#### C53. Retry with exponential backoff
- **Origin:** general distributed-systems resilience pattern.
- **Used here:** multiple independent implementations — `gateway/adapters/hapi_fhir.py` (delivery retries), the default MCP protocol path (`src/agent/mcp_client.py`, 2x retry) — note the `MCP_TRANSPORT=rest` rollback path has **zero** retries, a documented asymmetry.
- **Documented here:** [ADR-012](../docs/adr/012-mcp-protocol-adoption.md) (MCP side); DOC2FHIR side undocumented outside code.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

---

### Category 9 — Infrastructure, Storage & Configuration

#### C54. SQLite as a lightweight job/run store
- **Origin:** SQLite, embedded relational database.
- **Used here:** `ai/src/DOC2FHIR/gateway/repository.py` (job records), `OCR/OCRpipelie/app/db.py` (OCR run history), `.ui_v2_history.db` (Command Center UI run history).
- **Documented here:** not documented outside code.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C55. In-process `asyncio` job queue
- **Origin:** Python's built-in `asyncio` primitives, used here as a lightweight alternative to a dedicated broker (Celery/RQ/SQS were not chosen).
- **Used here:** `gateway/job_queue.py::InMemoryJobQueue`, consumed by `app.py::_run_queue_worker`.
- **Documented here:** not recorded as its own ADR — flag as an undocumented architectural choice worth asking about.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C56. Redis as a data cache
- **Origin:** Redis / Redis Cloud, in-memory data store.
- **Used here:** per `ai/src/ai/docs/component_diagram.md`, caches patient FHIR data (port 19534); `redis==5.0.1` is a declared dependency of `ai/src/ai`.
- **Documented here:** `ai/src/ai/docs/component_diagram.md`.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C57. `git-crypt` for encrypted config files
- **Origin:** `git-crypt` — transparent file encryption for git repositories.
- **Used here:** `ai/src/DOC2FHIR/Mapper/config/llama-server.env` is git-crypt-encrypted (unreadable as plaintext without the key); `.env.example` documents the same settings unencrypted.
- **Documented here:** observable from the file itself, not separately documented.
- **Depth / Priority:** Understand · Should know
- **External resources:** _pending research pass_

#### C58. Environment-variable-driven backend switching
- **Origin:** general twelve-factor-app configuration pattern.
- **Used here:** `ai/src/ai/src/shared/config.py::InfraConfig` — a single `llm_backend` setting (`local`|`lightning`) switches base URL/model/API key everywhere, no silent fallback either direction.
- **Documented here:** [ADR-008](../docs/adr/008-local-model-serving-clinical-ai.md).
- **Depth / Priority:** Understand · Must know
- **External resources:** _pending research pass_

---

### Category 10 — Testing & Evaluation Methodology

#### C59. RAG evaluation triad (faithfulness / answer relevancy / context precision)
- **Origin:** the "RAG triad" evaluation concept popularized by the **Ragas** library.
- **Used here:** `ai/src/ai/scripts/evaluate_rag_triad.py` — note this script imports `ragas`, `datasets`, and `openai`, **none of which are declared** in either `requirements.txt` (a fresh clone cannot run it without manually installing them); the in-code comment "GPT-5 mini Judge" is stale — it actually defaults to Groq's `llama-3.3-70b-versatile`.
- **Documented here:** not documented outside code.
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C60. LLM-as-judge evaluation
- **Origin:** general "LLM-as-judge" evaluation methodology (using a separate LLM call to score another model's output).
- **Used here:** `evaluate_rag_triad.py`'s `JUDGE_API_KEY`/`JUDGE_BASE_URL`/`JUDGE_MODEL` env vars, falling back to `GROQ_API_KEY`.
- **Documented here:** not documented outside code.
- **Depth / Priority:** Understand · Learn later
- **External resources:** _pending research pass_

#### C61. Retrieval recall evaluation against ground truth
- **Origin:** standard information-retrieval recall@k evaluation methodology.
- **Used here:** `scripts/evaluate_retrieval_recall.py` against `Data/retrieval_ground_truth.json` / `retrieval_ground_truth_gamma.json`.
- **Documented here:** not documented outside code.
- **Depth / Priority:** Practice · Should know
- **External resources:** _pending research pass_

#### C62. Standalone script-based testing (no pytest/CI)
- **Origin:** this repo's own convention, not an external library or technique — flagged so the intern doesn't go looking for a pytest suite that doesn't exist.
- **Used here:** 30+ `scripts/test_*.py` files with hand-rolled PASS/FAIL counters, orchestrated by `scripts/run_all_tests.sh` (groups A–H) for `ai/src/ai`; `scripts/smoke_gateway.sh` (FastAPI `TestClient`, monkeypatched orchestrator) for DOC2FHIR. **Known issue:** `run_all_tests.sh` hardcodes `PROJECT_ROOT=/home/belal/AI_System`, so it won't run out-of-the-box on a fresh clone at a different path — a real capstone candidate (see Section E).
- **Documented here:** not documented outside the scripts themselves.
- **Depth / Priority:** Practice · Must know
- **External resources:** _n/a — this is a project convention, not an external concept to research_

---

## D. 1–2 Week Roadmap

Assumes ~5 working days/week, ~6 productive hours/day. Concept IDs refer to Section C.

| Day | Focus | Concepts | Repo Material | Practical Work | Expected Outcome |
|---|---|---|---|---|---|
| **1** | System orientation | C1, C6, C23, C40, C42 | `ai/README.md`, `ai/docs/ARCHITECTURE.md`, `ai/docs/SYSTEM_OVERVIEW.md`, `ai/docs/adr/README.md` | Start both subsystems locally (`ai/src/ai/launch.sh --local`, `ai/src/DOC2FHIR/scripts/run.sh`); hit every health endpoint; diagram every running service and port. | Both systems running; can name every service, port, and one-line purpose unprompted. **(~6h)** |
| **2** | Clinical AI agent graph | C1–C3, C13, C21, C22 | `ai/src/ai/src/agent/graph/{state.py,nodes.py,workflow.py}`, `LangGraph-Agent-Workflow.mmd` | Send 3 different chat queries (patient-data, general-drug, visualization); log the actual node path taken for each. | Can trace `classify → route_intent → {rag_retrieve\|mcp_search\|visualize} → generate → audit_claims → {abstain\|compute_confidence}` and name which branch fired. **(~6h)** |
| **3** | Retrieval & verification | C7–C11, C15–C20 | `src/retrieval/service.py`, `src/agent/verification.py`, `src/agent/confidence.py`; ADR-002, 003, 009 | Run `scripts/evaluate_retrieval_recall.py`; manually trace one retrieval call's RRF fusion before/after. | Can explain why RRF is hand-rolled (C8), why `ClinicalReasoner` has no LLM import (C5), and Tier 1 vs Tier 2 verification (C19/C20). **(~6h)** |
| **4** | DOC2FHIR pipeline | C6, C25, C40–C51 | `gateway/{app.py,orchestrator.py,structured_pipeline.py,fhir_mapper.py}`; ADR-004, 014, 015 | Upload one sample document through the **default** path, then re-run with `DOC2FHIR_STRUCTURED_PIPELINE_ENABLED=true`; compare bundles. | Can explain the concrete difference (validation gate C45, review gate C50, evidence grounding C47) between the two mapping paths using the two bundles produced. **(~6h)** |
| **5** | MCP & external integrations; first tiny contribution | C31–C39 | `mcps/{main.py,router.py}`, `adapters/circuit_breaker.py`; ADR-011, 012, 013 | Trigger a general-medical query and watch it route through MCP to PubMed/OpenFDA/MedlinePlus; pick one Section E fix and open a draft PR. | First real PR opened. Can explain the MCP transport fallback (C34) and per-source circuit breakers (C35). **(~6h)** |
| **6** | Testing & evaluation | C59–C62 | `scripts/run_all_tests.sh`, sample `scripts/test_*.py`, `smoke_gateway.sh`, `Mapper/scripts/validate_fhir_output.py` | Run the standalone test scripts directly; run `verify_hapi_fhir.py` against a local HAPI instance. | Understands there's no pytest/CI (C62) and can run the relevant scripts for whichever subsystem they're changing. **(~5h)** |
| **7** | Failure modes & operational edges | C29, C50–C53 | `ai/docs/FAILURE_MODES.md` | For each documented failure mode, find the corresponding code (`SERVER_BUSY` dead-end, unscoped `/chat` fallback, Qdrant-down fallback). | Can name, for both subsystems, at least 3 real failure modes and the code path that handles (or fails to handle) each. **(~5h)** |
| **8–9** | Capstone implementation | Depends on chosen item | Section E | Implement, test, document the capstone change. | Working, tested change ready for review. **(~10–12h)** |
| **10** | Capstone review & readiness check | — | Section F | Walk a senior engineer through the change and the checklist. | Signed off as ready to work independently. **(~4h)** |

---

## E. Practical Capstone

Pick **one** (all are real gaps found during analysis, none require inventing scope):

1. **Fix `ai/src/ai/scripts/run_all_tests.sh`'s hardcoded `PROJECT_ROOT`** (relates to C62). Make it derive the project root relative to the script's own location; verify all test groups (A–H) still run and report correctly.
2. **Reconcile the HAPI FHIR port mismatch** (relates to C42). `verify_hapi_fhir.py` defaults to 8090 while the gateway's own default is 8080. Trace both, pick the correct single source of truth, fix it, and verify end-to-end.
3. **Get `ai/src/ai/scripts/evaluate_rag_triad.py` runnable end-to-end** (relates to C59, C60). Add the missing `ragas`/`datasets`/`openai` dependencies, correct the stale "GPT-5 mini Judge" comment against what the code actually defaults to, and produce one successful run against the existing `Data/` ground-truth queries.

Whichever is chosen: read the surrounding orchestration/eval code first, make the fix, run the affected system(s) locally to confirm it works, and write a PR description explaining the root cause, not just the symptom.

---

## F. Readiness Checklist

- [ ] Start both subsystems locally from a clean clone and reach every documented health endpoint.
- [ ] Trace a live chat request through the LangGraph agent and name the exact node sequence for a patient-data query, a general-medical query, and a visualization query.
- [ ] Explain, unprompted, why `ClinicalReasoner` (C5) contains no LLM/HTTP import, and what guarantee that gives.
- [ ] Explain the difference between Tier 1 and Tier 2 claim verification (C19/C20), and which one gates the response by default.
- [ ] Upload a document through both DOC2FHIR mapping paths and explain, using the two resulting bundles, why the structured path can enter `NEEDS_REVIEW` (C50) and the default path cannot.
- [ ] Explain the MCP transport fallback (C34) and when a developer would flip it.
- [ ] Name at least 3 features that exist in code but are disabled by default (C4, C12, C20-gating) without conflating them with active default behavior.
- [ ] Run the relevant standalone test/eval scripts (C62) for whichever subsystem they're modifying, and interpret PASS/FAIL output correctly.
- [ ] Have landed at least one real, reviewed change (the capstone).

---

## G. Knowledge Gaps / Risks

- **Subsystem relationship is a documented hypothesis, not a confirmed fact.** `ai/docs/ARCHITECTURE.md` only infers a DOC2FHIR → HAPI FHIR → Clinical AI pipeline from both defaulting to the same HAPI FHIR port (C42). Confirm with a senior engineer.
- **Advanced RAG features are shipped but dormant.** C4 (ReAct loop), C12 (graded evaluator), and C20's gating are real, implemented, and off by default. Don't treat docs/diagrams describing them as current default behavior.
- **Groq model name discrepancy (C30).** Code (`mcps/router.py`) uses `llama-3.3-70b-versatile`; `component_diagram.md` separately references `llama-3.1-8b-instant`. Needs a senior engineer to confirm which is authoritative, or whether both exist for different call sites.
- **Possible real credential in a `.env.example` file.** `ai/src/ai/mcps/.env.example` appears to contain a real, non-placeholder-looking Groq API key, unlike its sibling `.env.example`. A senior engineer should verify and, if real, rotate it — this is not an intern task.
- **Orphaned/dead code exists and can mislead a newcomer:** `ai/src/DOC2FHIR/gateway/unified_ui.py` (a third, unwired UI implementation, not referenced anywhere else in the repo), `ai/src/ai/src/MCPs/remote_client.py` (looks duplicate of `src/agent/mcp_client.py`), and `ai/src/ai/prompts/ddx_prompts.py` (unused by the live graph — `ClinicalReasoner` is called directly instead). Confirm with the team whether these are safe to remove.
- **No pytest/CI exists for either subsystem** (C62); testing is standalone scripts, one of which hardcodes a machine-specific path. Not an intern-scope fix without team buy-in on the broader testing strategy.
- **The DOC2FHIR README's own lifecycle diagram omits a real, reachable state** (`NEEDS_REVIEW`, C6/C50).
- **No authentication on several internal endpoints** (`/v1/internal/callback`, parts of `ui_v2.py`) — candidly documented in the repo's own docs as a known gap; needs a security/architecture conversation, not a unilateral intern fix.
- **`Mapper/config/llama-server.env` is git-crypt encrypted (C57)** — the intern needs access provisioned by a team member to read real runtime Mapper config.
