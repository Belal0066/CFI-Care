# Agentic RAG System – Technical Design Document

---

# 1. Executive Summary

## 1.1 Problem Statement

The existing clinical Q&A system suffers from the following limitations:

* **Vanilla RAG fails on multi-hop reasoning** — A query like "Did the medication change after the allergic reaction?" requires linking events across multiple FHIR resources; naive vector search retrieves chunks in isolation.
* **Information exists across FHIR resource silos** — Diagnoses, medications, allergies, and encounters are stored as separate FHIR resources. Answering a single clinical question requires joining information across these silos.
* **Responses lack grounding and citations** — LLM-only answers hallucinate clinical facts that cannot be traced back to source documents.
* **No intent-aware retrieval** — A query about "medications" and a query about "diagnosis" retrieve from the same index, returning irrelevant chunks.
* **Context windows are insufficient** — Large patient timelines (10+ encounters) exceed LLM context limits when dumped as raw FHIR JSON.

## 1.2 System Objective

Build an autonomous clinical agent capable of answering clinician questions by retrieving, validating, and synthesizing information from FHIR-derived vector stores, deterministic clinical reasoning, and external MCP drug safety databases — with every claim grounded in source document node IDs.

## 1.3 Success Metrics (KPIs)

| Metric | Target | Current (10-doc scale) |
|---|---|---|---|
| Faithfulness | >0.95 | 1.000 |
| Groundedness (Hallucination Rate) | <0.05 | 0.000 |
| Latency P95 (deterministic pipeline) | <12000ms | <1ms |
| Recall@3 (Hybrid) | >0.90 | 0.512* |
| Recall@10 (Hybrid) | >0.95 | 0.688* |
| Precision (Hybrid) | >0.70 | 0.875 |

_* Data-limited — 10-doc corpus insufficient for meaningful Recall@K differentiation. Hybrid backend outperforms ContextRetriever (R@3=0.512 vs 0.408, Precision=0.875 vs 0.750)._

---

# 2. Core Architecture

---

# 2.1 Routing & Reasoning Engine

## LLM Configuration

| Role | Model | Backend |
|---|---|---|
| Primary | `google/medgemma-27b-it` | Lightning AI (remote) |
| Backup | `medgemma-1.5-4b-it-Q6_K.gguf` | llama.cpp (local, `localhost:8000`) |
| Embedding | `BAAI/bge-base-en-v1.5` (dense, 768d) | FastEmbed (CPU) |
| Sparse Embedding | `prithivida/Splade_PP_en_v1` | FastEmbed (CPU) |

---

## Agent Architecture

**Type:** Single Agent — LangGraph `StateGraph`

```
User Query
    │
    ▼
┌──────────────┐
│   classify   │  IntentClassifier (regex, deterministic)
│   _intent    │  → (intent, confidence)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  route_intent │  4-way conditional
│  (conditional)│
└──────┬───────┘
       │
   ┌───┴───┬───────────┬───────────┐
   │       │           │           │
   ▼       ▼           ▼           ▼
 rag_   mcp_       generate    generate
retrieve search    (chat mode) (error)
   │       │
   ▼       │
 reason <──┘
   │
   ▼
 generate
 (LLM synthesis)
   │
   ▼
┌──────────────┐
│  audit_claims│  ClaimAuditor validates source_node_ids
└──────┬───────┘  exist in retrieved_docs
       │
       ▼
┌──────────────┐
│route_after   │  pass → END
│ _audit       │  fail + retry < 2 → retry_generate
│(conditional) │  fail + retry >= 2 → END (with errors)
└──────────────┘
```

## Prompting Strategy

**Framework:** Deterministic template-based (no ReAct/ToT/Reflection)

The system uses **zero LLM calls for core data operations**:
- Preprocessing → rule-based (`ClinicalPreprocessor`)
- Intent classification → regex pattern matching (`IntentClassifier`)
- Context retrieval → intent-specific filtering (`RetrievalStrategy`)
- Clinical reasoning → document-grounded template filling (`ClinicalReasoner`)

The LLM is used only for **final response generation**, where it synthesizes the structured `ClinicalResponse` into natural language with citations.

### System Prompt Version

Stored inline in `generate_response()` in `src/agent/graph/nodes.py`. Three prompt variants:

| Mode | Prompt Style | Temperature |
|---|---|---|
| Chat | Direct conversation with patient context | 0.7 |
| Local RAG | Synthesize `clinical_response` into answer with citations | 0.1 |
| MCP | Safety-policy-guided generation with evidence sources | 0.1 |

**Retry variant:** On audit retry, `inject_audit_feedback` replaces the system prompt with a corrective version listing specific citation errors and instructing the LLM to fix them.

---

# 2.2 Retrieval Layer

---

## 2.2.1 Vector Search Fundamentals

### Vector Database

| Property | Value |
|---|---|
| Technology | **Qdrant** (v1.7.0+) |
| Collection | `clinical_embeddings` |
| Connection | `localhost:6333` (REST API) |
| Replication | None (single node, single host) |
| Sharding | None (single shard, 10 documents) |

### Data Model

