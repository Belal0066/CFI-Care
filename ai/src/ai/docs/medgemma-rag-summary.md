# MedGemma RAG Integration - Summary

##  What Was Built

A complete RAG (Retrieval-Augmented Generation) pipeline connecting **MedGemma 1.5** (via llama.cpp) to **Qdrant** vector database for clinical question answering.

##  Files Created

### Core Implementation
- **[src/retrieval/medgemma_rag.py](../src/retrieval/medgemma_rag.py)** - Main RAG class (`MedGemmaRAG`)
  - Embeds queries using ModernPubMedBERT
  - Searches Qdrant for relevant contexts
  - Calls llama.cpp server for generation
  - Returns responses with metadata

### API Service
- **[src/api/medgemma_rag_api.py](../src/api/medgemma_rag_api.py)** - FastAPI REST service
  - `POST /query` - RAG with generation
  - `POST /retrieve` - Retrieval only
  - `GET /health` - Health check
  - Auto-generated docs at `/docs`

### Testing & Examples
- **[scripts/test_medgemma_rag.py](../scripts/test_medgemma_rag.py)** - Comprehensive test suite
  - Basic queries
  - Patient-filtered queries
  - Custom system prompts
  - Interactive mode
  
- **[examples/medgemma_rag_example.py](../examples/medgemma_rag_example.py)** - Quick examples

### Scripts
- **[scripts/start_medgemma_api.sh](../scripts/start_medgemma_api.sh)** - API launcher

### Documentation
- **[docs/medgemma-rag-quickstart.md](../docs/medgemma-rag-quickstart.md)** - Complete guide

## ️ Architecture

```
User Query
    ↓
┌─────────────────────────────────┐
│      MedGemmaRAG Class          │
│  (medgemma_rag.py)              │
├─────────────────────────────────┤
│ 1. Embed query                  │
│    (ModernPubMedBERT)           │
│                                 │
│ 2. Vector search                │
│    Qdrant → Top-K contexts      │
│                                 │
│ 3. Build RAG prompt             │
│    Query + Contexts             │
│                                 │
│ 4. Generate response            │
│    llama.cpp API call           │
│                                 │
│ 5. Return answer + metadata     │
└─────────────────────────────────┘
         ↓           ↓
    ┌────────┐  ┌──────────┐
    │ Qdrant │  │ llama.cpp│
    │ :6333  │  │ :8000    │
    └────────┘  └──────────┘
```

##  Quick Start

### 1. Start Services

```bash
# Start Qdrant
docker-compose up -d qdrant

# Start MedGemma (llama.cpp)
./llama.cpp/build/bin/llama-server \
    -m models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf \
    --mmproj models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf \
    --host 0.0.0.0 --port 8000 \
    --n-gpu-layers -1 --ctx-size 16384 \
    --flash-attn \
    --cache-type-k q8_0 --cache-type-v q8_0
```

### 2. Use It

#### Python API
```python
from src.retrieval.medgemma_rag import medgemma_rag

# Query with RAG
result = medgemma_rag.query("What are diabetes symptoms?")
print(result["content"])

# Patient-specific
result = medgemma_rag.query(
    "What medications?", 
    patient_id="patient-001"
)
```

#### REST API
```bash
# Start server
./scripts/start_medgemma_api.sh

# Query
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What are diabetes symptoms?"}'
```

#### Interactive Mode
```bash
python scripts/test_medgemma_rag.py --interactive
```

#### Run Examples
```bash
python examples/medgemma_rag_example.py
```

##  Key Features

### 1. **Vector Search**
- Embeddings: ModernPubMedBERT (768-dim, medical domain)
- Qdrant similarity search with filtering

### 2. **Patient Filtering**
- Optional `patient_id` parameter
- Scopes retrieval to specific patient data

### 3. **Flexible Generation**
- Custom system prompts
- Configurable top-k retrieval
- Token usage tracking

### 4. **Multiple Interfaces**
- Python API (direct import)
- REST API (FastAPI)
- CLI (test scripts)
- Interactive mode

### 5. **Metadata & Context**
- Returns retrieved contexts with scores
- Full traceability (HIPAA audit trail)
- Resource type tracking

##  Response Format

```json
{
  "answer": "Diabetes symptoms include increased thirst...",
  "model": "medgemma-1.5-4b",
  "contexts_used": 5,
  "contexts": [
    {
      "id": "uuid-123",
      "content": "Patient reports increased thirst...",
      "score": 0.89,
      "patient_id": "patient-001",
      "resource_type": "Observation"
    }
  ],
  "usage": {
    "prompt_tokens": 234,
    "completion_tokens": 156,
    "total_tokens": 390
  }
}
```

##  Configuration

Configured in [src/shared/config.py](../src/shared/config.py) or `.env`:

```bash
# Qdrant
qdrant_host=localhost
qdrant_port=6333
qdrant_collection_name=clinical_snapshots

# Embedding
embedding_model=lokeshch19/ModernPubMedBERT
embedding_dimension=768
```

MedGemma server URL set in `MedGemmaRAG()` constructor:
```python
medgemma_rag = MedGemmaRAG(
    llama_server_url="http://localhost:8000",
    embedding_model="lokeshch19/ModernPubMedBERT",
    top_k=5
)
```

##  Testing

```bash
# All tests
python scripts/test_medgemma_rag.py

# Specific tests
python scripts/test_medgemma_rag.py --test basic
python scripts/test_medgemma_rag.py --test patient
python scripts/test_medgemma_rag.py --test retrieval

# Interactive
python scripts/test_medgemma_rag.py --interactive
```

##  API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/query` | POST | RAG with generation |
| `/retrieve` | POST | Retrieval only |
| `/docs` | GET | OpenAPI docs |

##  Clinical Core Compliance

 **FHIR R4**: Data in Qdrant follows FHIR structure  
 **Strict Typing**: Pydantic V2 models throughout  
 **Traceability**: Full context metadata for audit logs  
 **Twin Engine**: Uses Qdrant (graph expansion via FalkorDB can be added)  
 **Error Handling**: Graceful fallbacks, detailed logging  

##  Next Steps

1. **Graph Expansion**: Integrate FalkorDB for hybrid retrieval
2. **Reranking**: Add cross-encoder for context reranking
3. **Streaming**: Real-time response streaming
4. **Memory**: Multi-turn conversations
5. **Fine-tuning**: Domain-specific retrieval optimization

##  Documentation

- Full guide: [docs/medgemma-rag-quickstart.md](medgemma-rag-quickstart.md)
- Example code: [examples/medgemma_rag_example.py](../examples/medgemma_rag_example.py)
- Test suite: [scripts/test_medgemma_rag.py](../scripts/test_medgemma_rag.py)

---

**Status**:  Ready to use  
**Dependencies**: Qdrant + llama-server running  
**Ports**: Qdrant (6333), llama-server (8000), API (8001)
