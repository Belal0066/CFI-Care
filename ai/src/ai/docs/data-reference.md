# Data Reference — Input Format & Internal Models

How patient data is shaped as it moves through the system: the `data.json` input contract, then the two internal Python models it becomes (`NormalizedNode`, then `ClinicalDocument`) and the attribute renames between them — the single most common source of `AttributeError`s when extending the UI or ingestion code.

## Input Format: `data.json`

A clinical timeline as encounter nodes:

```json
{
  "nodes": [ /* array of encounter objects, see below */ ],
  "eocId": "episode-of-care-uuid"
}
```

Each node:

```json
{
  "id": "enc-{uuid}",
  "text_1": "Primary encounter description",
  "father": "parent-encounter-id or null",
  "relationshipType": "association | followup | etc",
  "category": "Consultation | Prescription | Imaging | Allergy | FollowUp",
  "priority": "High | Medium | Low",
  "normality": "Normal | Abnormal",
  "dateIssued": "YYYY-MM-DD",
  "details": "Additional clinical details and notes",
  "isDiagnosis": true | false,
  "isManualBranch": true | false,
  "relatedResourceIds": {
    "Encounter": ["enc-id"], "Condition": ["cond-id"], "MedicationRequest": ["med-id"],
    "ImagingStudy": ["img-id"], "DiagnosticReport": ["dr-id"], "AllergyIntolerance": ["allergy-id"]
  }
}
```

**Required fields:** `id`, `text_1`, `category`, `dateIssued`, `isDiagnosis`, `father` (null for the root node).

### Category → Event Tag Mapping

| Your `category` | Event Tag Assigned |
|---|---|
| `Consultation` | Symptom (or Diagnosis, if `isDiagnosis: true`) |
| `Prescription` | Medication |
| `Imaging` / `Lab` | Investigation |
| `Allergy` | Allergy/Adverse |
| `FollowUp` | FollowUp/Outcome |

### Diagnosis Classification (when `isDiagnosis: true`)

| Type | Detection |
|---|---|
| Final | "final"/"confirmed" in text or details |
| Differential | "differential" in text or details |
| Provisional | Default, if neither of the above |

## Processing Pipeline

```
1. LOAD JSON        → Extract nodes[] + eocId
2. NORMALIZE        → Parse dates, map category, detect/classify diagnosis, tag event
3. COMPILE STATE     → Active diagnoses (temporal priority), allergies, medications, clinical status
4. BUILD DOCUMENTS   → One ClinicalDocument per node, 15+ metadata fields, node IDs preserved for citations
5. READY FOR QUERIES → Intent classification → retrieval → reasoning → cited response
```

See `context.md` §4.2/§4.3 for the modules implementing each stage.

## Internal Models: `NormalizedNode` → `ClinicalDocument`

Two different Python objects represent the same data at different pipeline stages — using the wrong one's attribute name is the most common bug when writing new UI or ingestion code.

### `NormalizedNode` (from `src.ingestion.preprocessor`)

Used immediately after preprocessing, before RAG indexing.

```python
node.id                    # str
node.eoc_id                # str
node.date_issued           # datetime — use .date() to format, NOT subscriptable
node.date_normalized       # str, ISO-8601
node.text_primary          # str — was `text_1` in the input JSON
node.details                # str
node.father_id             # Optional[str]
node.category               # ClinicalCategory enum
node.is_diagnosis           # bool
node.diagnosis_type         # DiagnosisType enum
node.event_tag              # EventTag enum
```

**Don't exist** (common wrong guesses): `node.date_unix`, `node.text_secondary`, `node.text_1`, `node.dateIssued`, `node.isDiagnosis`, `node.father` — these are the *input JSON's* field names, not the parsed object's.

### `ClinicalDocument` (from `src.retrieval.indexing`)

Used for retrieval and citation — built from a `NormalizedNode` via `DocumentBuilder.build_document(node)`.

```python
doc.doc_id                  # str — same as node_id
doc.node_id                 # str
doc.content_primary         # str
doc.content_details         # str
doc.date_issued             # str, ISO-8601 — a STRING here, not a datetime (opposite of NormalizedNode)
doc.date_unix                # int — use this for numeric range queries, not date_issued
doc.father_id                 # Optional[str]
doc.is_allergy / is_medication / is_symptom / is_outcome  # bool search flags
```

**The one rule that matters:** `NormalizedNode.date_issued` is a `datetime`; `ClinicalDocument.date_issued` is a `str`. Sort/filter accordingly — use `.date_unix` on `ClinicalDocument` for numeric range queries (e.g. Qdrant payload filters), not string slicing.

## Testing

```bash
PYTHONPATH=$PWD python3 scripts/test_data_json_parsing.py   # data.json parsing
PYTHONPATH=$PWD python3 scripts/validate_system.py           # full 23-test suite
```