```
Collection: clinical_embeddings
  └── Point
        ├── id: UUID (v4)
        ├── vector: {
        │     "text-dense":  [float; 768d]   # COSINE distance
        │     "text-sparse": SparseVector     # SPLADE indices+values
        │   }
        └── payload: {
              "id": str,
              "patient_id": str,
              "resource_type": str,
              "toon_content": str,
              "fhir_raw": dict,
              "chunk_index": int,           # 0 for whole docs, >0 for chunked
              "parent_node_id": str,         # Original node ID (not Qdrant UUID)
              "is_diagnosis": bool,          # Intent filter flags
              "is_medication": bool,
              "is_allergy": bool,
              "is_symptom": bool,
              "is_outcome": bool
            }
```

### Boolean Filter Flags (Phase 2)

Each Qdrant point carries 5 boolean flags in its payload for server-side intent filtering:

| Flag | Intent Targets | Set When |
|------|---------------|----------|
| `is_diagnosis` | `diagnosis`, `differential` | `event_tag == "Diagnosis"` |
| `is_medication` | `medication` | `event_tag == "Medication"` |
| `is_allergy` | `allergy` | `event_tag == "Allergy"` |
| `is_symptom` | `change_tracking`, `trend_analysis` | `event_tag == "Symptom"` |
| `is_outcome` | `outcome` | `event_tag == "Outcome"` |

The `_build_intent_filter()` method in `src/retrieval/service.py` converts intent → Qdrant `FieldCondition`:
```python
filters = {
    "diagnosis":  FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
    "medication": FieldCondition(key="is_medication", match=MatchValue(value=True)),
    "allergy":    FieldCondition(key="is_allergy", match=MatchValue(value=True)),
    ...
}
```
Filter `None` is passed when intent is `"unknown"`, returning unfiltered results.

### Embedding Model

| Property | Value |
|---|---|
| Dense Model | `BAAI/bge-base-en-v1.5` |
| Dimension | 768 |
| Distance Metric | **Cosine** |
| Sparse Model | `prithivida/Splade_PP_en_v1` |

**Reason for Selection:**
- `bge-base-en-v1.5` achieved highest Recall@3 (0.661) and MRR (0.917) in embedding benchmark
- Outperformed `bge-small-en-v1.5` (R@3=0.592) and `all-MiniLM-L6-v2` (R@3=0.564)
- SPLADE provides complementary sparse retrieval for exact term matching

### Chunking Strategy (Phase 1)

| Property | Value |
|---|---|
| Chunk Method | **Sentence-boundary-aware sliding window** with word-boundary fallback |
| Chunk Size | 400 tokens (≈1600 chars) |
| Overlap | 50 tokens (≈200 chars) |
| Token Estimator | Simple heuristic: `len(text) // 4` |
| Sentence Boundary | Regex split on `(?<=[.!?])\s+` |
| Word Fallback | Token-aligned word split when sentence splitting yields single segment |
| Short Document | Documents < chunk_size stored as single chunk |

**Rationale:** BERT-based embedding models (bge-base-en-v1.5) have a 512-token limit. Long clinical notes were being silently truncated. Sentence-boundary chunking preserves natural clinical phrases while the overlap ensures continuity across windows. Each chunk inherits the full parent document metadata.

**Implementation:** `DocumentChunker` in `src/retrieval/indexing.py`:
```python
chunks = DocumentChunker.chunk_document(doc, chunk_size=400, overlap=50)
```

**Ingestion Integration:** Integrated into both ingestion paths in `src/ingestion/service.py`. Documents exceeding the chunk size are split before embedding. Each chunk becomes a separate Qdrant point with `chunk_index` and `parent_node_id` in payload.

**Metadata Enrichment:** Boolean flags: `is_diagnosis`, `is_allergy`, `is_medication`, `is_symptom`, `is_outcome` — propagated to each chunk.

---

## 2.2.2 Indexing & Performance

### ANN Index

| Property | Value |
|---|---|
| Algorithm | **HNSW** (Qdrant default) |
| M | 16 (default) |
| ef_construct | 100 (default) |
| ef_search | 128 (default) |

### Filtering Strategy (Phase 2)

Filters are applied at **two levels**:

**1. Qdrant Payload Filters (primary path — `HybridRetriever`)**

Server-side `FieldCondition` filters on boolean flags in the Qdrant payload, reducing the search space before embedding similarity scoring:

| Filter | Applied For | Qdrant `FieldCondition` |
|---|---|---|
| Diagnosis | `diagnosis`, `differential` | `is_diagnosis == true` |
| Medication | `medication` | `is_medication == true` |
| Allergy | `allergy` | `is_allergy == true` |
| Symptom | `change_tracking`, `trend_analysis` | `is_symptom == true` |
| Outcome | `outcome` | `is_outcome == true` |
| None | `unknown`, `summary` | No filter (all documents) |

**2. Client-Side Filters (fallback path — `ContextRetriever`)**

Applied via `RetrievalStrategy` in-memory when Qdrant is unavailable or when `HybridRetriever` returns insufficient results:

| Filter | Applied For | Implementation |
|---|---|---|
| Diagnosis | `diagnosis`, `differential` | `is_diagnosis == true` |
| Medication | `medication` | `is_medication + is_diagnosis + is_allergy` |
| Allergy | `allergy` | `is_allergy == true` |
| Temporal | `change_tracking`, `timeline`, `trend_analysis` | `date_unix` range |
| Multi-filter | `differential`, `rationale` | Compound filter builder |

