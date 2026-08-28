# Clinical AI System: System Card (`eval-v1`)

This card describes the exact system that `clinical-eval-v1` measures. Every number in [EVAL.md](EVAL.md) cites the commit tagged `eval-v1`, and this card describes that commit. Paths are relative to `ai/src/ai/`.

## Definition of "deterministic"

A fixed node set and fixed edge order, no LLM-chosen tool loop on the evaluated path, and greedy decoding (temperature 0, fixed seed). Output agreement across reruns is **measured** (the repeat run in EVAL.md), not asserted. Batched inference can still change greedy outputs.

## Graph (as evaluated)

Entry point `classify`; compiled in `src/agent/graph/workflow.py`.

| Node | LLM? | What it does |
|---|---|---|
| `classify` | no | Regex intent classifier; sets `query` (the user's question, never overwritten) |
| `rag_retrieve` | no | Hybrid retrieval, top-k resources after fusion, relevance gate on dense cosine (F1) |
| `retry_retrieval` | no | One bounded retry: widens k and drops the intent filter |
| `reformulate_query` | yes | Graded evaluator "ambiguous" branch: rewrites the search text only (`retrieval_query`) |
| `handle_insufficient_evidence` | no | Graded evaluator "insufficient" branch: MCP fallback for some intents, otherwise abstain |
| `reason` | no | `ClinicalReasoner` builds cited claims from the retrieved resources |
| `mcp_search` | agent-side 0–1 (query optimizer) | MedMCP `get_medical_data` over the MCP protocol (SSE), bounded retry |
| `visualize` | yes (caption) | VizMCP chart rendering (not exercised by the eval set) |
| `generate` | yes | One synthesis call per branch (chat / local RAG / hybrid RAG+MCP / MCP) |
| `audit_claims` | no | Citation-ID check (see known limitations); up to 2 regenerations |
| `abstain` | no | Fixed decline message, `abstained=True` |
| `compute_confidence` | no | Weighted confidence block appended to the answer |

The MedMCP server (`mcps/`) runs its own LangGraph: guardrail, then LLM classification, then PubMed / OpenFDA (+RxNav) retrieval, then per-item LLM summaries. Its LLM calls go to the same served model (`LLAMACPP_API_BASE`).

## Evaluated configuration (`eval/configs/full.yaml`)

| Setting | Value |
|---|---|
| Generator | MedGemma 27B text (`google/medgemma-27b-text-it`), bf16, SGLang (pinned image in `eval/docker/.env.eval.example`) |
| Decoding | temperature 0 for every call (`LLM_TEMPERATURE_OVERRIDE`), seed 0 (`LLM_SEED`, SGLang `--random-seed 0`) |
| Dense embeddings | `BAAI/bge-base-en-v1.5` (768-d, fastembed ONNX, CPU) |
| Sparse embeddings | `prithivida/Splade_PP_en_v1` (fastembed) |
| Fusion | Manual RRF, k=60, prefetch 2× |
| Retrieval unit | One point per FHIR resource chunk; scored and grouped per resource (`parent_node_id`) |
| Top-k | 5 resources (10 on the retry) |
| Relevance gate | Max dense cosine of the top-k ≥ `RELEVANCE_GATE_THRESHOLD` (calibrated on the dev split) |
| Intent filter | Decided by retrieval study R3 (fix F7) |
| Graded evaluator, retry | On, max 1 retry |
| Reranker | None |
| NLI verifier | Off (`semantic_verification_enabled=False`) |
| ReAct loop | Off (`mcp_react_loop_enabled=False`) |
| Corpus | MIMIC-IV Clinical Database Demo on FHIR v2.1.0, 100 patients, loaded by `scripts/ingest_fhir_ndjson.py`, frozen as a Qdrant snapshot |

## Fix log

These are bugs found by a code audit before evaluation. Each was fixed before tagging `eval-v1`. "Before/after" is filled in from the retrieval study where the fix is measurable without an LLM.

| # | Bug | Fix | Before / after |
|---|---|---|---|
| F1 | Relevance thresholds calibrated for cosine similarity (0.10–0.20 per intent) were applied to RRF scores. RRF is rank-based: with k=60 each list contributes at most 1/61, so a resource scores at most 2/61 ≈ 0.033 (+≤0.05 count bonus). With SPLADE loaded, FHIR resources could never pass, and the retry only halved the threshold. With SPLADE absent, the same code silently ran on dense cosine, so behaviour depended on the environment. | The gate uses a real relevance score. Top-k resources after fusion; dense cosine is computed for **every** fused candidate, including sparse-only hits (re-scored from their stored dense vector), so the gate never depends on which list a hit came from. Sufficiency = max cosine ≥ a threshold calibrated on the dev split (ROC published). The retry widens k and drops the intent filter instead of lowering the bar. (`src/retrieval/service.py`, `src/agent/graph/nodes.py`, `src/agent/graph/workflow.py`) | R2 in `results/eval-v1/retrieval_study/metrics.json`: generator-context recall and empty-context rate, legacy vs top-5 |
| F2 | `messages` has no reducer, and `generate` replaced the list with its answer. On an audit retry, `generate` read `messages[-1]`, the *previous answer*, as the query. `reformulate_query` also overwrote the user's message. | `query` state field set once by `classify`, read by every node; `retrieval_query` holds reformulations; `generate` replaces only this turn's answer. | Unit test `test_f2_audit_retry_uses_the_question_not_the_previous_answer` |
| F3 | No seed anywhere; temperatures hard-coded per call (chat path 0.7); the `temperature_*` config fields were unused. | `_sampling()` wires the config temperatures plus `LLM_TEMPERATURE_OVERRIDE` and `LLM_SEED` into every call; the MedMCP router takes `MCP_LLM_TEMPERATURE`/`MCP_LLM_SEED`. API key read from config instead of hard-coded. | Unit test `test_f3_sampling_override_and_seed` |
| F4 | The MedMCP router silently used Groq whenever `LLAMACPP_API_BASE` was unset, so a misconfigured run would mix models. | Under `EVAL_MODE=1` the router refuses to start without the configured endpoint, and an egress guard (`src/shared/egress_guard.py`, also in the MCP image) blocks every host outside an allowlist and logs the violation. The runner aborts the run on any violation, or if any LLM response names a model other than the served one. | Unit tests in `eval/tests/test_isolation.py` |
| F5 | `scripts/evaluate_rag_triad.py` and `scripts/evaluate_agent_latency.py` (and `scripts/test_agent_graph.py`) read `retrieved_docs`, a state field replaced by `encounter_groups`, so triad contexts were always empty. | Read `encounter_groups` chunks, as the generator does. The new harness (`eval/`) supersedes the triad script. | n/a |
| F6 | No NDJSON reader. Embedding and upserts ran one chunk at a time (infeasible for 929k resources). No payload indexes (every `patient_id` filter scanned the collection). Observation/medication dates were not captured. Scripts hard-coded a collection name that differed from config. | `IngestionService.prepare_fhir_resource` is shared by single and batch paths; `ingest_fhir_batch` does batched embedding and upserts; keyword/bool payload indexes; date capture from `effectiveDateTime`, `authoredOn`, `whenHandedOver`, `recordedDate`, `onset*`, `performed*` and more; the loader resolves `medicationReference` names into `Reference.display`; every script reads the collection name from config. | Loader unit tests; index build time recorded in EVAL.md |
| F7 | On FHIR data `is_symptom`/`is_outcome` are always false and `event_tag` is the resource type, so `change_tracking`/`trend_analysis`/`differential` filters can exclude every Observation. | `INTENT_FILTER_ENABLED` switch (and `use_intent_filter` per call); set from retrieval study R3. | R3: hybrid with vs without filter |
| F8 | The MCP server mounted its SSE app with `path="/"`, so the stream was served at `/mcp/`, while the agent's MCP client (`config.mcp_server_url`) and every doc use `/mcp/sse`. Every MCP-protocol call returned 404, and MedMCP evidence silently became an error payload. | `http_app(transport="sse", path="/sse")` serves `/mcp/sse` (messages at `/mcp/messages/`). Preflight now performs a real MCP handshake and lists the tools. | Before: `GET /mcp/sse` → 404. After: handshake OK, tools `get_medical_data`, `render_clinical_viz` |
| F9 | VizMCP could not read standard FHIR. The value extractor matched narrative text ("Creatinine 1.1 mg/dL"), and its structured fallback took the *last* label seen (the category, or note text), so every MIMIC lab yielded nothing. Encounters were parsed only from R5 `actualPeriod` with a narrative label, so R4 encounters were dropped. Only the first 200 points of any type were read, which usually held no labs for a patient with thousands of chart events. Every chart request on MIMIC returned "No patient data found". | Step 0 in `extract_observation_values` reads the Observation's own top-level `code` and `valueQuantity`, with exact lab-name matching (urine creatinine is not plotted as serum). Encounters accept R4 `period` and fall back to the encounter class (Emergency / ICU / Inpatient / Observation / Short stay / Ambulatory). The node pages through all of the patient's Observation and Encounter points (cap 60k). | Before: 0 values from MIMIC creatinine/NTproBNP; `None` for every encounter. After: values and phases extracted (unit tests); per-patient point counts checked against the NDJSON in the VizMCP check |

## Known limitations (recorded, not claimed as capabilities)

- **The citation audit cannot fail on the RAG path.** `audit_claims` checks claim ids built by the deterministic reasoner against the same retrieved ids the reasoner used, and it never reads the LLM's final text. Grounding of the final answer is therefore measured externally (faithfulness judge), and dropping the audit node (ablation A5) would show no effect by construction.
- **The MedlinePlus adapter is a stub.** `mcps/adapters/medlineplus.py` makes no HTTP call; it returns a constructed search URL. No evaluated question expects MedlinePlus evidence.
- **Abstention depends on a similarity gate.** Cosine similarity under a patient filter detects "unrelated", not "the answer is absent": a question about a missing lab still retrieves the patient's other labs. Block D is expected to be a weakness.
- **Top-k retrieval cannot answer aggregate questions** (counts, averages over many observations). Reported per category; the argument for a structured FHIR query tool.
- **Shared FHIR resources are not indexed.** Medication/Location/Organization have no patient, so a patient-filtered query cannot reach them. Their gold ids are excluded from retrieval scoring (and counted), and medication names are carried into the patient's MedicationRequest/-Dispense/-Administration via `Reference.display`.
- **No reranker.** The v2 plan's reranker ablation (A6) does not apply.
- **Known failing pre-existing test:** `mcps/test_epic4_unit.py::test_conflict_detection` fails identically on the committed router. It exercises `validator_node`, which is not wired into the MedMCP graph.

## Tracing and data handling

- **Phoenix** (self-hosted, OpenInference) receives all traces during the eval.
- **LangSmith** (SaaS) is off by default. The runner refuses to enable it unless `EVAL_DATASET_LICENSE=open`. MIMIC-IV demo on FHIR is ODbL open data. **In production with real patient data, LangSmith stays off** unless it is a self-hosted enterprise deployment.
- The judge (Groq `openai/gpt-oss-120b`) receives MIMIC demo data during scoring. This is permitted only because the demo is open data; it would not be permitted for credentialed MIMIC.
