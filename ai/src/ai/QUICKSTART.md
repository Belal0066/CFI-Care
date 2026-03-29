#  System Ready!

##  Quick Start (2 Commands)

```bash
# 1. Launch everything (Qdrant + llama-server + Streamlit)
./scripts/launch_medgemma_rag.sh

# 2. Seed sample data (in another terminal)
python scripts/quick_seed_rag.py
```

Then open: **http://localhost:8501**

---

##  What Data Is In Qdrant?

### Option 1: Streamlit UI  (Easiest)
1. Open http://localhost:8501
2. Go to **"Data Browser"** tab
3. Click **"Load Sample"**
4. Browse all 12 clinical records

### Option 2: Python
```python
from src.shared.db_clients import qdrant_client

client = qdrant_client.connect()
info = client.get_collection('clinical_embeddings')
print(f"Total points: {info.points_count}")  # Should show 12

# Get samples
points = client.scroll('clinical_embeddings', limit=5)[0]
for p in points:
    print(f"{p.payload['id']}: {p.payload['toon_content'][:80]}...")
```

### Option 3: CLI
```bash
# Collection info
curl http://localhost:6333/collections/clinical_embeddings

# Count points
curl http://localhost:6333/collections/clinical_embeddings | jq '.result.points_count'
```

---

##  Sample Data Included

The `quick_seed_rag.py` script creates **12 records**:

### 3 Patients
- **patient-001**: Sarah Johnson (Type 2 Diabetes)
- **patient-002**: Michael Williams (Hypertension)
- **patient-003**: Emily Davis (Healthy)

### 4 Observations
- Blood glucose (180 mg/dL) - patient-001
- HbA1c (7.2%) - patient-001  
- Blood pressure (150/95) - patient-002
- Heart rate (72 bpm) - patient-003

### 2 Conditions
- Type 2 Diabetes Mellitus
- Essential Hypertension

### 3 Medical Knowledge
- Diabetes symptoms
- Diabetes treatment
- Hypertension treatment

All embedded with **ModernPubMedBERT** (768-dim vectors) in Qdrant.

---

##  Test It Now!

### Interactive Chat (Streamlit)
```bash
# Should already be running from launcher
# Open: http://localhost:8501
```

**Try these queries:**
- "What are the symptoms of diabetes?"
- "Show me patient-001's glucose level"
- "What conditions does patient-002 have?"
- "How to treat hypertension?"

** NEW: Image Analysis**
- Upload medical images (X-ray, CT, MRI)
- Ask: "What abnormalities do you see in this image?"
- MedGemma 1.5 analyzes images with vision support
- See [docs/vision-support.md](docs/vision-support.md) for details

### Command Line Testing
```bash
# Interactive mode
python scripts/test_medgemma_rag.py --interactive

# Run examples
python examples/medgemma_rag_example.py

# Start REST API
./scripts/start_medgemma_api.sh
# Then: curl -X POST http://localhost:8001/query \
#   -H "Content-Type: application/json" \
#   -d '{"query": "diabetes symptoms"}'
```

---

##  Configuration Fixed

The Pydantic validation errors are now **resolved**. Added these fields to `src/shared/config.py`:

```python
# SGLang Configuration
use_sglang: bool = False
sglang_base_url: str = "http://localhost:30000"
sglang_model: str = "/home/belal/AI_System/models/medgemma-1.5-4b-it"

# LLM Backend Selection
llm_backend: str = "local"  # or "lightning"

# Local llama.cpp (4B)
llamacpp_base_url: str = "http://localhost:8000"
llamacpp_model: str = "medgemma-1.5-4b-it-Q6_K.gguf"

# Lightning AI (27B) — used when llm_backend="lightning"
lightning_base_url: str = "https://<id>-8000.<region>.studios.lightning.ai/v1"
lightning_model_name: str = "google/medgemma-27b-it"
lightning_access_token: str = ""

# Logging
log_level: str = "INFO"
```

---

##  Key Files

| File | Purpose |
|------|---------|
| [scripts/launch_medgemma_rag.sh](scripts/launch_medgemma_rag.sh) | **Master launcher** - starts all services |
| [scripts/quick_seed_rag.py](scripts/quick_seed_rag.py) | **Quick data seeding** |
| [src/ui/streamlit_rag_app.py](src/ui/streamlit_rag_app.py) | **Interactive web UI** |
| [src/retrieval/medgemma_rag.py](src/retrieval/medgemma_rag.py) | **RAG pipeline** |
| [src/shared/config.py](src/shared/config.py) | **Configuration** (fixed) |

---

##  What's Running

After running the launcher:

| Service | Port | Status |
|---------|------|--------|
| **Qdrant** | 6333 |  Running (Docker) |
| **llama-server** | 8000 |  Running (MedGemma 1.5) |
| **Streamlit UI** | 8501 |  Running (Web interface) |

Check status:
```bash
python scripts/check_medgemma_setup.py
```

---

##  Typical Workflow

1. **Start services** → `./scripts/launch_medgemma_rag.sh`
2. **Seed data** → `python scripts/quick_seed_rag.py` (first time)
3. **Open UI** → http://localhost:8501
4. **Browse data** → Click "Data Browser" tab
5. **Test retrieval** → "Retrieval Test" tab
6. **Chat** → "Chat" tab, ask questions
7. **Stop** → `Ctrl+C` in launcher terminal

---

##  Stopping

Press `Ctrl+C` in the launcher terminal.

To also stop Qdrant:
```bash
docker-compose down qdrant
```

---

##  Documentation

- [Complete System Guide](docs/complete-system-guide.md)
- [Launch Guide](docs/launch-guide.md)
- [MedGemma RAG Quickstart](docs/medgemma-rag-quickstart.md)

---

##  Success!

You now have:
-  Working MedGemma RAG system
-  12 sample clinical records in Qdrant
-  Interactive Streamlit UI
-  All configuration issues resolved
-  One-command launch script

**Next**: Open http://localhost:8501 and start chatting! 
