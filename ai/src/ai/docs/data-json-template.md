# data.json Encounter Format - Complete Template

## Overview

The `data.json` file contains a clinical timeline with encounters structured as nodes in a graph. This format is fully supported by the **Clinical Reasoning** module (Page 4 in the UI).

## ✅ Validation Results

```
✓ All 10 encounters parsed successfully
✓ All IDs extracted
✓ All dates normalized  
✓ All categories mapped
✓ All event tags assigned
✓ 3 diagnoses classified (Provisional, Differential, Final)
✓ Graph structure preserved (1 root, 9 children)
```

## File Structure

```json
{
  "nodes": [/* array of encounter objects */],
  "eocId": "episode-of-care-uuid",
  "pagination": null
}
```

## Node Template

Each encounter node has the following structure:

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
    "Encounter": ["enc-id"],
    "Condition": ["cond-id"],
    "MedicationRequest": ["med-id"],
    "ImagingStudy": ["img-id"],
    "DiagnosticReport": ["dr-id"],
    "AllergyIntolerance": ["allergy-id"]
  },
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "deletedAt": null
}
```

## Field Mapping

### Core Identifiers
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | string | ✅ Yes | Unique encounter ID | `"enc-78fdbce6-41ef-4b67-..."` |
| `eocId` | string | ✅ Yes | Episode of care ID (root level) | `"eoc-4c6444dc-4b19-..."` |

### Clinical Content
| Field | Type | Required | Mapped To | Description |
|-------|------|----------|-----------|-------------|
| `text_1` | string | ✅ Yes | `text_primary` | Main encounter text | 
| `details` | string | ✅ Yes | `details` | Additional clinical details |

### Temporal Information
| Field | Type | Required | Mapped To | Description |
|-------|------|----------|-----------|-------------|
| `dateIssued` | string | ✅ Yes | `date_issued` | Date in YYYY-MM-DD format |
| `createdAt` | string | No | `created_at` | ISO-8601 creation timestamp |
| `updatedAt` | string | No | `updated_at` | ISO-8601 update timestamp |

### Graph Structure
| Field | Type | Required | Mapped To | Description |
|-------|------|----------|-----------|-------------|
| `father` | string | No | `father_id` | Parent encounter ID (null for root) |
| `relationshipType` | string | No | `relationship_type` | Type of relationship to parent |

### Clinical Classification
| Field | Type | Required | Mapped To | Processing |
|-------|------|----------|-----------|------------|
| `category` | string | ✅ Yes | `category` | Mapped to ClinicalCategory enum |
| `isDiagnosis` | boolean | ✅ Yes | `is_diagnosis` | Used for diagnosis detection |
| `priority` | string | ✅ Yes | `priority` | High/Medium/Low |
| `normality` | string | ✅ Yes | `normality` | Normal/Abnormal |

### Metadata
| Field | Type | Required | Mapped To | Description |
|-------|------|----------|-----------|-------------|
| `isManualBranch` | boolean | No | `is_manual_branch` | Manually created branch flag |
| `relatedResourceIds` | object | No | `related_resource_ids` | FHIR resource references |

## Category Mapping

Your categories are automatically mapped to standardized clinical categories:

| Your Category | System Category | Event Tag Assigned |
|---------------|-----------------|-------------------|
| `Consultation` | Consultation | Symptom or Diagnosis |
| `Prescription` | Prescription | Medication |
| `Imaging` | Imaging | Investigation |
| `Allergy` | Allergy | Allergy/Adverse |
| `FollowUp` | FollowUp | FollowUp/Outcome |

## Event Tag Assignment

The system automatically assigns semantic event tags based on content:

| Event Tag | Detection Logic | Example |
|-----------|----------------|---------|
| **Diagnosis** | `isDiagnosis: true` | "Initial Diagnosis: Bronchitis" |
| **Symptom** | Category=Consultation + not diagnosis | "HPI: Persistent cough" |
| **Medication** | Category=Prescription | "Prescribed Amoxicillin" |
| **Investigation** | Category=Imaging/Lab | "Chest X-Ray ordered" |
| **Allergy/Adverse** | Category=Allergy | "Adverse Drug Reaction to Amoxicillin" |
| **FollowUp/Outcome** | Category=FollowUp | "Patient condition improved" |

## Diagnosis Classification

When `isDiagnosis: true`, the system classifies diagnosis type:

| Diagnosis Type | Detection Keywords | Example |
|----------------|-------------------|---------|
| **Final** | "final", "confirmed" in text/details | "Final Diagnosis: Mycoplasma Pneumonia" |
| **Differential** | "differential" in text/details | "Differential Diagnosis: Atypical Pneumonia vs. Drug Reaction" |
| **Provisional** | Default if not final/differential | "Initial Diagnosis: Bronchitis" |

## Example: Your data.json

Here's how your actual data is parsed:

### Encounter 1 (Root Node)
```json
{
  "id": "enc-911bc2c8-0548-42d2-97c7-c4af4dfc78e4",
  "text_1": "HPI: Persistent cough and fatigue",
  "father": null,  // ← Root node
  "category": "Consultation",
  "dateIssued": "2025-12-01",
  "isDiagnosis": false
}
```
**Parsed as:**
- Event Tag: `Symptom`
- Date: `2025-12-01`
- Primary: "HPI: Persistent cough and fatigue"

### Encounter 3 (Diagnosis)
```json
{
  "id": "enc-8591cc8a-9ff3-4ac4-a10c-2cc907752538",
  "text_1": "Initial Diagnosis: Bronchitis",
  "father": "enc-aa8da451-090d-4ddc-adf8-8019b2ba5912",
  "category": "Consultation",
  "dateIssued": "2025-12-03",
  "isDiagnosis": true,  // ← Marks as diagnosis
  "details": "X-Ray clear, symptoms consistent with acute bronchitis"
}
```
**Parsed as:**
- Event Tag: `Diagnosis`
- Diagnosis Type: `Provisional` (not final/differential)
- Date: `2025-12-03`

### Encounter 8 (Final Diagnosis)
```json
{
  "id": "enc-024e551d-110e-4c55-ac07-d2bc66e8ef20",
  "text_1": "Final Diagnosis: Mycoplasma Pneumonia",
  "category": "Consultation",
  "dateIssued": "2025-12-10",
  "isDiagnosis": true,
  "details": "Amoxicillin stopped. Based on... confirm Mycoplasma"
}
```
**Parsed as:**
- Event Tag: `Diagnosis`
- Diagnosis Type: `Final` (contains "Final" keyword)
- Date: `2025-12-10`

## Complete Processing Pipeline

When you upload data.json:

```
1. LOAD JSON
   └─> Extract nodes array + eocId

