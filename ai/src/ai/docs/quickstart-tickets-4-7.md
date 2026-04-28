# Quick Start: Clinical RAG Pipeline (Tickets 4-7)

## 5-Minute Setup

```bash
cd /home/belal/AI_System

# Test individual components
PYTHONPATH=/home/belal/AI_System python3 src/ingestion/preprocessor.py
PYTHONPATH=/home/belal/AI_System python3 src/ingestion/patient_state.py
PYTHONPATH=/home/belal/AI_System python3 src/retrieval/indexing.py
PYTHONPATH=/home/belal/AI_System python3 src/retrieval/query_understanding.py

# Run full integration test
PYTHONPATH=/home/belal/AI_System python3 scripts/test_integration_tickets_4_7.py
```

## Quick API Reference

### 1. Preprocess Timeline

```python
from src.ingestion.preprocessor import preprocess_json_file

result = preprocess_json_file("Data/data.json")
timeline = result["timeline"]  # Sorted chronologically
eoc_id = result["eoc_id"]
stats = result["statistics"]
```

### 2. Compile Patient State

```python
from src.ingestion.patient_state import PatientStateCompiler

patient_state = PatientStateCompiler.compile_state(timeline, eoc_id)

print(patient_state.active_diagnosis)      # ['Final Diagnosis: Mycoplasma Pneumonia']
print(patient_state.allergies)             # ['Amoxicillin (penicillin-class)']
print(patient_state.recent_medications)    # ['Azithromycin']
print(patient_state.clinical_status)       # 'Improved'
```

### 3. Build RAG Documents

```python
from src.retrieval.indexing import DocumentBuilder, ContextualRetriever

# Build documents
documents = DocumentBuilder.build_document_collection(timeline)

# Initialize retriever
retriever = ContextualRetriever(patient_state, documents)

# Query-specific retrieval
diag_docs = retriever.get_diagnosis_timeline()
med_docs = retriever.get_medication_history()
allergy_docs = retriever.get_allergy_events()
```

### 4. Process Queries

```python
from src.retrieval.query_understanding import QueryUnderstanding

# Initialize
query_processor = QueryUnderstanding(patient_state)

# Process query
context = query_processor.process_query("What diagnoses were considered?")

print(context.intent)                 # 'diagnosis'
print(context.rewritten_query)        # Augmented with patient context
print(context.requires_diagnosis_filter)  # True

# Get relevant documents
docs = retriever.get_context_for_query(context.intent.value)
```

## Common Queries

```python
# Summary
context = query_processor.process_query("Summarize this case")

# Diagnosis reasoning
context = query_processor.process_query("Why was Mycoplasma diagnosed?")

# Medication + Allergies
context = query_processor.process_query("What medications were prescribed?")
# Note: Automatically includes allergy warnings!

# Timeline
context = query_processor.process_query("When did symptoms change?")

# Outcome
context = query_processor.process_query("What was the clinical outcome?")
```

## Output Files

After running tests, check:

```bash
ls -lh Data/
# normalized_timeline.json       - Ticket 4 output
# patient_state.json             - Ticket 5 output  
# sample_documents.json          - Ticket 6 output
# sample_query_contexts.json     - Ticket 7 output
# pipeline_integration_test.json - Full E2E results
```

## Module Map

```
src/ingestion/preprocessor.py      → Ticket 4: Preprocessing
src/ingestion/patient_state.py     → Ticket 5: Patient State  
src/retrieval/indexing.py          → Ticket 6: RAG Indexing
src/retrieval/query_understanding.py → Ticket 7: Query Understanding
```

## Key Classes

```python
# Ticket 4
from src.ingestion.preprocessor import (
    ClinicalPreprocessor,
    NormalizedNode,
    EventTag,
    DiagnosisType,
    preprocess_json_file
)

# Ticket 5
from src.ingestion.patient_state import (
    PatientStateCompiler,
    PatientState
)

# Ticket 6
from src.retrieval.indexing import (
    DocumentBuilder,
    ClinicalDocument,
    ContextualRetriever,
    IndexStrategy
)

# Ticket 7
from src.retrieval.query_understanding import (
    QueryUnderstanding,
    QueryIntent,
    QueryContext
)
```

## Event Tags

```python
EventTag.SYMPTOM             # "HPI: Cough and fatigue"
EventTag.DIAGNOSIS           # "Final Diagnosis: Pneumonia"
EventTag.MEDICATION          # "Prescribed Azithromycin"
EventTag.ALLERGY_ADVERSE     # "Adverse reaction confirmed"
EventTag.FOLLOW_UP_OUTCOME   # "Patient improved"
EventTag.INVESTIGATION       # "Chest X-Ray ordered"
```

## Query Intents

```python
QueryIntent.SUMMARY          # Case overview
QueryIntent.DIAGNOSIS        # Diagnosis questions
QueryIntent.DIFFERENTIAL     # Why X vs Y?
QueryIntent.MEDICATION       # Drug history
QueryIntent.ALLERGY          # Adverse events
QueryIntent.CHANGE_TRACKING  # Longitudinal changes
QueryIntent.TIMELINE         # When did X happen?
QueryIntent.OUTCOME          # Current status
```

## Testing

```bash
# Quick validation
python3 scripts/test_integration_tickets_4_7.py

# Expected output:
# ✓ Preprocessed 10 clinical events
# ✓ Compiled patient state with 1 active diagnosis
# ✓ Indexed 10 clinical documents
# ✓ Processed 5 test queries
# ✓ ALL TESTS PASSED - SYSTEM READY FOR RAG
```

## Next Integration Points

```python
# Ready for:
# 1. Generate embeddings
from src.ingestion.service import IngestionService
embedding = IngestionService.get_embedding(doc.content)

# 2. Store in Qdrant
# Use doc.dict() with embedding for point creation

# 3. Create graph edges
# Use node.father_id for parent-child relationships

# 4. Query with MedGemma
# Use context.rewritten_query as LLM prompt
# Include retrieved docs as context
```

## Troubleshooting

**Import errors?**
```bash
export PYTHONPATH=/home/belal/AI_System:$PYTHONPATH
```

**Pydantic warnings?**
Normal - using Pydantic V2 with backward compatibility.

**No documents retrieved?**
Check query intent - some intents return full timeline by default.

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-01-25
