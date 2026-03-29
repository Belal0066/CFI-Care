# Agentic RAG System Architecture

## Overview

The system implements a **deterministic, bounded clinical reasoning engine** powered by a hybrid retrieval-augmented generation (RAG) pipeline. It combines vector + sparse search over FHIR-derived clinical documents with intent-driven routing and a LangGraph-based agentic workflow.

**Core design principles:**
- All preprocessing, retrieval, and claim generation is deterministic (rule-based, no LLM for core data operations)
- The reasoner operates exclusively over retrieved documents — no external knowledge, no speculation
- Every clinical claim must cite source node IDs
- Hybrid search (dense BGE + sparse SPLADE) fused via Reciprocal Rank Fusion (RRF)
- Safety policies enforce domain boundaries (e.g., drug queries cannot produce dosing instructions)

---

## System Diagram

```
User Query ──► ┌─────────────────────────────────────────────────────┐
               │  LangGraph Agent (src/agent/graph/)                 │
               │  ┌──────────┐                                       │
               │  │ classify │──► route_intent (conditional)         │
               │  └──────────┘    │                                  │
               │                  ├──► rag_retrieve ──► reason ──►   │
               │                  │     (Qdrant        (Clinical     │
               │                  │      Hybrid)       Reasoner)     │
               │                  │                        │         │
               │                  └──► mcp_search ──► generate      │
               │                        (MCP          (LLM          │
               │                         Server)       synthesis)   │
               └─────────────────────────────────────────────────────┘
                                    │         │
                    ┌───────────────┘         ▼
                    ▼               ┌────────────────────┐
          ┌─────────────────┐       │  LLM Backend       │
          │  Qdrant         │       │  ─────────────     │
          │  Vector DB      │       │  Local: llama.cpp  │
          │  (dense+sparse) │       │  Remote: Lightning │
          └─────────────────┘       │  AI MedGemma 27B  │
                    ▲               └────────────────────┘
                    │
          ┌─────────┴─────────┐
          │  IngestionService │
          │  (FHIR→TOON→Embed)│
          └───────────────────┘
```

---

## Component Architecture

### 1. LangGraph Agent Pipeline

The agent is a `StateGraph` over `ClinicalAgentState` (`src/agent/graph/state.py`):

| Field | Type | Purpose |
|---|---|---|
| `messages` | `List[BaseMessage]` | Conversation history |
| `patient_id` | `Optional[str]` | EOC identifier |
| `patient_state` | `Optional[Dict]` | Compiled patient snapshot |
| `documents` | `Optional[List]` | Reference documents |
| `intent` | `str` | Classified query intent |
| `intent_confidence` | `float` | Intent classifier confidence |
| `rewritten_query` | `Optional[str]` | Rewritten/decorated query |
| `retrieved_docs` | `List[Dict]` | Retrieved document set |
| `clinical_response` | `Optional[Dict]` | Final structured response |
| `mode` | `str` | `"auto"` / `"local"` / `"mcp"` / `"chat"` |

**Workflow graph** (`src/agent/graph/workflow.py`):

```
classify → route_intent (conditional)
            ├── mode=chat       → generate
            ├── mode=local      → rag_retrieve → reason → generate
            ├── mode=mcp        → mcp_search → generate
            └── mode=auto:
                  confidence<0.15  → rag_retrieve
                  RAG intents      → rag_retrieve
                  otherwise        → mcp_search
```

**Node functions** (`src/agent/graph/nodes.py`):

| Node | Function | Responsibility |
|---|---|---|
| `classify` | `classify_intent()` | Regex-based `IntentClassifier` → `(intent, confidence)` |
| `rag_retrieve` | `retrieve_patient_context()` | `HybridRetriever.search()` → fallback `ContextRetriever` |
| `reason` | `run_deterministic_reasoning()` | `ClinicalReasoner.reason()` → `ClinicalResponse` |
| `mcp_search` | `query_mcp()` | Safety-policy-guided MCP query → evidence |
| `generate` | `generate_response()` | LLM synthesis of response from context/evidence |

