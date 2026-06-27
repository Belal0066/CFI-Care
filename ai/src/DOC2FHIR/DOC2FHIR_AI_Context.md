# DocOnFHIR — AI Integration Context

> AI-powered medical document OCR + FHIR conversion pipeline.
> Upload a PDF → get back structured health data as FHIR R5 bundles.
> No authentication required on almost every endpoint — see the note below.

**Base URL:** `http://<server-ip>:8001` — the current dev deployment runs on a Tailscale address; set it via your own environment/config rather than hardcoding it in client code.

**Auth reality check:** `GET /v1/documents/{job_id}/status` optionally checks an `X-Internal-Secret` header, but only *if the header is present* — omitting it bypasses the check entirely, so this isn't real authentication. `POST /v1/internal/callback`, despite its name, has no auth check at all. Treat every endpoint in this doc as unauthenticated in practice.

> Full OpenAPI spec available at [`DocOnFHIR_API_Spec.md`](./DocOnFHIR_API_Spec.md) — AI agents should reference it for exact schema details (note: response schemas there are currently placeholders; real shapes are in `gateway/models.py`).

---

## Workflow (all clients)

```
1. POST /v1/documents/upload  ──→  get job_id
2. GET  /v1/documents/{job_id}/status  ──→  check if needed COMPLETED/FAILED
3. GET  /v1/documents/{job_id}/result  ──→  fetch the data
```

