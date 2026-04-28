# Clinical RAG System - Production Ready ✅

**Status:** All 23 validation tests passing | Tickets 4-10 complete | Single-command launch

A deterministic, citation-backed clinical reasoning system that processes longitudinal patient data and provides evidence-grounded clinical analysis.

## 🚀 Quick Launch

```bash
# Start all services (Qdrant, MedGemma LLM, FastAPI, MCP)
./launch.sh

# Launch web interface (http://localhost:8511)
./launch_dashboard.sh

# Validate system (23 tests)
PYTHONPATH=$PWD python3 scripts/validate_system.py
```

**Expected output:** `✅ ALL VALIDATION TESTS PASSED` (23/23)

## 📋 Key Features

### ✅ Deterministic Guarantees
- All outputs grounded in provided JSON
- All clinical claims traceable to encounters  
- Longitudinal reasoning is reproducible
- No hallucinated medical facts introduced

### ✅ Complete Pipeline (Tickets 4-10)
1. **Preprocessing & Normalization** - Event tagging, diagnosis classification
2. **Patient State Compilation** - Immutable frozen state with temporal priority
3. **RAG Document Indexing** - Citation-ready documents with rich metadata
4. **Query Understanding** - Intent classification (10 types) + query rewriting
5. **Context Retrieval** - Intent-based filtering with 10 specialized strategies
6. **Clinical Reasoning** - Bounded reasoning (NO external knowledge)
7. **Response Generation** - Mandatory citations for all claims + temporal summaries

### ✅ Safety Constraints
- Citation enforcement (100% coverage)
- No speculation beyond documented facts
- Data sufficiency validation
- No guideline retrieval, no internet access, no autonomous advice

## 📊 Validation Results

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

---

# Clinical-Graph Copilot

A HIPAA-compliant, graph-grounded AI copilot for clinical reasoning built on the "Twin Engine" architecture (Qdrant + FalkorDB).

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
Results are logged to `experiments/ddx_runs.jsonl` for analysis and iteration.

## Services

| Service | URL | Purpose |
| :--- | :--- | :--- |
| HAPI FHIR | http://localhost:8080/fhir | Clinical data source |
| Qdrant | http://localhost:6333/dashboard | Vector search |
| FalkorDB | redis://localhost:6379 | Graph queries |

## Project Structure

```
AI_System/
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

## Development Guidelines

See [.github/instructions/copilot-instructions.md](.github/instructions/copilot-instructions.md) for:
- Twin Engine compliance rules
- Error handling patterns
- Audit trail requirements

## Roadmap

### Epic 1: Clinical Core 
- [x] **Ticket 1.1**: Infrastructure deployment (HAPI FHIR, Qdrant, FalkorDB)
- [x] **Ticket 1.2**: TOON normalization layer
- [x] **Ticket 1.3**: Temporal graph schema
- [x] **Ticket 1.4**: 2PC Lite ingestion service

### Epic 2: Agentic RAG (Current)
- [x] **Ticket 2.1**: Hybrid Retrieval Service (Anchor & Expand)
- [ ] **Ticket 2.2**: LangGraph Orchestrator & Differential Diagnosis (Ready for Testing)
- [ ] **Ticket 2.3**: MCP-1 Deterministic Vitals Tool

See [.github/Backlog.md](.github/Backlog.md) for the complete roadmap.
