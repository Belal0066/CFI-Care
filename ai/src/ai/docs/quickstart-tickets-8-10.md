# Quick Start: Tickets 8-10 (Context Retrieval + Reasoning + Response)

## What Was Built

**Tickets 8-10** complete the RAG pipeline:
- **Ticket 8**: Context Retrieval - Intent-based document filtering
- **Ticket 9**: Clinical Reasoning - Bounded reasoning engine
- **Ticket 10**: Response Generation - Citation-enforced responses

## Files Created

```
src/retrieval/context_retrieval.py    (527 lines)
src/agent/clinical_reasoning.py       (578 lines)
scripts/test_integration_tickets_8_10.py
docs/tickets-8-10-implementation.md
```

## Test It

```bash
cd /home/belal/AI_System
PYTHONPATH=/home/belal/AI_System python3 scripts/test_integration_tickets_8_10.py
```

**Expected Output:**
```
✓ Processed 5 queries successfully
✓ Generated 5 clinical responses
✓ All responses include citations and temporal context
✓ Safety constraints validated
✓ Sample response exported to: Data/tickets_8_10_sample.json
```

## API Usage

### Complete Pipeline (Tickets 4-10)

```python
import json
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder
from src.retrieval.query_understanding import IntentClassifier, QueryRewriter
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner

# 1. Load and preprocess data (Ticket 4)
with open("Data/data.json", 'r') as f:
    raw_data = json.load(f)

preprocessor = ClinicalPreprocessor()
result = preprocessor.preprocess_timeline(raw_data)
normalized_nodes = result['timeline']
eoc_id = result['eoc_id']

# 2. Compile patient state (Ticket 5)
compiler = PatientStateCompiler()
patient_state = compiler.compile_state(normalized_nodes, eoc_id)

# 3. Build document collection (Ticket 6)
doc_builder = DocumentBuilder()
documents = doc_builder.build_document_collection(normalized_nodes)

# 4. Understand query (Ticket 7)
query = "What diagnoses were considered?"
intent_classifier = IntentClassifier()
query_rewriter = QueryRewriter()

intent, confidence = intent_classifier.classify(query)

from src.retrieval.query_understanding import QueryContext
query_context = QueryContext(
    original_query=query,
    intent=intent,
    confidence=confidence,
    rewritten_query=query_rewriter.rewrite_for_intent(query, QueryContext(
        original_query=query,
        intent=intent,
        confidence=confidence,
        rewritten_query=query
    ), patient_state)
)

# 5. Retrieve context (Ticket 8)
retriever = ContextRetriever(documents, patient_state)
retrieval_context = retriever.retrieve(query_context)

# 6. Generate response (Tickets 9-10)
reasoner = ClinicalReasoner(retrieval_context)
response = reasoner.reason()

# 7. Output
print(response.format_response())
print(f"\n✓ {len(response.claims)} claims cited")
print(f"✓ Confidence: {response.confidence}")
print(f"✓ Sources: {len(response.source_document_ids)} documents")
```

## Retrieval Strategies

| Query Intent | What Gets Retrieved |
|-------------|---------------------|
| **SUMMARY** | All nodes in timeline |
| **DIAGNOSIS** | Only diagnosis nodes (isDiagnosis=true) |
| **DIFFERENTIAL** | Diagnosis + symptoms + investigations + allergies |
| **MEDICATION** | Medications + related diagnoses + allergies |
| **ALLERGY** | Allergies + related medications + diagnoses |
| **CHANGE_TRACKING** | Symptoms + diagnoses + outcomes |
| **TREND_ANALYSIS** | Symptoms + outcomes over time |
| **RATIONALE** | Diagnoses + supporting evidence |
| **TIMELINE** | All nodes sorted chronologically |
| **OUTCOME** | Final diagnosis + last medication + outcomes |

## Response Structure

```json
{
  "original_query": "string",
  "intent": "diagnosis|differential|medication|...",
  "explanation": "Human-readable clinical analysis",
  "claims": [
    {
      "claim": "Clinical statement",
      "source_node_ids": ["node_id_1", "node_id_2"],
      "temporal_context": "2025-12-03"
    }
  ],
  "temporal_summary": "Chronological timeline of events",
  "has_insufficient_data": false,
  "contains_speculation": false,
  "source_document_ids": ["list", "of", "all", "source", "nodes"],
  "confidence": "High|Medium|Low|Insufficient",
  "sources": ["Formatted citation strings"]
}
```

## Safety Constraints

✅ **Enforced Automatically:**
1. All claims must have `source_node_ids`
2. Citations must reference available documents
3. No speculation beyond documented facts
4. Temporal context required for all responses
5. Confidence level based on data completeness

## Common Use Cases

### 1. Get Diagnostic Progression
```python
query = "What diagnoses were considered?"
# Intent: diagnosis
# Retrieves: Only diagnosis nodes
# Response: Temporal progression with reasoning
```