### 2. Retrieval Layer

#### HybridRetriever (`src/retrieval/service.py`)

```
search(patient_id, query) → List[RetrievedContext]
```

Algorithm:
1. Generate dense embedding via `FastEmbed(bge-base-en-v1.5)` (768-dim)
2. Generate sparse embedding via `FastEmbed(Splade_PP_en_v1)` (SPLADE indices/values)
3. Query Qdrant with both named vectors (`text-dense`, `text-sparse`)
4. Fuse by **Reciprocal Rank Fusion**:
   ```
   score(d) = Σ 1/(k + rank_i(d))
   ```
   where k = 60 (configurable), ranks from dense and sparse result sets
5. Fallback: dense-only with score threshold if sparse unavailable
6. Returns `RetrievedContext[]` with `anchor_id`, `anchor_content`, `score`

#### ContextRetriever (`src/retrieval/context_retrieval.py`)

In-memory fallback with intent-specific retrieval strategies:

| Intent | Strategy |
|---|---|
| `summary` | All nodes, chronological |
| `diagnosis` | `is_diagnosis=true` only |
| `differential` | Diagnosis + supporting evidence (symptoms, investigations, meds, allergies) |
| `medication` | Meds + diagnoses + allergies |
| `change_tracking` | Symptoms + outcomes + diagnoses |
| `trend_analysis` | Interventions + outcomes + diagnoses |
| `rationale` | Diagnosis + meds + allergies |
| `timeline` | All chronological |
| `outcome` | Recent outcomes + final diagnosis + last medication |

#### RetrieverConfig (`src/retrieval/config.py`)

| Parameter | Default | Purpose |
|---|---|---|
| `dense_vector_name` | `text-dense` | Qdrant dense vector name |
| `sparse_vector_name` | `text-sparse` | Qdrant sparse vector name |
| `prefetch_multiplier` | 2 | Prefetch multiplier for RRF |
| `rrf_rank_constant` | 60 | RRF k parameter |
| `dense_score_threshold` | 0.60 | Dense-only fallback threshold |
| `fusion_score_threshold` | None | Min RRF score to include result |
| `default_top_k` | 10 | Default search limit |
| `agent_max_docs` | 15 | Max docs for agent node |
| `temperature_rag` | 0.1 | RAG LLM temperature |
| `temperature_chat` | 0.7 | Chat LLM temperature |
| `temperature_mcp` | 0.1 | MCP LLM temperature |

### 3. Query Understanding (`src/retrieval/query_understanding.py`)

**`IntentClassifier`**: Pattern-matching (regex) over 11 intent classes:

| Intent | Confidence | Example Trigger |
|---|---|---|
| `SUMMARY` | High | "summarize", "overview", "brief me" |
| `DIAGNOSIS` | High | "diagnosis", "what is", "diagnosed" |
| `DIFFERENTIAL` | High | "differential", "possibilities", "rule out" |
| `MEDICATION` | High | "medication", "prescription", "drug" |
| `ALLERGY` | High | "allergy", "allergic" |
| `CHANGE_TRACKING` | Medium | "change", "progress", "improved" |
| `TREND_ANALYSIS` | Medium | "trend", "pattern", "worsening" |
| `RATIONALE` | Low | "why", "rationale", "justification" |
| `TIMELINE` | Low | "timeline", "sequence", "order" |
| `OUTCOME` | Low | "outcome", "result", "prognosis" |
| `UNKNOWN` | — | No match |

**`QueryContext`**: Enriched query object with:
- `original_query`, `intent`, `rewritten_query`, `confidence`
- `requires_diagnosis_filter`, `requires_temporal_ordering`, `requires_graph_expansion`
- `date_range`, `patient_state_summary`

### 4. Clinical Reasoning (`src/agent/clinical_reasoning.py`)

**`ClinicalReasoner`**: Bounded reasoning over retrieved documents only.