2. NORMALIZE EACH NODE (Ticket 4)
   └─> Parse dates → ISO-8601
   └─> Map category → ClinicalCategory enum
   └─> Detect diagnosis → Set is_diagnosis
   └─> Classify diagnosis → Provisional/Differential/Final
   └─> Tag event → 6 event types

3. COMPILE PATIENT STATE (Ticket 5)
   └─> Extract active diagnoses (temporal priority)
   └─> Extract allergies
   └─> Extract medications
   └─> Determine clinical status (Improved/Worsened/Stable)

4. BUILD DOCUMENTS (Ticket 6)
   └─> Create one document per node
   └─> Add metadata (15+ fields)
   └─> Preserve node IDs for citations

5. READY FOR QUERIES (Tickets 7-10)
   └─> Intent classification
   └─> Context retrieval
   └─> Clinical reasoning
   └─> Citation-backed responses
```

## Parsed Output Summary

From your 10-node data.json:

```
✓ Date Range: 2025-12-01 to 2025-12-21 (20 days)
✓ Event Distribution:
  - Symptom: 2
  - Investigation: 1
  - Diagnosis: 3
  - Medication: 2
  - Allergy/Adverse: 1
  - FollowUp/Outcome: 1

✓ Diagnoses Found:
  1. Provisional: Initial Diagnosis: Bronchitis (2025-12-03)
  2. Differential: Atypical Pneumonia vs. Drug Reaction (2025-12-08)
  3. Final: Mycoplasma Pneumonia (2025-12-10)

✓ Graph Structure:
  - Root: enc-911bc2c8... (HPI: Persistent cough)
  - Children: 9 connected nodes
  - Max depth: 9 levels
```

## Required Fields

**Minimum required fields for each node:**
```json
{
  "id": "string",           // Required
  "text_1": "string",       // Required
  "category": "string",     // Required
  "dateIssued": "YYYY-MM-DD", // Required
  "isDiagnosis": boolean,   // Required
  "father": "string | null" // Required (null for root)
}
```

**Recommended additional fields:**
- `details` - Clinical notes
- `priority` - Clinical priority
- `normality` - Normal/Abnormal
- `relatedResourceIds` - FHIR references
- `createdAt` / `updatedAt` - Audit trail

## Usage

### Command Line
```bash
PYTHONPATH=$PWD python3 scripts/test_data_json_parsing.py
```

### Python API
```python
from src.ingestion.preprocessor import ClinicalPreprocessor

with open("Data/data.json") as f:
    data = json.load(f)

preprocessor = ClinicalPreprocessor()
result = preprocessor.preprocess_timeline(data)

nodes = result['timeline']  # List[NormalizedNode]
eoc_id = result['eoc_id']   # str
```

### Web UI
1. Open http://localhost:8511
2. Navigate to **Clinical Reasoning** (Page 4)
3. Click "📁 Load Default Data" (loads Data/data.json)
4. Ask questions about the patient timeline

## Validation

All parsing is validated by the system test suite:

```bash
PYTHONPATH=$PWD python3 scripts/validate_system.py
```

Expected: `✅ ALL VALIDATION TESTS PASSED (23/23)`

---

## Summary

✅ **Your data.json format is fully supported and correctly parsed**

- All 10 encounters extracted
- All fields mapped to internal format
- Graph structure preserved
- Diagnoses classified automatically
- Event tags assigned intelligently
- Ready for clinical reasoning queries

**No changes needed to your data format** - the system handles it perfectly as-is.