> **Mock data available** at [`../../tests/mock/`](../../tests/mock/) — realistic JSON responses to develop against without running the pipeline. See [mock section](#mock-data) below.

---

## 1. Upload

**`POST /v1/documents/upload`** — multipart/form-data

| Field | Type | Required |
|-------|------|----------|
| `file` | binary (PDF) | yes |
| `patient_id` | string | yes |
| `pdf_id` | string | no |
| `upload_time` | string (ISO-8601) | no |


**Response `200`:**

```json
{
  "job_id": "job_4fa6b2111da2496ab284cc81da310ff2",
  "state": "PENDING",
  "detail": "Document accepted and queued for processing.",
  "created_at": "2026-05-27T10:15:30.123456+00:00"
}
```

**Errors:** `400` bad request, `413` file >25MB, `415` unsupported type, `422` validation, `503` queue full.

### Dart (Flutter)

```dart
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

Future<String> uploadDocument(String filePath) async {
  var request = http.MultipartRequest(
    'POST',
    Uri.parse('$baseUrl/v1/documents/upload'),
  );
  request.files.add(await http.MultipartFile.fromPath('file', filePath));
  request.fields['patient_id'] = 'uuid-here';
  request.fields['upload_time'] = DateTime.now().toUtc().toIso8601String();

  var response = await request.send();
  var body = await response.stream.bytesToString();
  var data = jsonDecode(body);
  return data['job_id']; // store this for polling
}
```

### Python

```python
import requests

def upload_document(file_path: str) -> str:
    with open(file_path, 'rb') as f:
        resp = requests.post(
            f"{BASE_URL}/v1/documents/upload",
            files={"file": f},
            data={"patient_id": "uuid-here"},
        )
    resp.raise_for_status()
    return resp.json()["job_id"]
```

---

## 2. Status

**`GET /v1/documents/{job_id}/status`**

**Response `200`:**

```json
{
  "job_id": "job_4fa6b211...",
  "state": "PENDING",
  "detail": "Document accepted and queued for processing.",
  "filename": "report.pdf",
  "progress": 0.0,
  "created_at": "2026-05-27T10:15:30.123456+00:00",
  "updated_at": "2026-05-27T10:15:30.123456+00:00",
  "started_at": null,
  "finished_at": null,
  "error_code": null,
  "error_message": null
}
```

**State machine:** `PENDING` → (`SERVER_BUSY` on queue-full/GPU-lock-timeout) → `OCR_PROCESSING` → `MAPPING` → `COMPLETED` | `FAILED`

`SERVER_BUSY` is currently a genuine dead end, not a transient/retryable state — no code anywhere requeues or re-attempts a job once it lands there (confirmed by searching `orchestrator.py`/`app.py`/`job_queue.py` for any requeue logic). A client polling status on a `SERVER_BUSY` job will see that status forever; submit a new job instead of waiting.


### Dart (Flutter) Check only when pressed

```dart
Future<String> checkStatus(String jobId) async {
  final response = await http.get(
    Uri.parse('$baseUrl/v1/documents/$jobId/status'),
  );

  final data = jsonDecode(response.body);

  if (data['state'] == 'COMPLETED') {
    return 'COMPLETED';
  }

  if (data['state'] == 'FAILED') {
    throw Exception(data['error_message']);
  }

  return data['state']; // e.g. PROCESSING, PENDING
}```

### JavaScript / TypeScript

```ts
async function checkStatus(jobId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/documents/${jobId}/status`);
  const data = await res.json();

  if (data.state === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (data.state === 'FAILED') {
    throw new Error(data.error_message);
  }

  return data.state; // e.g. PROCESSING, PENDING
}
```

---

## 3. Result

**`GET /v1/documents/{job_id}/result`**

**Response `200`:**

```json
{
  "job": { "job_id": "...", "state": "COMPLETED", ... },
  "events": [
    { "state": "PENDING", "detail": "Document accepted...", "created_at": "..." },
    { "state": "OCR_PROCESSING", "detail": "OCR completed in 61.55s", "payload": {"ocr_time_sec": 61.55} },
    { "state": "MAPPING", "detail": "Structured extraction completed", "payload": {} },
    { "state": "COMPLETED", "detail": "Successfully processed and delivered", "payload": {"created_resources": ["Patient/4503/..."]} }
  ],
  "ocr_output": { "extracted_text": "...", "raw_markdown": "..." },
  "fhir_bundle": {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [ ... ]
  },
  "fhir_validation": { "valid": true, "errors": [], "resource_count": 20 },
  "stage_metrics": { "ocr_time_sec": 61.55, "delivery_time_sec": 16.4 }
}
```

### Navigating fhir_bundle.entry

Each entry has `{fullUrl, resource, request}`. Switch on `resource.resourceType`:

| resourceType | Key fields for display |
|---|---|
| **Patient** | `name[0].text`, `name[0].family`, `name[0].given`, `gender` |
| **Observation** | `code.coding[0].display`, `valueQuantity.value + unit`, `interpretation[0].coding[0].code` (N=normal, L=low, H=high), `referenceRange[0].low/high` |
| **DiagnosticReport** | `code.text`, `result[]` (array of Observation references), `effectiveDateTime` |
| **Procedure** | `code.text`, `status` |
| **DocumentReference** | `content[0].attachment.title`, `content[0].attachment.contentType` |
| **Provenance** | `agent[].who.display`, `recorded` timestamp |
| **Composition** | `section[].title`, `section[].text.div` — contains the AI-generated clinical summary |
| **Basic** | `extension` → unmapped clinical sections |

### JavaScript — extract observations for a table

```ts
interface Observation {
  code: { coding: { display: string }[]; text: string };
  valueQuantity?: { value: number; unit: string };
  interpretation?: { coding: { code: string }[] };
  referenceRange?: { low: { value: number }; high: { value: number } }[];
}

function extractObservations(fhirBundle: any): Observation[] {
  return fhirBundle.entry
    .map((e: any) => e.resource)
    .filter((r: any) => r.resourceType === 'Observation');
}

