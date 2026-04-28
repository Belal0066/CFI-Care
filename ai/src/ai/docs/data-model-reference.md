# NormalizedNode vs ClinicalDocument Attribute Reference

## Quick Reference for UI Development

When working with patient data in the UI, you'll encounter two different data models. Here's the correct attribute mapping:

## NormalizedNode (from Preprocessing)

Used in: `src/ui/pages/4_Clinical_Reasoning.py` when loading data

```python
from src.ingestion.preprocessor import NormalizedNode

# Correct attributes:
node.id                    # str - Encounter ID
node.eoc_id               # str - Episode of Care ID
node.date_issued          # datetime - Use for sorting, convert to string with .date()
node.date_normalized      # str - ISO-8601 string
node.text_primary         # str - Main clinical text (was text_1 in JSON)
node.details              # str - Additional clinical details
node.father_id            # Optional[str] - Parent node ID
node.relationship_type    # Optional[str] - Relationship to parent
node.category             # ClinicalCategory - Consultation, Prescription, etc.
node.normality            # Normality - Normal, Abnormal
node.priority             # str - High, Medium, Low
node.is_diagnosis         # bool - Is this a diagnosis?
node.diagnosis_type       # DiagnosisType - Provisional, Differential, Final
node.event_tag            # EventTag - Symptom, Diagnosis, Medication, etc.
node.is_manual_branch     # bool
node.related_resource_ids # Dict[str, List[str]]
node.created_at           # Optional[datetime]
node.updated_at           # Optional[datetime]
```

### ❌ WRONG Attributes (Don't exist on NormalizedNode)
```python
node.date_unix           # ❌ Use node.date_issued instead (datetime object)
node.text_secondary      # ❌ Use node.details instead
node.text_1              # ❌ Use node.text_primary instead
node.dateIssued          # ❌ Use node.date_issued instead
node.isDiagnosis         # ❌ Use node.is_diagnosis instead
node.father              # ❌ Use node.father_id instead
```

## ClinicalDocument (from RAG Indexing)

Used in: Context retrieval, clinical reasoning responses

```python
from src.retrieval.indexing import ClinicalDocument

# Correct attributes:
doc.doc_id               # str - Document ID (same as node_id)
doc.node_id              # str - Source node ID
doc.eoc_id               # str - Episode of Care ID
doc.content              # str - Combined text for embedding
doc.content_primary      # str - Primary text only
doc.content_details      # str - Details only
doc.date_issued          # str - ISO-8601 string (use [:10] for date part)
doc.date_unix            # int - Unix timestamp (for range queries)
doc.category             # str - Clinical category
doc.event_tag            # str - Event classification
doc.is_diagnosis         # bool
doc.diagnosis_type       # Optional[str]
doc.normality            # str
doc.priority             # str
doc.father_id            # Optional[str]
doc.relationship_type    # Optional[str]
doc.is_root              # bool
doc.is_allergy           # bool - Search flag
doc.is_medication        # bool - Search flag
doc.is_symptom           # bool - Search flag
doc.is_outcome           # bool - Search flag
```

## Common UI Patterns

### Pattern 1: Display Timeline (NormalizedNode)
```python
# ✅ CORRECT
for node in sorted(nodes, key=lambda n: n.date_issued):
    st.markdown(f"**{node.date_issued.date()}**")  # Convert datetime to date
    st.markdown(f"{node.text_primary}")
    if node.details:
        st.caption(node.details)
```

```python
# ❌ WRONG
for node in sorted(nodes, key=lambda n: n.date_unix):  # AttributeError!
    st.markdown(f"**{node.date_issued[:10]}**")  # TypeError! (datetime not subscriptable)
    if node.text_secondary:  # AttributeError!
        st.caption(node.text_secondary)
```

### Pattern 2: Display Retrieved Documents (ClinicalDocument)
```python
# ✅ CORRECT
for doc in documents:
    st.markdown(f"**{doc.date_issued[:10]}**")  # String slicing OK
    st.markdown(f"{doc.content_primary}")
    if doc.content_details:
        st.caption(doc.content_details)
```

