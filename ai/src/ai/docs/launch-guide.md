# MedGemma RAG Quick Launch Guide

##  One-Command Launch

```bash
./scripts/launch_medgemma_rag.sh
```

This starts:
-  **Qdrant** (Docker container on port 6333)
-  **llama.cpp server** (MedGemma 1.5 on port 8000)
-  **Streamlit UI** (Interactive interface on port 8501)

##  Prerequisites

1. **Qdrant Docker**: Already in docker-compose.yml
2. **llama.cpp built**: `./llama.cpp/build/bin/llama-server` must exist
3. **MedGemma model**: `models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf`
4. **Python dependencies**: `pip install -r requirements.txt`

##  First Time Setup

### Step 1: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 2: Start Services
```bash
./scripts/launch_medgemma_rag.sh
```

### Step 3: Seed Sample Data
In another terminal:
```bash
python scripts/seed_sample_data.py
```

This creates:
- 3 sample patients
- 4 clinical observations
- 2 conditions (diabetes, hypertension)

### Step 4: Open UI
Open your browser to: **http://localhost:8501**

##  Using the Interface

### Chat Tab 
- Ask medical questions
- Get AI-generated answers with context
- Filter by patient ID
- Adjust top-k retrieval
- Custom system prompts

**Example queries:**
- "What are the symptoms of diabetes?"
- "What is patient-001's glucose level?"
- "Explain hypertension treatment"

### Retrieval Test Tab 
- Test vector search without generation
- See similarity scores
- View retrieved contexts
- Patient filtering

### Data Browser Tab 
- View Qdrant collection stats
- Browse sample data
- Retrieve by ID
- Check data quality

##  Configuration

### Adjust RAG Settings (Sidebar)
- **Top-K**: Number of contexts to retrieve (1-10)
- **Temperature**: Generation randomness (0.0-1.0)
- **Patient Filter**: Limit search to specific patient
- **Custom Prompt**: Override system prompt

##  Service Status

The sidebar shows real-time status:
-  **Green**: Service running
- ️ **Yellow**: Warning/degraded
-  **Red**: Service down

##  Stopping Services

Press `Ctrl+C` in the terminal running the launch script.

This will gracefully shut down:
1. llama-server
2. Streamlit
3. (Qdrant stays running in Docker)

To stop Qdrant:
```bash
docker-compose down qdrant
```

##  Logs

Logs are saved to `logs/`:
- `logs/llama-server.log` - MedGemma server logs
- `logs/streamlit.log` - Streamlit UI logs

View in real-time:
```bash
tail -f logs/llama-server.log
tail -f logs/streamlit.log
```

##  Checking What Data is in Qdrant

### Option 1: Streamlit UI
1. Open http://localhost:8501
2. Go to **Data Browser** tab
3. Click "Load Sample"

### Option 2: Python Script
```python
from src.shared.db_clients import qdrant_client

client = qdrant_client.connect()
collection = qdrant_client.collection_name

# Get collection info
info = client.get_collection(collection)
print(f"Total points: {info.points_count}")

# Get sample data
points = client.scroll(collection, limit=10)[0]
for point in points:
    print(f"\nID: {point.id}")
    print(f"Patient: {point.payload.get('patient_id')}")
    print(f"Type: {point.payload.get('resource_type')}")
    print(f"Content: {point.payload.get('toon_content')[:100]}...")
```

### Option 3: Direct API
```bash
# Collection info
curl http://localhost:6333/collections/clinical_snapshots

# Sample points
curl -X POST http://localhost:6333/collections/clinical_snapshots/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 5, "with_payload": true, "with_vector": false}'
```

### Option 4: Check Script
```bash
python scripts/check_medgemma_setup.py
```

##  Troubleshooting

### Qdrant not connecting
```bash
docker-compose up -d qdrant
curl http://localhost:6333/collections
```

### llama-server fails to start
- Check model path exists
- Check logs: `cat logs/llama-server.log`
- Ensure no other process on port 8000
- GPU drivers loaded (for `--n-gpu-layers -1`)

### Streamlit not loading
- Check logs: `cat logs/streamlit.log`
- Port 8501 available
- Dependencies installed

### No data in Qdrant
```bash
python scripts/seed_sample_data.py
```

### Port already in use
```bash
# Find what's using the port
lsof -i :8000  # llama-server
lsof -i :8501  # streamlit
lsof -i :6333  # qdrant

# Kill if needed
kill <PID>
```

##  Example Workflow

1. **Launch everything**
   ```bash
   ./scripts/launch_medgemma_rag.sh
   ```

2. **Seed data** (first time only)
   ```bash
   python scripts/seed_sample_data.py
   ```

3. **Open UI**: http://localhost:8501

4. **Test retrieval**
   - Go to "Retrieval Test" tab
   - Query: "diabetes"
   - See what contexts are found

5. **Chat with RAG**
   - Go to "Chat" tab
   - Ask: "What are diabetes symptoms?"
   - See AI answer with retrieved context

6. **Patient-specific**
   - Set Patient ID: "patient-001"
   - Ask: "What is this patient's condition?"
   - Get filtered results

##  Related Documentation

- [MedGemma RAG Quickstart](../docs/medgemma-rag-quickstart.md)
- [MedGemma RAG Summary](../docs/medgemma-rag-summary.md)
- [API Documentation](../docs/medgemma-rag-quickstart.md#api-endpoints)

##  Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Streamlit UI | http://localhost:8501 | Interactive testing interface |
| llama-server | http://localhost:8000 | MedGemma API |
| Qdrant | http://localhost:6333 | Vector database |
| Qdrant Dashboard | http://localhost:6333/dashboard | Web UI (if enabled) |

---

**Quick Commands:**
```bash
# Start everything
./scripts/launch_medgemma_rag.sh

# Seed data
python scripts/seed_sample_data.py

# Check setup
python scripts/check_medgemma_setup.py

# Stop everything
# Press Ctrl+C in launch terminal
# Then: docker-compose down qdrant
```
