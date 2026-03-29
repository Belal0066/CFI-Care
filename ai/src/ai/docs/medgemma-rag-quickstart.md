# MedGemma RAG Integration

Connect MedGemma 1.5 (llama.cpp) to Qdrant for clinical RAG.

## Quick Start

### 1. Start Infrastructure

```bash
# Start Qdrant
docker-compose up -d qdrant

# Start llama-server (MedGemma 1.5)
./llama.cpp/build/bin/llama-server \
    -m models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf \
    --mmproj models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf \
    --host 0.0.0.0 \
    --port 8000 \
    --n-gpu-layers -1 \
    --ctx-size 16384 \
    --flash-attn \
    --cache-type-k q8_0 \
    --cache-type-v q8_0
```

### 2. Test RAG Integration

#### Python API (Direct)

```python
from src.retrieval.medgemma_rag import medgemma_rag

# Simple query
result = medgemma_rag.query("What are the symptoms of diabetes?")
print(result["content"])

# Patient-specific query
result = medgemma_rag.query(
    query="What medications is the patient on?",
    patient_id="patient-001"
)
print(result["content"])

# Custom system prompt
result = medgemma_rag.query(
    query="Explain hypertension",
    system_prompt="You are a medical educator. Be concise."
)
```

#### Test Script

```bash
# Run all tests
python scripts/test_medgemma_rag.py

# Run specific test
python scripts/test_medgemma_rag.py --test basic
python scripts/test_medgemma_rag.py --test patient
python scripts/test_medgemma_rag.py --test retrieval

# Interactive mode
python scripts/test_medgemma_rag.py --interactive
```

#### REST API

```bash
# Start API server
cd src
python -m api.medgemma_rag_api
# Server runs on http://localhost:8001

# Test endpoints
curl http://localhost:8001/health

# Query with RAG
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are diabetes symptoms?",
    "top_k": 5
  }'

# Patient-filtered query
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What medications is the patient taking?",
    "patient_id": "patient-001"
  }'

# Retrieval only (no generation)
curl -X POST http://localhost:8001/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "diabetes diagnosis",
    "top_k": 3
  }'
```

## Architecture

```
┌─────────────────┐
│   User Query    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│   MedGemmaRAG (medgemma_rag.py)         │
├─────────────────────────────────────────┤
│  1. Embed query (ModernPubMedBERT)      │
│  2. Search Qdrant (vector similarity)   │
│  3. Build RAG prompt with contexts      │
│  4. Call llama.cpp server               │
│  5. Return response + metadata          │
└────────┬────────────────────┬───────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│     Qdrant      │  │  llama.cpp      │
│  (Port 6333)    │  │  (Port 8000)    │
│  Clinical Data  │  │  MedGemma 1.5   │
└─────────────────┘  └─────────────────┘
```

## Configuration

Edit `.env` or [src/shared/config.py](src/shared/config.py):

```python
# Qdrant
qdrant_host=localhost
qdrant_port=6333
qdrant_collection_name=clinical_snapshots

# Embedding
embedding_model=lokeshch19/ModernPubMedBERT
embedding_dimension=768

# MedGemma (llama.cpp)
# Set via MedGemmaRAG constructor:
# llama_server_url="http://localhost:8000"
```

## API Reference

### MedGemmaRAG Class

```python
class MedGemmaRAG:
    def __init__(
        self,
        llama_server_url: str = "http://localhost:8000",
        embedding_model: str = "lokeshch19/ModernPubMedBERT",
        top_k: int = 5
    )
    
    def query(
        self, 
        query: str, 
        patient_id: Optional[str] = None,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """End-to-end RAG: retrieve + generate"""
    
    def retrieve_context(
        self, 
        query: str, 
        patient_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Retrieval only"""
    
    def generate_response(
        self, 
        query: str, 
        contexts: List[Dict[str, Any]],
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generation with provided contexts"""
```

### REST API Endpoints

#### POST /query
```json
{
  "query": "What are diabetes symptoms?",
  "patient_id": "patient-001",  // optional
  "system_prompt": "...",       // optional
  "top_k": 5                     // optional
}
```

**Response:**
```json
{
  "answer": "Diabetes symptoms include...",
  "model": "medgemma-1.5-4b",
  "contexts_used": 5,
  "contexts": [
    {
      "id": "uuid-123",
      "content": "...",
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

#### POST /retrieve
```json
{
  "query": "diabetes",
  "patient_id": "patient-001",  // optional
  "top_k": 3                     // optional
}
```

**Response:**
```json
[
  {
    "id": "uuid-123",
    "content": "...",
    "score": 0.89,
    "patient_id": "patient-001",
    "resource_type": "Observation"
  }
]
```

#### GET /health
```json
{
  "status": "ok",
  "services": {
    "api": "ok",
    "qdrant": "ok",
    "llama_server": "ok"
  }
}
```

## Requirements

Make sure you have these dependencies:

```bash
pip install \
  sentence-transformers \
  qdrant-client \
  requests \
  fastapi \
  uvicorn \
  pydantic
```

Or install from requirements:
```bash
pip install -r requirements.txt
```

## Troubleshooting

### Qdrant Connection Error
```bash
# Check if Qdrant is running
docker-compose ps qdrant
curl http://localhost:6333/collections
```

### llama.cpp Server Not Responding
```bash
# Check if server is running
curl http://localhost:8000/health

# Check server logs
# (check terminal where llama-server is running)
```

### No Contexts Retrieved
```bash
# Check if collection has data
curl http://localhost:6333/collections/clinical_snapshots

# Seed test data if empty
python scripts/seed_fhir_test.py
```

### Embedding Model Download
First run will download ModernPubMedBERT (~400MB). Wait for download to complete.

## Data Flow

1. **Query** → User asks: "What are diabetes symptoms?"
2. **Embed** → Convert to 768-dim vector via ModernPubMedBERT
3. **Search** → Qdrant finds top-5 similar clinical documents
4. **Augment** → Build prompt with retrieved contexts
5. **Generate** → MedGemma produces answer with context
6. **Return** → Response includes answer + contexts + metadata

## Next Steps

- Implement reranking for better context selection
- Add streaming support for real-time responses
- Multi-turn conversation with memory
- Fine-tune retrieval for specific medical domains