// Render:
//   obs.code.text | obs.valueQuantity.value + unit | interpretation | referenceRange
```

### Dart — extract patient name

```dart
String? extractPatientName(Map bundle) {
  var entry = (bundle['entry'] as List).firstWhere(
    (e) => e['resource']['resourceType'] == 'Patient',
  );
  return entry['resource']['name']?[0]?['text'];
}
```

### Extracting the AI Summary

The summary is inside the `Composition` resource within `fhir_bundle`:

```json
{
  "resourceType": "Composition",
  "section": [
    {
      "title": "Summary",
      "text": {
        "status": "generated",
        "div": "<div xmlns=\"...\"><p>CBC results are within normal limits...</p></div>"
      }
    }
  ]
}
```

**Path:** `fhir_bundle → entry[].resource (resourceType == "Composition") → section[].text.div`

**JavaScript / TypeScript:**
```ts
function extractSummary(fhirBundle: any): string | null {
  const composition = fhirBundle.entry
    .map((e: any) => e.resource)
    .find((r: any) => r.resourceType === 'Composition');
  const section = composition?.section?.find((s: any) => s.title === 'Summary');
  return section?.text?.div || null;
}
```

**Dart (Flutter):**
```dart
String? extractSummary(Map bundle) {
  var composition = (bundle['entry'] as List)
    .map((e) => e['resource'])
    .firstWhere((r) => r['resourceType'] == 'Composition');
  var summary = (composition['section'] as List?)
    ?.firstWhere((s) => s['title'] == 'Summary');
  return summary?['text']?['div'];
}
```

The `div` contains HTML — render in a webview or strip tags for plain text.

---

## Error Response

Two different response shapes carry error information — don't conflate them.

**1. Immediate HTTP error response** (returned directly by a failing request, e.g. a bad upload):

```json
{
  "code": "job_not_found",
  "message": "Job not found: job_abc123",
  "details": {},
  "request_id": null
}
```

| code | Meaning |
|---|---|
| `validation_error` | Bad request data |
| `job_not_found` | Invalid job_id |
| `internal_error` | Unexpected server failure (uncaught exception) |
| `http_error` | Any other `HTTPException` the app raises — e.g. the 503 "queue full" response on upload. **This is the actual code returned for queue-full, not `server_busy`** — that value only appears in the status-polling response below. |

**2. Job-status polling response** (`GET /v1/documents/{job_id}/status` → `JobStatusResponse.error_code`, set once a job has already been accepted and is progressing/failed):

| error_code | Meaning |
|---|---|
| `server_busy` | Job's `state` is `SERVER_BUSY` — GPU-lock timeout or queue was full when this job was being picked up. Currently a dead end, see the state-machine note above. |
| `stage_timeout` | OCR/Mapper/downstream stage exceeded its configured timeout |

---

## Mock Data

Pre-built JSON responses at [`../../tests/mock/responses/`](../../tests/mock/responses/) for testing without the pipeline.

**Run the mock server** (path is relative to the repo root, not this directory):
```bash
python3 ai/tests/mock/scripts/serve_mock.py          # port 8001 by default — same as the real Gateway
# to avoid colliding with a real Gateway running alongside it:
MOCK_PORT=8002 python3 ai/tests/mock/scripts/serve_mock.py
```

**Available files:**

| File | Endpoint | What it simulates |
|------|----------|-------------------|
| `upload_202.json` | `POST /v1/documents/upload` | Upload accepted, returns `job_id` |
| `status_pending.json` | `GET …/status` | `PENDING` — just queued |
| `status_processing.json` | `GET …/status` | `OCR_PROCESSING — 35%` progress |
| `status_mapping.json` | `GET …/status` | `MAPPING — 70%` progress |
| `status_completed.json` | `GET …/status` | `COMPLETED — 100%` |
| `status_failed.json` | `GET …/status` | `FAILED` with `error_code: stage_timeout` |
| `result_completed.json` | `GET …/result` | Full result: FHIR bundle + events + OCR |
| `result_404.json` | `GET …/result` | `job_not_found` error |



---

## Quick Reference

| What | Endpoint | Method |
|---|---|---|
| Upload document | `/v1/documents/upload` | POST |
| Poll status | `/v1/documents/{job_id}/status` | GET |
| Get full result | `/v1/documents/{job_id}/result` | GET |

- No auth headers needed
- Max upload: 25 MB
- Supported formats: `.pdf`
- Server port: 8001