**Constraints**:
1. May ONLY reason over retrieved contexts
2. Cannot introduce new clinical facts
3. Cannot access external knowledge
4. Must provide temporal comparisons
5. Must explain cause-effect relationships
6. Must cite all claims with node IDs

**Output** (`ClinicalResponse`):
- `original_query`, `intent`
- `explanation`, `claims[]` (each with `claim`, `source_node_ids[]`, `temporal_context`)
- `temporal_summary`, `has_insufficient_data`, `contains_speculation`
- `source_document_ids[]`, `confidence`

### 5. Ingestion Pipeline

```
Raw JSON / FHIR
  → ClinicalPreprocessor.preprocess_timeline()
    → NormalizedNode[] (enriched, sorted, graph-linked)
    → PatientStateCompiler.compile_state() → PatientState
    → DocumentBuilder.build_document_collection() → ClinicalDocument[]
    → IngestionService.ingest_resource()
      → ToonNormalizer (FHIR → TOON text)
      → FastEmbed (dense + sparse embeddings)
      → Qdrant upsert (hybrid point with text-dense + text-sparse vectors)
```

**Key files:**
- `src/ingestion/preprocessor.py` — `NormalizedNode`, `ClinicalPreprocessor`
- `src/ingestion/patient_state.py` — `PatientState`, `PatientStateCompiler`
- `src/ingestion/service.py` — `IngestionService` (embedding, upsert)
- `src/ingestion/toon.py` — FHIR-to-text normalization (30-50% token reduction)
- `src/retrieval/indexing.py` — `ClinicalDocument`, `DocumentBuilder`, `IndexStrategy`

### 6. Infrastructure Configuration (`src/shared/config.py`)

| Backend | Default URL | Model | Toggle |
|---|---|---|---|
| Local llama.cpp | `http://localhost:8000` | `medgemma-1.5-4b-it-Q6_K.gguf` | `llm_backend="local"` |
| Lightning AI | configurable | `google/medgemma-27b-it` | `llm_backend="lightning"` |
| Qdrant | `localhost:6333` | — | `clinical_snapshots` collection |
| FastEmbed | CPU | `bge-base-en-v1.5` + `Splade_PP_en_v1` | Embedded |

### 7. Database Schema

**Qdrant collection: `clinical_snapshots`**

| Vector | Type | Dimension | Distance |
|---|---|---|---|
| `text-dense` | Dense | 768 | COSINE |
| `text-sparse` | Sparse | — | — |

**Payload fields:**
- `id`, `patient_id`, `resource_type`, `toon_content`, `fhir_raw`
- `source_node_id` (links to the ingestion node ID)

### 8. Safety & Domain Boundaries

**MCP Question Types** enforce content policies:

| Type | Max Tokens | Forbidden Output |
|---|---|---|
| `drug_contraindications` | 300 | dosing, treatment protocol, diagnostic criteria |
| `drug_interactions` | 400 | dosing, treatment protocol |
| `drug_side_effects` | 400 | dosing, treatment protocol |
| `treatment_guidelines` | 800 | invented doses, fabricated protocols |
| `general` | 600 | — |

**ClaimAuditor** validates against hallucinations:
1. All `cited_ids` must exist in context
2. Supporting evidence must have ≥50% key term overlap
3. High-confidence (>0.95) claims require ≥2 supporting evidence pieces

---

## Data Flow — End-to-End Query

```
User: "What medications is the patient taking?"

1. [classify]
   IntentClassifier → ("medication", 0.92)

2. [route_intent]
   mode=auto, intent=medication → rag_retrieve

3. [retrieve_patient_context]
   HybridRetriever.search(patient_id, "What medications...")
     → FastEmbed dense (768d) + sparse (SPLADE)
     → Qdrant query: text-dense + text-sparse RRF fusion
     → RetrievedContext[] ∩ local ClinicalDocument[]
   Fallback: ContextRetriever.retrieve(query_context)
     → RetrievalStrategy.retrieve_for_medication()
     → filters: is_medication=true + is_diagnosis + is_allergy

4. [run_deterministic_reasoning]
   ClinicalReasoner(retrieval_context).reason()
     → reason_for_medication()
     → CitedClaim[] with source_node_ids + temporal_context
     → ClinicalResponse

5. [generate_response]
   LLM synthesizes ClinicalResponse → final text with citations:
     "The patient is currently prescribed [Drug X] (started [date]).
     Source: Medication – [Drug X] ([date])"
```

