# Web UI Usage Guide

## Overview

The Clinical RAG System has a Streamlit web interface with 4 main pages:

## Pages

### 1. System Status
Monitor health of all services:
- Qdrant (Vector DB)
- FalkorDB (Graph DB)  
- MedGemma LLM Server
- Backend API

### 2. Data Ingestion
**For FHIR Bundles Only**

Upload FHIR JSON bundles (resourceType: "Bundle") for standard FHIR resource ingestion.

**⚠️ Important:** If you have a clinical timeline JSON file (like `Data/data.json`), **DO NOT** use this tab. Use **Page 4: Clinical Reasoning** instead.

**Supported Formats:**
- FHIR Bundle with entries
- FHIR Resource arrays
- Single FHIR resources

**Not Supported Here:**
- Clinical timeline JSON (nodes + eocId format)
  → Use **Clinical Reasoning** page

### 3. Clinical Assistant (Legacy)
MedGemma RAG interface with two modes:
- **Local RAG**: Query Qdrant vector database
- **Internet MCP**: Query PubMed, OpenFDA, NIH

**Use cases:**
- General medical knowledge queries
- Literature search
- Drug interaction checks

### 4. Clinical Reasoning ⭐ **RECOMMENDED**

**Deterministic, Citation-Backed Clinical Analysis**

This is the **NEW** integrated pipeline (Tickets 4-10) for patient timeline analysis.

#### How to Use:

**Step 1: Load Patient Data**
- Click "📁 Load Default Data" button in sidebar
  - Loads `Data/data.json` automatically
- OR upload your own clinical timeline JSON file
  - Must have `nodes` array and `eocId` field

**Step 2: Verify Patient State**
After loading, sidebar shows:
- EOC ID
- Total encounters
- Date range
- Active diagnoses
- Allergies
- Recent medications
- Clinical status

**Step 3: Ask Questions**

**Quick Questions (Buttons):**
- "What diagnoses were considered?"
- "What medications were prescribed?"
- "What was the final outcome?"

**Custom Queries:**
Type any clinical question in the text box:
- "Why was Mycoplasma Pneumonia diagnosed over Bronchitis?"
- "How did symptoms change over time?"
- "Are there any drug allergies?"
- "Show me the timeline of events"
- "Explain the rationale for the final diagnosis"

**Step 4: View Response**

Each response includes:
- **Intent Classification**: What type of question (diagnosis, medication, etc.)
- **Confidence Score**: How confident the system is
- **Clinical Analysis**: Evidence-based explanation
- **Timeline View**: Chronological context
- **Citations**: Every claim linked to source events with node IDs
- **Safety Flags**: Warnings if data insufficient or speculation detected

#### Three Tabs:

**💬 Clinical Chat**
- Main Q&A interface
- Conversation history
- Expandable responses with full citations

**📊 Patient Timeline**
- Chronological event visualization
- Statistics (diagnoses, medications, symptoms)
- Event type filtering

**🔍 Query Analysis**
- Test how queries are classified
- See which documents are retrieved
- Debug query understanding

## Expected Data Format

### Clinical Timeline JSON (Page 4)

```json
{
  "nodes": [
    {
      "id": "enc-123...",
      "text_1": "Primary text",
      "father": "parent-id or null",
      "relationshipType": "association",
      "category": "Consultation|Prescription|Imaging|etc",
      "priority": "High|Medium|Low",
      "normality": "Normal|Abnormal",
      "dateIssued": "2025-12-01",
      "details": "Additional details",
      "isDiagnosis": true|false,
      "isManualBranch": true|false,
      "relatedResourceIds": {},
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ],
  "eocId": "eoc-uuid-here"
}
```

### FHIR Bundle (Page 2)

```json
{
  "resourceType": "Bundle",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "patient-123",
        ...
      }
    }
  ]
}
```

## Common Issues

### Issue 1: "Failed to ingest resource: Resource must have an ID"
**Solution:** You're trying to ingest a clinical timeline in the FHIR ingestion tab.
- Navigate to **Page 4: Clinical Reasoning**
- Use the file uploader there instead

### Issue 2: "Please load patient data from the sidebar"
**Solution:** Click "📁 Load Default Data" button in the left sidebar first.

### Issue 3: No questions appearing in chat history
**Solution:** 
1. Verify patient data is loaded (check sidebar shows patient state)
2. Type question and click "🔍 Analyze" button
3. Wait for processing (may take 1-2 seconds)

### Issue 4: Citations not showing
**Solution:** All citations are in expandable sections:
- Click "Citations (X claims)" expander
- Each claim shows source node IDs

## Performance

- **Data Loading:** <1 second for 10 nodes
- **Query Processing:** <300ms average
- **Citation Generation:** 100% coverage (all claims cited)

## Quick Start

```bash
# Terminal 1: Start all services
./launch.sh

# Terminal 2: Start dashboard  
./launch_dashboard.sh

# Browser: Open http://localhost:8511
```

**Then:**
1. Navigate to **Clinical Reasoning** (Page 4)
2. Click "📁 Load Default Data"
3. Click any quick question button or type your own
4. View response with citations

## Validation

To verify system is working correctly:

```bash
PYTHONPATH=$PWD python3 scripts/validate_system.py
```

Expected: `✅ ALL VALIDATION TESTS PASSED (23/23)`

## Support

See [SYSTEM_READY.md](SYSTEM_READY.md) for full system documentation.
