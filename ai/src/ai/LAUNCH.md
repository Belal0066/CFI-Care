# Clinical AI System - Launch Guide

## Quick Start

### 1. Validate Environment
```bash
./check-env.sh
```
This checks:
- System dependencies (Docker, Python, curl)
- Python packages (FastAPI, Qdrant, FastEmbed, etc.)
- AI models (MedGemma GGUF)
- Configuration (API keys, Redis settings)
- Port availability

### 2. Launch All Services
```bash
# Local LLM backend (MedGemma 4B via llama.cpp) — default
./launch.sh --local

# Remote LLM backend (MedGemma 27B via Lightning AI)
./launch.sh --lightning
```
With `--local` this starts in order:
1. **Qdrant** (Vector DB) - Port 6333
2. **MedGemma 4B** (llama.cpp) - Port 8000
3. **FastAPI Backend** (RAG Hub) - Port 8001
4. **MCP Server** (Internet Engine) - Port 8002

With `--lightning`, step 2 is skipped and replaced with a connectivity check against the Lightning AI instance.

### 3. Seed Data (Optional)
```bash
./utils.sh seed
```
Pulls FHIR resources from Cloud Redis and ingests into Qdrant.

### 4. Test the System
```bash
# Test local RAG mode
./utils.sh test-rag

# Test internet MCP mode
./utils.sh test-mcp
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                              │
│                     (Port 8001)                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  /chat?mode=rag    →  Qdrant + MedGemma (local/remote)  │  │
│  │  /chat?mode=mcp    →  Internet MCP Server               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                               │
           ▼                               ▼
    ┌──────────┐                   ┌──────────────┐
    │  Qdrant  │                   │  MCP Server  │
    │  (6333)  │                   │   (8002)     │
    └──────────┘                   └──────────────┘
           ▲                               │
           │                               ▼
    ┌──────────────┐            ┌────────────────────────┐
    │ LLM Backend |             │ PubMed / OpenFDA / NIH │
    │ (selectable) │            └────────────────────────┘
    │              │
    │ • --local:   │
    │   llama.cpp  │
    │   MedGemma 4B│
    │   Port 8000  │
    │              │
    │ • --lightning│
    │   Lightning  │
    │   MedGemma 27B│
    │   (remote)   │
    └──────────────┘
```

## Utilities

### Check Service Status
```bash
./utils.sh status
```

### View Logs
```bash
./utils.sh logs
```
Log files are in `logs/`:
- `llama-server.log` - LLM inference (only with `--local`)
- `backend.log` - FastAPI backend
- `mcp-server.log` - MCP internet retrieval

### Stop All Services
```bash
./utils.sh stop
```
Or press `Ctrl+C` in the terminal running `launch.sh`.

## API Endpoints

### Backend (Port 8001)

**Health Check:**
```bash
curl http://localhost:8001/health
```

**Ingest Data:**
```bash
curl -X POST http://localhost:8001/ingest
```

**Chat (RAG Mode):**
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "diabetes treatment", "mode": "rag"}'
```

**Chat (MCP Mode):**
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "aspirin interactions", "mode": "mcp"}'
```

### MCP Server (Port 8002)

**Direct Query:**
```bash
curl -X POST http://localhost:8002/mcp/query \
  -H "Content-Type: application/json" \
  -d '{"query": "latest COVID-19 treatment guidelines"}'
```

## Environment Variables

Create `.env` in the project root:

```bash
# Data Source (Cloud Redis)
REDIS_HOST=your-redis-host.cloud.redislabs.com
REDIS_PORT=19534
REDIS_PASSWORD=your_password

# Qdrant (Local or Remote)
QDRANT_HOST=localhost
QDRANT_PORT=6333

# LLM Backend Selection
# Set by launch.sh --local or --lightning
LLM_BACKEND=local

# Local llama.cpp (used when LLM_BACKEND=local)
LLAMACPP_BASE_URL=http://localhost:8000
LLAMACPP_MODEL=medgemma-1.5-4b-it-Q6_K.gguf

# Lightning AI (used when LLM_BACKEND=lightning)
LIGHTNING_BASE_URL=https://<id>-8000.<region>.studios.lightning.ai/v1
LIGHTNING_MODEL_NAME=google/medgemma-27b-it
LIGHTNING_ACCESS_TOKEN=

# LLM for MCP Classification
GROQ_API_KEY=gsk_your_key_here
# or (local fallback)
LLAMACPP_API_BASE=http://localhost:8000/v1
LLAMACPP_API_KEY=sk-no-key
```

## Troubleshooting

### MedGemma Model Not Found
```bash
huggingface-cli download google/medgemma-1.5-4b-it-GGUF \
  --local-dir models/medgemma-1.5-4b-it-Q6_K
```

### Qdrant Not Starting
```bash
docker compose up -d qdrant
docker logs clinical_vector
```

### Port Already in Use
```bash
# Find process on port
lsof -i :8001

# Kill process
kill -9 <PID>
```

### MCP Classification Failing
Ensure you have either:
- `GROQ_API_KEY` set (for Groq LLM)
- Or local llama.cpp running with `LLAMACPP_API_BASE`

## Development Workflow

1. **Start Services:** `./launch.sh`
2. **Make Changes:** Edit code in `src/` or `mcps/`
3. **Restart Service:** `Ctrl+C` then `./launch.sh` again
4. **Test:** `./utils.sh test-rag` or `./utils.sh test-mcp`
5. **Check Logs:** `./utils.sh logs`

## Old Launch Scripts (Deprecated)

The following scripts are superseded by the new orchestrator:
- ~~`scripts/launch_medgemma_rag.sh`~~ → Use `./launch.sh`
- ~~`scripts/start_medgemma_api.sh`~~ → Use `./launch.sh`
- ~~`mcps/launch.sh`~~ → Use `./launch.sh`

These remain for reference but are no longer maintained.
