# ADR-005: VLM-based OCR (PaddleOCR-VL) instead of classical OCR

## Status
Accepted (current implementation) — rationale reconstructed, not sourced

## Context
Scanned clinical documents are heterogeneous: photographs, low-quality scans, tables, mixed layouts, occasionally handwriting. The OCR stage needs to turn a page image into text (and ideally structure) usable by the mapping stage downstream.

## Constraints
- Runs on the same host's GPU that the Mapper LLM also needs (see [ADR-007](007-gpu-concurrency-one.md)) — whatever OCR approach is chosen shares that resource budget.
- Output needs to preserve enough structure (tables, layout) for downstream extraction to work — a plain character stream loses information a classical OCR + separate layout-analysis pipeline would also have to reconstruct.

## Options

### Option A — Classical OCR (box detection + CRNN/Tesseract-style recognition) + separate layout analysis
Pros: lighter-weight, no GPU-resident VLM needed, mature/well-understood failure modes. Cons: not implemented here, so there's no in-repo evidence comparing it against the chosen approach — noting it as the standard alternative, not as a rejected-with-evidence option.

### Option B — Hosted OCR API (e.g., a cloud document-AI service)
Pros: no local GPU/model management. Cons: sends clinical document images to a third party — in tension with the same data-residency reasoning documented for the Mapper LLM (see [ADR-006](006-local-model-serving-mapper.md), "keep inference fully self-hosted"). Not implemented; not evidenced as considered-and-rejected, but the self-hosting rationale used for the LLM would apply equally here if it was a factor — this is an inference, flagged as such.

### Option C — VLM-based OCR, self-hosted (chosen)
`PaddleOCRVL` (`OCR/OCRpipelie/app/option3_ui.py:29`) served via a self-hosted vLLM instance (`PaddleOCR-VL-1.5-0.9B`, `scripts/start_vllm_official_8118.sh`). Confirmed real, not a stub — this is a genuine VLM-based document understanding pipeline, not templated/rule-based OCR relabeled.

## Decision
Option C.

## Why
**No document, comment, or commit message in the repository states why a VLM was chosen over classical OCR or a hosted API.** This is stated plainly rather than papered over. What follows is the technical justification *for* the choice as implemented, reconstructed from what VLM-based OCR provides that classical OCR does not — presented as engineering rationale for the reader's benefit, not as the original decision-maker's stated reasoning:
- A VLM can produce structure-aware output (markdown with table/layout cues) in one pass, rather than requiring OCR + a separate layout-analysis step to reconstruct table structure — relevant given the downstream Mapper needs to extract clinical facts that are frequently tabular (lab results, medication lists).
- Self-hosting (Option C) is consistent with the same data-residency stance documented for the Mapper LLM (ADR-006) — clinical documents don't leave the local pipeline at either stage. This consistency is real (both stages are self-hosted) even though the OCR stage's own rationale isn't separately documented.

## Consequences

### Positive
- Table/layout structure is available in the OCR output (`raw_markdown`, layout blocks) — in principle a strictly richer signal than a flat text OCR would provide.

### Negative
- A VLM is more resource-intensive than classical OCR, competing for the same GPU budget the Mapper LLM needs (ADR-007's concurrency=1 constraint applies here too).
- The richer output structure is currently wasted: the Gateway's `OCRAdapter._normalize_output` doesn't recognize the actual response shape (`raw_markdown`/`raw_json`) at all — see [`FAILURE_MODES.md`](../FAILURE_MODES.md). The VLM choice's main advantage (structured output) isn't reaching the Mapper today, independent of whether the VLM choice itself was right.

### New risks
None specific to this decision beyond what's already tracked in the failure-mode table.

## Evidence
- `OCR/OCRpipelie/app/option3_ui.py:29,293-300` — confirmed real `PaddleOCRVL` usage against a self-hosted vLLM backend.
- `OCR/OCRpipelie/scripts/start_vllm_official_8118.sh:5,17` — model name and self-hosted serving confirmed.
- Absence of documented rationale confirmed by search across `README.md`, `DocOnFHIR_API_Spec.md`, `DOC2FHIR_AI_Context.md`, and `git log` on the introducing commit (`3c16f32` — message is informal, no design rationale).

## Revisit Trigger
If the Gateway/OCR contract bug is fixed and the richer structured output starts actually reaching the Mapper, re-evaluate whether the VLM's table/layout advantage measurably improves FHIR-mapping accuracy — that would convert this ADR's currently-reconstructed rationale into an evidenced one.