### Multi-Tenant Isolation

Not applicable. Single-tenant system (single EOC/patient).

---

## 2.2.3 Hybrid Search

### Dense Retrieval

| Property | Value |
|---|---|
| Model | `BAAI/bge-base-en-v1.5` (768d, COSINE) |
| Top-K | `prefetch_multiplier × limit` (default: 2 × 10 = 20) |

### Sparse Retrieval

| Property | Value |
|---|---|
| Technology | **SPLADE** (`prithivida/Splade_PP_en_v1`) |
| Top-K | `prefetch_multiplier × limit` (default: 2 × 10 = 20) |

### Fusion Strategy

| Property | Value |
|---|---|
| Method | **RRF** (Reciprocal Rank Fusion) — manual implementation |
| Rank Constant (k) | 60 |
| Score Threshold | None (disabled) |

Implementation (`_reciprocal_rank_fusion` in `src/retrieval/service.py`):

```
scores[doc_id] += 1.0 / (k + rank + 1)    # for each result set
sorted by scores descending
```

**Fallback:** If sparse search fails, dense-only results filtered by `dense_score_threshold >= 0.60`.

### Intent Filter Support (Phase 2)

`HybridRetriever.search()` accepts an optional `intent` parameter:

```python
results = retriever.search(
    patient_id="eoc-xxx",
    query="What medications?",
    limit=10,
    intent="medication"       # → adds FieldCondition(is_medication=true)
)
```

When `intent` is provided, `_build_intent_filter()` constructs a Qdrant `Filter` with the appropriate `FieldCondition`. The filter is applied during both dense and sparse prefetch queries, so only points matching the intent flag are scored.

### Query Routing

```
Clinical Query
    │
    ├── Intent = {summary, diagnosis, medication, ...}
    │   └── Hybrid search (dense + sparse RRF + intent filter)
    │
    ├── Intent = unknown, patient data available
    │   └── Hybrid search (no filter) → ContextRetriever (in-memory)
    │
    └── No local patient data
        └── MCP search (external PubMed/OpenFDA)
```

---

## 2.2.4 Reranking Layer

**Not implemented.** RRF fusion serves as the combined retrieval + ranking step. At the current 10-doc scale, RRF provides sufficient precision (0.75) without an external reranker.

---

## 2.2.5 Optimization & Scale

### Quantization

| Property | Value |
|---|---|
| Enabled | **No** |
| Rationale | 10-doc scale; quantization not needed |

---

### Data Ingestion Pipeline

```
FHIR JSON / Custom Node List
    │
    ▼
ClinicalPreprocessor.preprocess_timeline()
    │  → NormalizedNode[] (enriched, sorted, graph-linked)
    ▼
PatientStateCompiler.compile_state()
    │  → PatientState (immutable snapshot)
    ▼
DocumentBuilder.build_document_collection()
    │  → ClinicalDocument[]
    ▼
DocumentChunker.chunk_document()
    │  → DocumentChunk[] (sentence-boundary sliding windows, 400t/50t overlap)
    │  Single chunk if doc < 400 tokens
    ▼
IngestionService.ingest_resource()
    │  → ToonNormalizer (FHIR → TOON text, 30-50% token reduction)
    │  → FastEmbed.get_embedding() (dense, 768d)
    │  → FastEmbed.get_sparse_embedding() (SPLADE)
    ▼
Qdrant.upsert_point()  (per chunk)
    │  → hybrid point: text-dense + text-sparse
    │  → payload includes chunk_index, parent_node_id, boolean flags
    ▼
Payload: {id, patient_id, resource_type, toon_content, fhir_raw,
          chunk_index, parent_node_id, is_diagnosis, is_medication,
          is_allergy, is_symptom, is_outcome}
```

### Ingestion Metrics

| Metric | Value |
|---|---|
| Documents ingested | 10 |
| Embedding Throughput | ~50ms per doc (CPU) |
| Indexing Latency | ~500ms per point (incl. network) |
| Failed Documents | 0 |

---

# 2.3 Tool Layer

---

## Tool Inventory

### Vector Search (Qdrant Hybrid)

| Property | Value |
|---|---|
| Technology | **Qdrant** (REST API, `localhost:6333`) |
| Collection | `clinical_embeddings` |
| Search Type | Hybrid (dense + sparse via RRF) |
| Returned Fields | `id`, `patient_id`, `resource_type`, `toon_content` |

### MCP Server (External Clinical Knowledge)

| Property | Value |
|---|---|
| Provider | **FastMCP** over SSE (Tailscale tunnel) |
| Purpose | Drug safety queries: contraindications, interactions, side effects |
| Endpoint | Configurable via `mcp_base_url` |
| Permissions | Read-only; no write operations |
| Safety Policies | Per-question-type forbidden output rules |

### LLM Backend

| Property | Local | Lightning AI |
|---|---|---|
| Endpoint | `http://localhost:8000` | Configurable HTTPS |
| Model | `medgemma-1.5-4b-it-Q6_K.gguf` | `google/medgemma-27b-it` |
| API Compat | OpenAI-compatible (`/v1/chat/completions`) | OpenAI-compatible |
| Auth | None | Access token (configurable) |

---

# 2.4 Memory & State Management

---

## Episodic Memory (ClinicalAgentState)

All state is ephemeral, scoped to a single query execution:

| Field | Type | Source |
|---|---|---|
| `messages` | `List[BaseMessage]` | User input (single turn) |
| `patient_id` | `Optional[str]` | API call parameter |
| `patient_state` | `Optional[Dict]` | `PatientStateCompiler` |
| `documents` | `Optional[List]` | Pre-loaded per patient |
| `intent` | `str` | `IntentClassifier` output |
| `intent_confidence` | `float` | `IntentClassifier` output |
| `rewritten_query` | `Optional[str]` | `QueryRewriter` output |
| `query_normalized` | `Optional[str]` | Lowercased query string |
| `retrieved_docs` | `List[Dict]` | `HybridRetriever` / `ContextRetriever` |
| `clinical_response` | `Optional[Dict]` | `ClinicalReasoner` output |
| `mode` | `str` | `"auto"` / `"local"` / `"mcp"` / `"chat"` |
| `audit_passed` | `bool` | `ClaimAuditor` result |
| `audit_failures` | `List[str]` | Failed citation IDs |
| `audit_retry_count` | `int` | Number of retry attempts (max 2) |

## Semantic Memory

**Not implemented.** The system processes each query independently with no cross-query memory, user preferences, or historical corrections.

---

## State Schema

```python
class ClinicalAgentState(TypedDict):
    messages: List[BaseMessage]
    patient_id: Optional[str]
    patient_state: Optional[Dict[str, Any]]
    documents: Optional[List[Any]]
    intent: str
    intent_confidence: float
    rewritten_query: Optional[str]
    query_normalized: Optional[str]
    retrieved_docs: List[Dict[str, Any]]
    internet_evidence: List[Dict[str, Any]]
    clinical_response: Optional[Dict[str, Any]]
    needs_drug_check: bool
    mode: str
    needs_guidelines: bool
    is_mcp_query: bool
    audit_passed: bool
    audit_failures: List[str]
    audit_retry_count: int
```

---

# 2.5 Planning & Control Flow

---

## Intent Routing

Routing is deterministic, not planned. The `route_intent` function executes a single conditional:

```
mode = "chat"       → generate (direct LLM chat)
mode = "local"      → rag_retrieve (always local RAG)
mode = "mcp"        → mcp_search (always external)
mode = "auto":
    is_mcp_query    → mcp_search
    no documents    → mcp_search
    confidence < 0.15 → rag_retrieve (low-confidence fallback)
    intent ∈ RAG_SET → rag_retrieve
    otherwise        → mcp_search
```

**RAG-supported intents:** `summary`, `diagnosis`, `differential`, `medication`, `change_tracking`, `trend_analysis`, `timeline`, `outcome`, `rationale`, `allergy`.

## Loop Controls

| Property | Value |
|---|---|
| `max_iterations` | 1 (single pass) + up to 2 audit retries |
| `max_tool_calls` | 1 (either RAG or MCP, not both) |
| `max_execution_time` | 30s |
| `max_audit_retries` | 2 |

---

## Fallback Logic

| Failure Mode | Fallback |
|---|---|
| Qdrant connection failed | `ContextRetriever` in-memory retrieval |
| Sparse search failed | Dense-only with score threshold |
| MCP endpoint unreachable | Return partial answer from local data |
| LLM generation failed | Return structured `ClinicalResponse` as plain text |
| No retrieved documents | Return `"Insufficient data"` with available patient metadata |

---

# 2.6 Reflection & Self-Correction

## ClaimAuditor Self-Correction Loop (Phase 2)

The core deterministic pipeline (classification → retrieval → reasoning) operates without reflection. However, the **LLM generation step** can introduce citation errors (hallucinated `source_node_ids`). Phase 2 added a **self-correction loop** around the LLM generation:

```
generate → audit_claims → route_after_audit
    ↑                          │
    └────── retry (max 2) ─────┘
```

### Audit Node (`audit_claims`)

Validates every `source_node_id` in the generated `clinical_response.claims[]` exists in `retrieved_docs`:

| Condition | Result |
|---|---|
| All IDs valid → `audit_passed=True` | Route to END |
| Any invalid ID → `audit_passed=False` | Increment `audit_retry_count`, log `audit_failures` |

### Feedback Injection (`inject_audit_feedback`)

On retry, the system prompt is replaced with a corrective version:
- Lists specific citation errors (e.g., `"node_id 'enc-xxx' not found in retrieved documents"`)
- Instructs the LLM to only cite from the provided `retrieved_docs` list
- Preserves the original query and clinical context

### Retry Limit

| Retry | Action |
|---|---|
| 0 (first) | Generate → audit → if fail, retry with feedback |
| 1 | Re-generate → audit → if fail, retry with feedback |
| 2 (max) | Re-generate → audit → if fail, **terminate with errors** (do not retry) |

**Design rationale:** The ClaimAuditor loop is intentionally limited to 2 retries to maintain deterministic guarantees. Unlike reflection-based agents that can loop indefinitely, this system bails out after 2 failed attempts, returning the best-effort response with the audit failure metadata attached. No query rewriting or retrieval improvement loops are attempted — the failure is surfaced rather than silently "fixed" by non-deterministic means.

### ClaimAuditor Implementation

The auditor (`src/agent/auditor.py`) performs **differential diagnosis claim validation**:

```python
auditor = ClaimAuditor()
errors = auditor.audit_differential_diagnoses(
    claims=response.claims,
    retrieved_docs=retrieved_docs,
)
```

Each claim must satisfy:
1. All `source_node_ids` exist in the retrieved document set
2. `evidence_overlap` consistency check (optional, configurable)

---

# 2.7 Context Engineering

---

## Context Budget

| Component | Budget |
|---|---|
| LLM Instructions | ~200 tokens (system prompt) |
| Retrieved Documents | `agent_max_docs` × average doc length (default 15 docs, ~300 tokens each ≈ 4500 tokens) |
| Clinical Response | `ClinicalResponse` structured output (~500 tokens) |
| Total Context | ~5200 tokens (well within 8K MedGemma window) |

---

## Context Assembly

| Strategy | Implementation |
|---|---|
| Ranking | RRF score descending (HybridRetriever) or intent-priority (ContextRetriever) |
| Deduplication | By `doc_id` / `node_id` during RRF fusion |
| Compression | TOON-normalized text (30-50% shorter than raw FHIR JSON) |
| Lost-in-the-Middle Mitigation | Not needed — context fits within LLM window |

**Intent-specific assembly** (via `RetrievalStrategy`):
- `summary` → all documents, chronological order
- `diagnosis` → only `is_diagnosis=true` documents
- `differential` → diagnosis + symptoms + investigations + medications
- `medication` → medications + diagnoses + allergies
- `change_tracking` → symptoms + outcomes + diagnoses, ordered by date

---

# 3. Data Flow & Sequence Diagram

```
User: "What medications has the patient been prescribed for pneumonia?"

Step 1: Intent Analysis
──────────────────────
IntentClassifier.classify(query)
  → pattern match "medication" + "pneumonia"
  → (QueryIntent.MEDICATION, confidence=0.87)

Step 2: Intent Routing
─────────────────────
route_intent(state)
  mode=auto, intent=medication ∈ RAG_SET
  → route to rag_retrieve

Step 3: Hybrid Retrieval
────────────────────────
HybridRetriever.search(patient_id, query)
  │
  ├── dense_embed = FastEmbed("query", model="bge-base-en-v1.5")
  ├── sparse_embed = FastEmbed("query", model="Splade_PP_en_v1")
  │
  ├── qdrant.search(vector_name="text-dense", vector=dense_embed, limit=20)
  ├── qdrant.search(vector_name="text-sparse", vector=sparse_embed, limit=20)
  │
  └── RRF(dense_results, sparse_results, k=60)
      → 10 merged results, score-descending

  [Fallback if Qdrant fails]
  ContextRetriever.retrieve(query_context)
    → RetrievalStrategy.retrieve_for_medication()
    → filter: is_medication=true + is_diagnosis + is_allergy

Step 4: Deterministic Reasoning
────────────────────────────────
ClinicalReasoner(retrieval_context).reason()
  → reason_for_medication()
  → For each medication document:
      - Extract drug name, dosage, start date
      - Link to associated diagnosis
      - Check for allergy interactions
  → ClinicalResponse with CitedClaim[]:
      Claim: "Prescribed Azithromycin 500mg"
        Source: Medication – Azithromycin (2026-01-15)
      Claim: "For Mycoplasma Pneumonia"
        Source: Diagnosis – Mycoplasma Pneumonia (2026-01-10)

Step 5: Response Generation
───────────────────────────
LLM synthesize(ClinicalResponse)
  → "The patient has been prescribed Azithromycin 500mg
     since January 15, 2026 for Mycoplasma Pneumonia.
     No known drug allergies were identified.
     Source: Medication Record (2026-01-15)"

Step 6: Delivery
────────────────
Return AIMessage with response text + metadata
```

---

# 4. Security & Trust Model

---

## Authentication

| Component | Method |
|---|---|
| LLM Backend (llama.cpp) | None (localhost-only) |
| LLM Backend (Lightning AI) | Access token (configurable, `lightning_access_token`) |
| Qdrant | None (localhost-only) |
| MCP Server | Tailscale tunnel authentication |
| API Layer | None (development only) |

## Authorization

**Not implemented.** Single-tenant system; no role-based access control or document-level permissions.

## Prompt Injection Protection

| Layer | Protection |
|---|---|
| Intent Classification | Regex patterns are strict; unknown intents route to MCP |
| Tool Isolation | MCP queries have per-type forbidden output rules enforced in system prompt |
| LLM Generation | System prompt constrains LLM to operate only over retrieved context |

## Data Leakage Prevention

| Concern | Mitigation |
|---|---|
| PII in FHIR data | All data is synthetic/canned; no production PII |
| LLM data leakage | LLM only receives `toon_content` (de-identified clinical text) |
| Output scanning | Not implemented (research prototype) |

---

# 5. Observability & Monitoring

---

## Tracing

| Property | Value |
|---|---|
| Framework | **Python logging** (`logging.getLogger`) |
| Trace granularity | Per-node function entry/exit + key metadata |

## Agent Metrics

| Metric | Measurement Method |
|---|---|---|
| Tool Calls per Query | `len(retrieved_docs)` + MCP call count |
| Loop Count | 1 (deterministic) + up to 2 audit retries |
| Success Rate | Test suite pass rate (129/129 across 4 suites) |

## Retrieval Metrics