### 2. Explain Differential Diagnosis
```python
query = "Why was Mycoplasma diagnosed over Bronchitis?"
# Intent: differential
# Retrieves: Diagnoses + supporting evidence
# Response: Evidence-based explanation with citations
```

### 3. Check Medications and Allergies
```python
query = "What medications were prescribed?"
# Intent: medication
# Retrieves: Meds + diagnoses + allergies
# Response: Medication list with allergy warnings
```

### 4. Track Symptom Evolution
```python
query = "How did symptoms change over time?"
# Intent: change_tracking
# Retrieves: Symptoms + diagnoses + outcomes
# Response: Temporal symptom progression
```

### 5. Get Final Outcome
```python
query = "What was the final outcome?"
# Intent: outcome
# Retrieves: Final diagnosis + last med + outcomes
# Response: Current status summary
```

## Debugging

### Check Retrieved Documents
```python
retrieval_context = retriever.retrieve(query_context)
print(f"Retrieved: {len(retrieval_context.retrieved_documents)} docs")
print(f"Date range: {retrieval_context.date_range}")
print(f"Events: {retrieval_context.event_counts}")
```

### Validate Citations
```python
response = reasoner.reason()
print(f"Claims: {len(response.claims)}")
for claim in response.claims:
    print(f"  • {claim.claim}")
    print(f"    Sources: {claim.source_node_ids}")
```

### Check Safety Flags
```python
print(f"Insufficient data: {response.has_insufficient_data}")
print(f"Contains speculation: {response.contains_speculation}")
print(f"Confidence: {response.confidence}")
```

## Test Results

**5 Test Queries:**
1. Diagnostic progression (diagnosis intent) → 3 docs retrieved
2. Differential analysis (differential intent) → 9 docs retrieved
3. Medication history (medication intent) → 6 docs retrieved
4. Symptom evolution (change_tracking intent) → 6 docs retrieved
5. Final outcome (outcome intent) → 3 docs retrieved

**All Tests Passed:**
- ✅ 100% citation coverage (no uncited claims)
- ✅ 0% invalid citations
- ✅ 100% temporal context coverage
- ✅ All safety constraints validated

## Architecture

```
Query
  ↓
Intent Classification (Ticket 7)
  ↓
Context Retrieval (Ticket 8) ← Intent-based filtering
  ↓
Clinical Reasoning (Ticket 9) ← Bounded reasoning
  ↓
Response Generation (Ticket 10) ← Citation enforcement
  ↓
Structured JSON + Formatted Text
```

## Key Features

### Intent-Based Retrieval
- Automatic routing based on query understanding
- 10 specialized retrieval strategies
- Patient-specific context filtering

### Bounded Reasoning
- Operates ONLY on retrieved documents
- No external knowledge allowed
- Data sufficiency validation
- Confidence scoring

### Citation Enforcement
- Every claim requires source node IDs
- Temporal context for all claims
- Traceability from response to source
- Invalid citation detection

## Validation Checks

Run after each query:
```python
# Check 1: All claims cited
assert all(claim.source_node_ids for claim in response.claims)

# Check 2: Valid citations only
available_ids = {doc.node_id for doc in retrieval_context.retrieved_documents}
all_cited = set()
for claim in response.claims:
    all_cited.update(claim.source_node_ids)
assert all_cited.issubset(available_ids)

# Check 3: No speculation
assert not response.contains_speculation

# Check 4: Temporal context present
assert len(response.temporal_summary.strip()) > 0

# Check 5: Valid confidence
assert response.confidence in ["High", "Medium", "Low", "Insufficient"]
```

## Known Limitations

1. **No Vector Search**: Uses rule-based filtering, not semantic similarity
2. **No Token Management**: Doesn't limit docs for LLM context windows
3. **No Graph Traversal**: Doesn't use FalkorDB relationships
4. **Simple Deduplication**: Manual node_id-based (ClinicalDocument not hashable)
5. **No Caching**: Retrieval results not cached

## Next Steps

To integrate with actual LLM:
1. Pass `response.explanation` as context to LLM
2. Include `response.temporal_summary` for temporal awareness
3. Reference `response.source_document_ids` for citations
4. Check `response.has_insufficient_data` before generating
5. Set `response.confidence` based on data completeness

---

## Quick Reference

**Test Command:**
```bash
PYTHONPATH=/home/belal/AI_System python3 scripts/test_integration_tickets_8_10.py
```

**Main Classes:**
- `ContextRetriever` - Intent-based document retrieval
- `RetrievalContext` - Container for query + docs + patient state
- `ClinicalReasoner` - Bounded reasoning engine
- `ClinicalResponse` - Structured output with citations
- `CitedClaim` - Individual claim with sources

**Key Files:**
- `src/retrieval/context_retrieval.py` - Retrieval strategies
- `src/agent/clinical_reasoning.py` - Reasoning + response generation
- `scripts/test_integration_tickets_8_10.py` - Integration tests
- `Data/tickets_8_10_sample.json` - Sample output

**Status:** ✅ All tickets 8-10 complete and tested
