# Clinical AI System (Clinical RAG / Clinical-Graph Copilot)

**Status:** All 23 validation tests passing | Tickets 4-10 complete | Single-command launch

A deterministic, citation-backed clinical reasoning system that processes longitudinal patient data and provides evidence-grounded clinical analysis. Built as a HIPAA-compliant, graph-grounded AI copilot on the "Twin Engine" architecture (Qdrant for vector search + FalkorDB for graph queries).

## Table of Contents
- [Quick Launch](#quick-launch)
- [Key Features](#key-features)
  - [Deterministic Guarantees](#deterministic-guarantees)
  - [Complete Pipeline (Tickets 4-10)](#complete-pipeline-tickets-4-10)
  - [Safety Constraints](#safety-constraints)
- [Validation Results](#validation-results)
- [Architecture](#architecture)
  - [Core Principles](#core-principles)
- [Quick Start (Ticket 1.1)](#quick-start-ticket-11)
- [Services](#services)
- [Epic 1: Clinical Core](#epic-1-clinical-core)
  - [Testing Epic 1](#testing-epic-1)
- [Epic 2: Hybrid Retrieval (Current)](#epic-2-hybrid-retrieval-current)
  - [Setup for Epic 2](#setup-for-epic-2)
  - [Using the Hybrid Retriever](#using-the-hybrid-retriever)
  - [Testing Epic 2](#testing-epic-2)
  - [Experiment Tracking](#experiment-tracking)
- [Project Structure](#project-structure)
- [Development Guidelines](#development-guidelines)
- [Roadmap](#roadmap)

## Quick Launch

```bash
# Start all services (Qdrant, MedGemma LLM, FastAPI, MCP)
./launch.sh

# Launch web interface (http://localhost:8511)
./launch_dashboard.sh

# Validate system (23 tests)
PYTHONPATH=$PWD python3 scripts/validate_system.py
```

**Expected output:** `✅ ALL VALIDATION TESTS PASSED` (23/23)

## Key Features

### Deterministic Guarantees
- All outputs grounded in provided JSON
- All clinical claims traceable to encounters
- Longitudinal reasoning is reproducible
- No hallucinated medical facts introduced

### Complete Pipeline (Tickets 4-10)
1. **Preprocessing & Normalization** - Event tagging, diagnosis classification
2. **Patient State Compilation** - Immutable frozen state with temporal priority
3. **RAG Document Indexing** - Citation-ready documents with rich metadata
4. **Query Understanding** - Intent classification (10 types) + query rewriting
5. **Context Retrieval** - Intent-based filtering with 10 specialized strategies
6. **Clinical Reasoning** - Bounded reasoning (NO external knowledge)
7. **Response Generation** - Mandatory citations for all claims + temporal summaries

### Safety Constraints
- Citation enforcement (100% coverage)
- No speculation beyond documented facts
- Data sufficiency validation
- No guideline retrieval, no internet access, no autonomous advice

## Validation Results

```
Total Tests: 23/23 passed (100%)
Duration: <1 second

✅ Preprocessing & Normalization (4 tests)
✅ Patient State Compiler (3 tests)
✅ Document Indexing (3 tests)
✅ Query Understanding (1 test)
✅ Context Retrieval (2 tests)
✅ Clinical Reasoning & Response (5 tests)
✅ Deterministic Guarantees (3 tests)
✅ Non-Goals Verification (2 tests)
```

See [SYSTEM_READY.md](SYSTEM_READY.md) for full details.

## Architecture

### Core Principles
1. **HL7 FHIR R4 Compliance**: All clinical data structures follow FHIR R4 standards.
2. **Twin Engine Rule**: Every data point exists in both Vector (Qdrant) and Graph (FalkorDB) stores with matching UUIDs.
3. **2PC Lite**: Two-phase commit pattern ensures atomicity across databases.
4. **Strict Typing**: Pydantic V2 for all data validation.

## Quick Start (Ticket 1.1)

### 1. Start Infrastructure
```bash
# Start all services
docker-compose up -d

# Wait ~30 seconds for initialization
docker-compose ps
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose)
```

### 4. Verify Infrastructure
```bash
python scripts/verify_infra.py
```

### 5. Test FHIR Ingestion
```bash
python scripts/seed_fhir_test.py
```

## Services

| Service | URL | Purpose |
| :--- | :--- | :--- |
| HAPI FHIR | http://localhost:8080/fhir | Clinical data source |
| Qdrant | http://localhost:6333/dashboard | Vector search |
| FalkorDB | redis://localhost:6379 | Graph queries |
| Ollama (MedGemma 4B) | http://localhost:11434 | Medical reasoning LLM |

See [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for how HAPI FHIR here relates to the `ai/src/DOC2FHIR/` pipeline, and for the full cross-subsystem port map (this system's `:8001` FastAPI Backend and `:8002` MCP Server each have a same-numbered counterpart in DOC2FHIR).

## Epic 1: Clinical Core

The foundational "Twin Engine" infrastructure is operational.

### Testing Epic 1
```bash
# 1. Verify infrastructure health
python scripts/verify_infra.py

# 2. Test FHIR ingestion with 2PC
python scripts/test_ingestion.py

# 3. Check Twin Engine consistency
python scripts/sync_check.py
```

## Epic 2: Hybrid Retrieval (Current)

**Goal**: Implement "Anchor & Expand" retrieval combining semantic search (Vector) with structural traversal (Graph).

### Setup for Epic 2

#### 1. Configure API Keys
```bash
cp .env.example .env
# Edit .env and add:
# - HF_TOKEN: Your Hugging Face token
# - GROQ_API_KEY: Your Groq API key
```

#### 2. Start Ollama (MedGemma)
```bash
# Ensure Ollama is running
ollama serve

# Verify the model is available
ollama list | grep medgemma

# If not present, pull it:
# ollama pull medgemma:4b
```

#### 3. Start Docker Services
```bash
docker-compose up -d
```

### Using the Hybrid Retriever

```python
from src.retrieval.service import HybridRetriever

# Initialize
retriever = HybridRetriever(model_name="lokeshch19/ModernPubMedBERT")

# Query
results = retriever.search(
    patient_id="patient-123",
    query="elevated glucose levels",
    limit=5,
    hops=1  # 1-hop graph expansion
)

for ctx in results:
    print(f"Anchor: {ctx.anchor_content}")
    print(f"Graph Context: {len(ctx.graph_context)} related nodes")
```

### Testing Epic 2

#### Ticket 2.1: Hybrid Retrieval
```bash
python scripts/test_retrieval.py
```

#### Ticket 2.2: Clinical Reasoning (DDx)
```bash
# Ensure Ollama is running
ollama serve

# Run the DDx workflow test
python scripts/test_ddx.py
```

### Experiment Tracking
Results are logged to `experiments/ddx_runs.jsonl` for analysis and iteration. (Note: this `experiments/` directory does not currently exist in the repo — the logging path is aspirational/not yet wired up.)

## Project Structure

```
ai/src/ai/
├── docker-compose.yml          # Infrastructure definition (Epic 1 + 2)
├── requirements.txt            # Python dependencies
├── .env.example               # Configuration template
├── docs/
│   ├── epic-1-clinical-core.md   # Epic 1 documentation
│   └── specs/                    # Technical specifications
│       ├── Ticket-1.1-Infra-Spec.md
│       ├── Ticket-1.2-1.3-Data-Graph-Spec.md
│       ├── Ticket-1.4-Ingestion-Spec.md
│       └── Ticket-2.1-Hybrid-Retrieval-Spec.md
├── src/
│   ├── shared/                # Shared utilities
│   │   ├── models.py         # Pydantic data models
│   │   ├── config.py         # Configuration management
│   │   └── db_clients.py     # Database connection handlers
│   ├── ingestion/            # FHIR ETL pipeline
│   │   ├── service.py        # 2PC ingestion orchestrator
│   │   ├── toon.py           # TOON normalization
│   │   └── graph.py          # Graph mapping logic
│   ├── retrieval/            # Hybrid retrieval (Epic 2)
│   │   └── service.py        # HybridRetriever implementation
│   └── api/                  # API layer (future)
└── scripts/
    ├── verify_infra.py       # Infrastructure validation
    ├── setup_graph_schema.py # Graph schema initialization
    ├── seed_fhir_test.py     # Test data seeding
    ├── test_ingestion.py     # Ingestion pipeline tests
    ├── test_retrieval.py     # Retrieval service tests
    └── sync_check.py         # Twin Engine consistency check
```

*(This tree was originally written as `AI_System/` — corrected to the path this subsystem actually lives at in this repo: `ai/src/ai/`.)*

## Development Guidelines

Twin Engine compliance rules, error handling patterns, and audit trail requirements were originally documented at `.github/instructions/copilot-instructions.md`, but that path does not exist in this repo — it wasn't carried over when this subsystem was merged in. Treat those guidelines as currently undocumented here pending recovery from wherever that file originated.

## Roadmap

> **Note:** this roadmap uses an older Epic/Ticket numbering (1.x / 2.x) that predates the "Tickets 4-10" scheme referenced in [Key Features](#key-features) above. The status banner at the top of this doc claims all of Tickets 4-10 are complete with 23/23 tests passing, while this section (unmodified from the source doc) still shows Epic 2's later tickets as in-progress. Left as-is rather than guessed-at — whoever owns this subsystem should reconcile which is current.

### Epic 1: Clinical Core
- [x] **Ticket 1.1**: Infrastructure deployment (HAPI FHIR, Qdrant, FalkorDB)
- [x] **Ticket 1.2**: TOON normalization layer
- [x] **Ticket 1.3**: Temporal graph schema
- [x] **Ticket 1.4**: 2PC Lite ingestion service

### Epic 2: Agentic RAG (Current)
- [x] **Ticket 2.1**: Hybrid Retrieval Service (Anchor & Expand)
- [ ] **Ticket 2.2**: LangGraph Orchestrator & Differential Diagnosis (Ready for Testing)
- [ ] **Ticket 2.3**: MCP-1 Deterministic Vitals Tool

(The complete roadmap was originally linked from `.github/Backlog.md`, which also does not exist in this repo — same gap as the Development Guidelines link above.)