Collected by `scripts/evaluate_retrieval_recall.py`:

| Metric | ContextRetriever | HybridRetriever |
|---|---|---|
| Recall@1 | 0.108 | 0.212 |
| Recall@3 | 0.408 | 0.512 |
| Recall@5 | 0.562 | 0.562 |
| Recall@10 | 0.875 | 0.688 |
| MRR | 0.675 | 1.000 |
| Precision | 0.750 | 0.875 |

Usage: `python scripts/evaluate_retrieval_recall.py --backend context|hybrid`

## Latency Metrics

Collected by `scripts/evaluate_latency.py`:

| Metric | Value |
|---|---|
| Mean (deterministic pipeline) | <0.5ms |
| P95 | <0.1ms |
| P99 | 1ms |
| Query Understanding (P95) | 0.04ms |
| Context Creation (P95) | 0.00ms |
| Retrieval (P95) | 0.04ms |
| Retrieval Context Build (P95) | 0.00ms |
| Reasoning (P95) | 0.05ms |

## Faithfulness Metrics

Collected by `scripts/evaluate_faithfulness.py`:

| Metric | Value |
|---|---|
| Faithfulness Score | 1.000 |
| Hallucination Rate | 0.000 |
| Supported Claims | 9/9 |
| Queries Evaluated | 4 |

---

# 6. Evaluation & Benchmarking

---

## Evaluation Dataset

| Property | Value |
|---|---|
| Dataset Size | 1 patient, 10 clinical nodes |
| Source | `Data/data.json` (canned EOC timeline) |
| Queries Used | 4 (summary, diagnosis, medication, change_tracking) |
| Golden Answers | Hand-annotated with expected claims and citations |

---

## RAG Triad

| Metric | Score | Target | Status |
|---|---|---|---|
| Faithfulness (Groundedness) | 1.000 | >0.95 | ✅ |
| Hallucination Rate | 0.000 | <0.05 | ✅ |
| Context Precision | 0.750 | >0.70 | ✅ |
| Answer Relevance | N/A | N/A | TBD |

## Retrieval Benchmarking

| Metric | Threshold | ContextRetriever | HybridRetriever | Status |
|---|---|---|---|---|
| Recall@3 | >0.90 | 0.408 | 0.512 | ❌ (data-limited) |
| Recall@10 | >0.95 | 0.875 | 0.688 | ❌ (data-limited) |
| MRR | — | 0.675 | 1.000 | Baseline |
| Precision | >0.70 | 0.750 | 0.875 | ✅ |

## Hybrid Search Benchmark

| Variant | Recall@10 | Precision |
|---|---|---|
| Dense Only | TBD | TBD |
| Sparse Only | TBD | TBD |
| Hybrid (RRF) | 0.688 | 0.875 |
| ContextRetriever (in-memory) | 0.875 | 0.750 |

_Note: In-memory ContextRetriever achieves higher recall@10 at 10-doc scale because intent-based filtering covers more ground truth; HybridRetriever achieves higher precision because embedding similarity ranks the most relevant docs first._

## Agent Evaluation

| Metric | Score |
|---|---|
| Intent Classification Accuracy | 100% (11/11 intents correctly classified) |
| Routing Accuracy | 100% (17/17 routing tests pass) |
| Audit Node Accuracy | 100% (9/9 audit tests pass) |
| Graph Invocation | 100% (8/8 graph path tests pass) |
| Deterministic Pipeline | 100% (29/29 validation tests pass) |
| Total Test Coverage | 100% (129/129 tests across 4 suites) |

---

# 7. Failure Handling & Escalation

---

## Failure Modes

| Failure | Detection | Handling |
|---|---|---|
| No Context Retrieved | Empty `retrieved_docs` | LLM returns "Insufficient clinical data to answer this question" |
| Qdrant Connection Failed | Exception in `HybridRetriever.search()` | Fallback to `ContextRetriever` (in-memory) |
| MCP Timeout | Request timeout (default 10s) | Return partial answer from local data + "External knowledge unavailable" |
| LLM Generation Failed | Exception in `generate_response()` | Return `ClinicalResponse` formatted as plain text with citations |
| Low Intent Confidence | `confidence < 0.15` | Route to RAG (patient data available) for safe default |

## Escalation Policy

| Scenario | Action |
|---|---|
| No patient data loaded | Route to MCP search |
| Ambiguous query (UNKNOWN intent + no data) | Return "Please provide a patient ID or clarify your question" |
| Contradictory sources | Deterministic reasoner will not produce contradictions by design |
| Out-of-domain query (non-clinical) | LLM instructed to decline to answer |

---

# 8. Technical Stack

---

## Orchestration

| Component | Technology | Version |
|---|---|---|
| Agent Framework | **LangGraph** (`StateGraph`) | Latest |
| State Schema | `TypedDict` | Python 3.10+ |
| Entry Point | `workflow.app` (compiled graph) | — |

## Retrieval

| Component | Technology | Version |
|---|---|---|
| Vector Database | **Qdrant** | v1.7.0+ (REST API) |
| Dense Embedding | **FastEmbed** (`bge-base-en-v1.5`) | CPU-optimized |
| Sparse Embedding | **FastEmbed** (`Splade_PP_en_v1`) | CPU-optimized |
| Fusion | **RRF** (manual implementation) | Custom |