---

## Validation & Testing

23 deterministic system tests across 8 suites:

| Suite | Tests | What It Validates |
|---|---|---|
| Preprocessing | 3 | Determinism, structure, chronology |
| Patient State | 3 | Immutability, active diagnosis, allergy extraction |
| Indexing | 3 | Traceability, date parsing, event tags |
| Intent Classification | 4 | Coverage, correct routing, confidence, mode flags |
| Context Retrieval | 4 | Filtering correctness for diagnosis, medication, change, timeline |
| Clinical Reasoning | 5 | Citations grounded, no speculation, temporal context |
| Deterministic | 3 | Repeatability, citation reproducibility |
| Non-Goals | 2 | No guideline retrieval, no cross-patient reasoning |

**Benchmark targets:**

| Metric | Target | Current |
|---|---|---|
| Faithfulness | >0.95 | 1.000 |
| Hallucination Rate | <0.05 | 0.000 |
| Latency P95 | <12000ms | 0.13ms |
| Recall@3 | >0.90 | 0.408 (data-limited)* |

_* Current dataset has 10 documents; Recall@K differentiation requires larger corpus._

---

## Performance Characteristics (10-doc scale)

| Component | Mean Latency |
|---|---|
| Query Understanding | 0.06ms |
| Context Creation | 0.00ms |
| Retrieval | 0.03ms |
| Context Build | 0.00ms |
| Reasoning | 0.04ms |
| **Total (no LLM)** | **0.15ms** |
| Qdrant Hybrid Search | ~100ms |

---

## File Map

```
src/
├── agent/
│   ├── __init__.py              # Exports
│   ├── clinical_reasoning.py    # ClinicalReasoner, ClinicalResponse, CitedClaim
│   ├── graph/
│   │   ├── state.py             # ClinicalAgentState
│   │   ├── nodes.py             # All 5 graph nodes
│   │   └── workflow.py          # LangGraph orchestration + routing
│   ├── workflow.py              # Legacy ClinicalWorkflow (Ticket 2.2)
│   ├── llm_client.py            # OllamaClient
│   ├── auditor.py               # ClaimAuditor
│   ├── mcp_client.py            # MCPToolManager (SSE)
│   └── query_rewriter.py        # Groq-based rewriter
├── retrieval/
│   ├── service.py               # HybridRetriever with RRF
│   ├── query_understanding.py   # IntentClassifier, QueryContext, QueryRewriter
│   ├── context_retrieval.py     # ContextRetriever, RetrievalStrategy
│   ├── indexing.py              # ClinicalDocument, DocumentBuilder, IndexStrategy
│   ├── config.py                # RetrieverConfig
│   └── medgemma_rag.py          # Legacy simple RAG
├── ingestion/
│   ├── preprocessor.py          # ClinicalPreprocessor, NormalizedNode
│   ├── patient_state.py         # PatientState, PatientStateCompiler
│   ├── service.py               # IngestionService
│   └── toon.py                  # ToonNormalizer (FHIR→text)
├── shared/
│   ├── config.py                # InfraConfig (singleton)
│   ├── db_clients.py            # QdrantVectorClient
│   └── models.py                # RetrievedContext, ClinicalState, etc.
├── api/
│   ├── FastAPI_Backend.py       # Full demo backend
│   └── medgemma_rag_api.py      # Lightweight RAG API
└── ui/
    ├── dashboard.py
    └── streamlit_rag_app.py
```