### Pattern 3: Filter by Date (ClinicalDocument)
```python
# ✅ CORRECT - Use date_unix for range queries
start_unix = int(datetime(2025, 12, 1).timestamp())
end_unix = int(datetime(2025, 12, 31).timestamp())

filter = {
    "must": [
        {"key": "date_unix", "range": {"gte": start_unix, "lte": end_unix}}
    ]
}
```

### Pattern 4: Sort Events Chronologically
```python
# ✅ CORRECT - NormalizedNode
sorted_nodes = sorted(nodes, key=lambda n: n.date_issued)  # datetime sorting

# ✅ CORRECT - ClinicalDocument
sorted_docs = sorted(docs, key=lambda d: d.date_unix)  # int sorting
# OR
sorted_docs = sorted(docs, key=lambda d: d.date_issued)  # string sorting (ISO-8601)
```

## Type Conversion

### NormalizedNode → ClinicalDocument
```python
from src.retrieval.indexing import DocumentBuilder

doc = DocumentBuilder.build_document(node)
# Converts:
# - node.text_primary + node.details → doc.content
# - node.text_primary → doc.content_primary
# - node.details → doc.content_details
# - node.date_issued (datetime) → doc.date_issued (str), doc.date_unix (int)
```

## Common Errors and Fixes

| Error | Root Cause | Fix |
|-------|-----------|-----|
| `AttributeError: 'NormalizedNode' object has no attribute 'date_unix'` | Using `node.date_unix` | Use `node.date_issued` (datetime) |
| `AttributeError: 'NormalizedNode' object has no attribute 'text_secondary'` | Using `node.text_secondary` | Use `node.details` |
| `TypeError: 'datetime.datetime' object is not subscriptable` | Using `node.date_issued[:10]` | Use `node.date_issued.date()` or `node.date_normalized[:10]` |
| `AttributeError: 'ClinicalDocument' object has no attribute 'date_issued'` on datetime | Using `doc.date_issued` as datetime | It's a string, use `doc.date_unix` for numeric sorting |

## Testing Commands

### Test NormalizedNode attributes
```bash
PYTHONPATH=$PWD python3 -c "
from src.ingestion.preprocessor import ClinicalPreprocessor
import json

with open('Data/data.json') as f:
    data = json.load(f)

preprocessor = ClinicalPreprocessor()
result = preprocessor.preprocess_timeline(data)
node = result['timeline'][0]

print(f'ID: {node.id}')
print(f'Date: {node.date_issued} (type: {type(node.date_issued).__name__})')
print(f'Text: {node.text_primary}')
print(f'Details: {node.details}')
"
```

### Test ClinicalDocument attributes
```bash
PYTHONPATH=$PWD python3 -c "
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.retrieval.indexing import DocumentBuilder
import json

with open('Data/data.json') as f:
    data = json.load(f)

preprocessor = ClinicalPreprocessor()
result = preprocessor.preprocess_timeline(data)
node = result['timeline'][0]

doc = DocumentBuilder.build_document(node)

print(f'ID: {doc.doc_id}')
print(f'Date (str): {doc.date_issued} (type: {type(doc.date_issued).__name__})')
print(f'Date (unix): {doc.date_unix} (type: {type(doc.date_unix).__name__})')
print(f'Primary: {doc.content_primary}')
print(f'Details: {doc.content_details}')
"
```

## Summary

**Key Takeaway:** Always check which data model you're working with!

- **UI loading data from JSON** → `NormalizedNode` → Use `date_issued` (datetime), `text_primary`, `details`
- **RAG retrieval/reasoning** → `ClinicalDocument` → Use `date_unix` (int), `content_primary`, `content_details`

When in doubt, check the source file:
- `src/ingestion/preprocessor.py` → `NormalizedNode` definition
- `src/retrieval/indexing.py` → `ClinicalDocument` definition