## Reasoning

| Component | Technology |
|---|---|
| Reasoning Engine | **ClinicalReasoner** (deterministic, rule-based) |
| Claim Model | `CitedClaim` with `source_node_ids[]` |
| Response Model | `ClinicalResponse` with temporal context |

## LLM Backend

| Component | Technology |
|---|---|
| Local Inference | **llama.cpp** server (OpenAI-compatible API) |
| Remote Inference | **Lightning AI** (MedGemma 27B) |
| API Format | OpenAI `/v1/chat/completions` |

## MCP Server

| Component | Technology |
|---|---|
| Protocol | **FastMCP** over SSE (Server-Sent Events) |
| Transport | Tailscale tunnel |
| Tools | Drug safety queries (contraindications, interactions, side effects) |

## Evaluation

| Component | Technology |
|---|---|
| Pipeline Validation | `validate_system.py` (29 tests, 9 suites) |
| Agent Graph Tests | `test_agent_graph.py` (38 tests: routing, audit, graph) |
| Hybrid Retrieval Tests | `test_hybrid_retrieval.py` (20 Qdrant filter tests) |
| Chunker Tests | `test_chunker.py` (42 chunker unit tests) |
| Retrieval Recall | `evaluate_retrieval_recall.py` (--backend context|hybrid) |
| Faithfulness | `evaluate_faithfulness.py` (claim-text overlap) |
| Latency | `evaluate_latency.py` (per-component timing) |
| Parameter Sweep | `retrieval_sweep.py` (embedding + RRF parameters) |

---

# 9. Deployment & Scaling

---

## Environment Strategy

| Environment | Purpose | Configuration |
|---|---|---|
| Development | Local development & testing | `llm_backend=local`, llama.cpp, Qdrant Docker |
| Staging | Integration testing | `llm_backend=lightning`, remote Qdrant |
| Production | Not yet deployed | TBD |

## Current Deployment (Development)

All services run on a single host:

| Service | Port |
|---|---|
| llama.cpp (LLM) | 8000 |
| Qdrant | 6333 (REST), 6334 (gRPC) |
| HAPI FHIR | 8080 |
| FastAPI Backend | 8002 |

---

# Appendix A – Architecture Decision Records (ADR)

## ADR-001: Hybrid Search via Manual RRF

| Field | Value |
|---|---|
| **Decision** | Implement RRF manually in Python instead of using Qdrant's built-in FusionQuery API |
| **Alternatives** | Qdrant `FusionQuery` / `Prefetch`, Elasticsearch hybrid query |
| **Chosen Option** | Manual RRF with `NamedSparseVector` |
| **Reasoning** | qdrant-client v1.7.0 does not export `Prefetch`/`FusionQuery`; manual RRF is a 30-line implementation with equivalent results |
| **Tradeoffs** | Slightly more network round-trips (2 queries instead of 1 prefetch); negligible at scale |
| **Date** | 2026-06-11 |
| **Owner** | Belal |

## ADR-002: Embedding Model Selection

| Field | Value |
|---|---|
| **Decision** | Use `BAAI/bge-base-en-v1.5` as the primary dense embedding model |
| **Alternatives** | `bge-small-en-v1.5`, `all-MiniLM-L6-v2`, `ModernPubMedBERT` |
| **Chosen Option** | `bge-base-en-v1.5` (768d, COSINE) |
| **Reasoning** | Highest Recall@3 (0.661) and MRR (0.917) in benchmark; `bge-small` is valid speed tradeoff (2.5x faster, -10% recall) |
| **Tradeoffs** | Larger embedding dimension (768 vs 384) — no meaningful impact at 10-doc scale |
| **Date** | 2026-06-11 |
| **Owner** | Belal |

## ADR-003: Deterministic Single-Pass Agent (No Reflection Loop)

| Field | Value |
|---|---|
| **Decision** | Agent executes a single pass with no self-reflection, relevance judging, or query rewriting loop |
| **Alternatives** | ReAct loop, Plan-and-Solve, multi-agent reflection |
| **Chosen Option** | Single-pass deterministic pipeline |
| **Reasoning** | Clinical reasoning requires deterministic guarantees; reflection loops introduce latency and non-determinism. All operations are rule-based by design. |
| **Tradeoffs** | Cannot recover from initial retrieval failure; mitigated by in-memory fallback |
| **Date** | 2026-06-11 |
| **Owner** | Belal |

## ADR-004: Intent-Based Retrieval over Pure Vector Search

| Field | Value |
|---|---|
| **Decision** | Use intent classification to route to intent-specific retrieval strategies, with Qdrant hybrid search as primary and `ContextRetriever` as fallback |
| **Alternatives** | Pure vector search, pure keyword search, LLM-based routing |
| **Chosen Option** | Intent-first hybrid retrieval |
| **Reasoning** | At 10-doc scale, intent-based filtering (is_diagnosis=true, etc.) outperforms embedding similarity. The combined approach scales: Qdrant handles large corpora, intent-specific strategies handle precision. |
| **Tradeoffs** | Adding new intent requires new retrieval strategy implementation |
| **Date** | 2026-06-12 |
| **Owner** | Belal |

---

# Appendix B – File Map

