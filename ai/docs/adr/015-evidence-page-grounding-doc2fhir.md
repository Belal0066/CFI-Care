# ADR-015: Ground extracted evidence to real OCR bounding boxes instead of leaving the field unpopulated

## Status
Accepted (implemented, `ai-code-updates` branch) — contemporaneous rationale.

## Context
`EvidenceSpan.bbox: Optional[list[float]] = None` (`gateway/intermediate_schema.py`) existed as a schema field, and `fhir_mapper.py`'s `_evidence_extension` already turned a populated `bbox` into a real FHIR extension — but nothing anywhere in the pipeline ever set it. Investigating why surfaced a second, more consequential bug: `OCRAdapter._normalize_output` (`gateway/adapters/ocr.py`) never recognized PaddleOCR-VL's actual `/parse_api` response shape (`raw_markdown` plus a `raw_json` string containing `pages[].parsing_res_list[]`), so `extracted_text` always fell through to `str(raw_output)` — a stringified dict, base64 `original_file_url` blob included — and `layouts` was always empty. This affected the *default* mapping path too, not just the structured one: every document's Mapper call was built from that stringified fallback, not real text.

## Constraints
- Any fix has to work with PaddleOCR-VL's actual, verified output format — confirmed by installing the real `paddlex==3.7.2` package in a throwaway environment and reading `PaddleOCRVLResult._to_json`'s source directly, not assumed from documentation.
- PaddleOCR-VL reports `block_bbox` as `[x1, y1, x2, y2]` (pixel corners) — the existing `_normalize_bbox` (`gateway/ocr_normalizer.py:57`) already assumed a 4-element list means `[x, y, w, h]`. These two conventions had to be reconciled without guessing which one a given list represents.
- `ocr_normalizer.py` already had a working block-to-text matching function (`_enrich_layout_blocks`, `ocr_normalizer.py:88`, using `_find_next_substring`, `ocr_normalizer.py:75`) — any new grounding logic should reuse it, not duplicate it.

## Options

### Option A — Leave `bbox` unpopulated (status quo)
The schema field and the FHIR-extension consumer both already existed and worked — the only missing piece was ever calling them with real data.

### Option B — Ask the extraction LLM to report `bbox`/offsets directly
This was, in effect, already being attempted for `start`/`end` (the extraction prompt says "Always include evidence span offsets when text is present") and produces unreliable results — a model has no way to know real character offsets or pixel coordinates; it can only guess plausibly-shaped numbers. Rejected as the mechanism for geometry specifically, while leaving the LLM's role in reporting *which text* supports a claim unchanged (see Decision).

### Option C — Deterministic substring-match against real OCR block data (chosen)
Fix `_normalize_output` to parse the real response shape, converting `block_bbox` from `[x1,y1,x2,y2]` to `[x,y,w,h]` at that boundary (`ocr.py`, converting before `_normalize_bbox` ever sees it, rather than changing what `_normalize_bbox` assumes). Add `ground_evidence_span` (`ocr_normalizer.py:117`), reusing `_find_next_substring` to locate an entity's LLM-reported evidence *text* within the real, already-block-mapped `clean_text`, and read off that block's real `page`/`bbox`. Wire this into `structured_pipeline.py` (`_ground_extraction_evidence`, `structured_pipeline.py:78`) immediately after extraction, overwriting the LLM's own `start`/`end`/`page`/`bbox` guesses with the deterministically-matched values.

## Decision
Option C.

## Why
This is the same principle this project already applies elsewhere: a model can reliably identify *what* text supports a claim (a language-understanding task), but only deterministic code searching the actual source data can know *where* it is — asking a model for pixel coordinates is asking it something it structurally cannot know, regardless of how well-prompted it is.

## Edge Cases Handled
- **Evidence text that doesn't match anything in the document**: `ground_evidence_span` returns `None` rather than fabricating a location — the entity keeps no bbox in that case, which is more honest than guessing.
- **Coordinate-convention mismatch**: PaddleOCR-VL's `[x1,y1,x2,y2]` is converted to `[x,y,w,h]` at the point of ingestion in `ocr.py`, specifically so the pre-existing, unrelated `_normalize_bbox` function's assumption (already correct for its actual callers) didn't have to be changed or made convention-aware — the conversion happens once, at the one place the raw format is known for certain.
- **Malformed `raw_json`**: wrapped in its own `try/except` (`ocr.py`) — a parse failure degrades to text-only (real markdown, empty layouts) rather than failing the whole OCR stage over a layout-data parsing problem.
- **The default mapping path is unaffected by the grounding logic itself** (only by the separate, incidental `extracted_text` fix) — `_ground_extraction_evidence` is only ever called from the structured pipeline, which the default path never runs.

## Optimizations
- Reused `_enrich_layout_blocks`/`_find_next_substring` rather than writing a second matching function — `ground_evidence_span` is a thin, ~15-line application of the same technique already used for block-level matching, applied to one entity's text instead of one block's text.
- Fixing the OCR response-parsing bug fixed the default path's input quality too, as an incidental consequence of fixing the structured path's prerequisite — not a separately-scoped change, but worth naming as a real, higher-blast-radius side effect of what was originally a narrower fix.

## Consequences

### Positive
- Extracted clinical fields are now traceable to a real, verifiable location on the source page — a genuine, defensible instance of "grounded extraction," verified end to end with real code (not reimplemented mirrors) in this session: a mock PaddleOCR-VL response through to a real FHIR `bbox` extension.
- The default mapping path now receives real document markdown instead of a stringified dict with an embedded base64 blob, on every request, not just structured-path ones.

### Negative
- Not tested against a live PaddleOCR-VL server or a real scanned document — verified against a realistic mock built from the actual library's source-confirmed output schema, which is a real but bounded form of verification.
- Grounding depends on the extraction LLM reporting evidence text that appears close to verbatim in the source; a heavily paraphrased evidence span will fail to match and silently keep no bbox, with no separate signal distinguishing "this claim has no location" from "this claim's evidence text was paraphrased enough to miss the match."

### New risks
None beyond the verification-depth caveat already noted — this is a bug fix and an additive grounding step, not a new failure surface.

## Evidence
- `gateway/adapters/ocr.py` — `_normalize_output`'s real-shape parsing and bbox-format conversion.
- `gateway/ocr_normalizer.py:57,75,88,117` — `_normalize_bbox`, `_find_next_substring`, `_enrich_layout_blocks`, `ground_evidence_span`.
- `gateway/structured_pipeline.py:78` — `_ground_extraction_evidence`.
- `gateway/intermediate_schema.py` — `EvidenceSpan.bbox`, the previously-always-`None` field.
- Directly read `paddlex==3.7.2`'s `PaddleOCRVLResult._to_json` source (installed in a throwaway environment this session) confirming the real `block_bbox`/`block_content`/`block_label`/`block_order` shape this fix parses.

## Revisit Trigger
Run against a live PaddleOCR-VL server and a real scanned document before relying on this in a setting where the grounding needs to be provably correct rather than correct-against-a-verified-mock.