```
src/
├── agent/                          # LangGraph agent & clinical reasoning
│   ├── __init__.py                 # Exports: ClinicalWorkflow, ClaimAuditor
│   ├── clinical_reasoning.py       # ClinicalReasoner, ClinicalResponse, CitedClaim
│   ├── graph/
│   │   ├── state.py                # ClinicalAgentState (TypedDict, 16 fields)
│   │   ├── nodes.py                # 7 nodes: classify, retrieve, reason, mcp,
│   │   │                           #   generate, audit_claims, inject_audit_feedback
│   │   └── workflow.py             # LangGraph StateGraph with audit self-correction loop
│   ├── workflow.py                 # Legacy ClinicalWorkflow (Ticket 2.2)
│   ├── llm_client.py               # OllamaClient (legacy LLM client)
│   ├── auditor.py                  # ClaimAuditor (differential diagnosis validation)
│   ├── mcp_client.py               # MCPToolManager (SSE connection)
│   └── query_rewriter.py           # Groq-based query rewriter
│
├── retrieval/                      # RAG retrieval layer
│   ├── service.py                  # HybridRetriever (Qdrant dense+sparse, RRF fusion,
│   │                               #   _build_intent_filter for payload filtering)
│   ├── query_understanding.py      # IntentClassifier (11 intents), QueryContext,
│   │                               #   QueryRewriter
│   ├── context_retrieval.py        # ContextRetriever, RetrievalStrategy (9 strategies),
│   │                               #   RetrievalContext
│   ├── indexing.py                 # ClinicalDocument, DocumentChunker, DocumentChunk,
│   │                               #   DocumentBuilder
│   ├── config.py                   # RetrieverConfig (all tunable parameters)
│   └── medgemma_rag.py             # Legacy simple RAG pipeline
│
├── ingestion/                      # Data ingestion pipeline
│   ├── preprocessor.py             # ClinicalPreprocessor, NormalizedNode
│   ├── patient_state.py            # PatientState, PatientStateCompiler
│   ├── service.py                  # IngestionService (FHIR→Qdrant;
│   │                               #   boolean flag injection, DocumentChunker integration)
│   └── toon.py                     # ToonNormalizer (FHIR→natural language, 30-50% reduction)
│
├── shared/                         # Shared infrastructure
│   ├── config.py                   # InfraConfig (singleton; URL normalization,
│   │                               #   bge-base-en-v1.5 default embedding)
│   ├── db_clients.py               # QdrantVectorClient
│   └── models.py                   # RetrievedContext, DifferentialDiagnosis, ClinicalState
│
├── api/                            # API layer
│   ├── FastAPI_Backend.py          # Full demo backend (Redis+Qdrant+MedGemma+MCP)
│   └── medgemma_rag_api.py         # Lightweight RAG API (/query, /retrieve, /health)
│
├── MCPs/
│   └── remote_client.py            # MCP→OpenAI tool calling example
│
└── ui/
    ├── dashboard.py                # Streamlit dashboard
    └── streamlit_rag_app.py        # Streamlit chat UI

scripts/                            # Test & benchmark scripts
├── validate_system.py              # 29 tests, 9 suites (deterministic pipeline)
├── test_agent_graph.py             # 38 tests (routing, audit, graph invocation)
├── test_hybrid_retrieval.py        # 20 tests (Qdrant intent filters)
├── test_chunker.py                 # 42 tests (DocumentChunker)
├── evaluate_retrieval_recall.py    # Recall@K + MRR (--backend context|hybrid)
├── evaluate_latency.py             # Component latency (P50/P95/P99)
├── evaluate_faithfulness.py        # Faithfulness + hallucination rate
├── retrieval_sweep.py              # Embedding model + RRF parameter sweep
├── seed_qdrant.py                  # Seed clinical_embeddings from Data/data.json
└── ...                             # (other test scripts)
```

---

# Appendix C – Validation Checklist

| Check | Status |
|---|---|---|
| Retrieval Benchmarked (Recall@K, MRR, Precision) | ✅ (both context & hybrid backends) |
| Retrieval Parameter Sweep (embedding models, RRF params) | ✅ |
| Faithfulness Evaluated (score > 0.95) | ✅ (1.000) |
| Hallucination Rate < 0.05 | ✅ (0.000) |
| Latency Benchmarked (P95 < 12000ms) | ✅ (<1ms) |
| Pipeline Validation Tests Pass (29/29, 9 suites) | ✅ |
| Agent Graph Tests Pass (38/38) | ✅ |
| Hybrid Retrieval Tests Pass (20/20) | ✅ |
| DocumentChunker Tests Pass (42/42) | ✅ |
| Deterministic Guarantees Verified | ✅ |
| Intent Classification Coverage (11 intents) | ✅ |
| Context Retrieval Filtering (9 intent strategies) | ✅ |
| Qdrant Payload Intent Filters | ✅ |
| ClaimAuditor Self-Correction Loop | ✅ (2 retries max) |
| DocumentChunker Integration | ✅ (400t/50t windows) |
| URL Normalization (trailing-slash, /v1 path) | ✅ |
| Clinical Reasoning Citations Grounded | ✅ |
| Non-Goals Respected (no guidelines, no cross-patient) | ✅ |
| MCP Safety Policies Enforced | ✅ |
| Lightweight API Operational | ✅ |
| Total Test Coverage | 129/129 (4 test suites) |
