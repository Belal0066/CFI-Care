# ADR-007: Single global GPU semaphore (concurrency = 1) across OCR and Mapper stages

## Status
Accepted (current implementation) — rationale reconstructed, not sourced

## Context
Both the OCR stage (VLM, [ADR-005](005-vlm-based-ocr.md)) and the Mapper stage (local LLM, [ADR-006](006-local-model-serving-mapper.md)) are GPU-resident processes on what the codebase's own naming ("Belal Workstation Server," referenced in the Clinical AI System's own diagrams) suggests is a single-GPU host, not a multi-GPU cluster. Multiple document-processing jobs can be submitted concurrently to the Gateway.

## Constraints
- A single GPU has finite VRAM; running OCR's VLM and the Mapper's LLM simultaneously for two different jobs risks resource contention or an out-of-memory failure, not just slower throughput.
- The system needs *some* defined behavior under concurrent load — either queueing or an explicit rejection — rather than an unhandled crash.

## Options

### Option A — No concurrency control (let both processes contend for the GPU freely)
Pros: none functionally — mentioned only as the baseline being avoided. Cons: unpredictable failure under concurrent load (OOM, or silent slowdown with no diagnosable cause) — not implemented, no evidence needed to reject this as a serious option for a single-GPU host.

### Option B — Separate semaphores per stage (OCR and Mapper independently capped)
Would allow one OCR job and one Mapper job to run concurrently (different jobs, different stages), better throughput than Option C if the GPU genuinely has headroom for both simultaneously. Not implemented — `orchestrator.py:197` uses one shared `asyncio.Semaphore` for both stages, not two.

### Option C — One shared semaphore across both stages, concurrency = 1 (chosen)
`self._gpu_semaphore = asyncio.Semaphore(max(1, settings.gpu_max_concurrency))` (`orchestrator.py:197`), with `gpu_max_concurrency: int = 1` (`config.py:51`) — both OCR and Mapper stages acquire the *same* semaphore, so they can never run concurrently, even across different jobs and even though they're technically separate processes that could in principle share a GPU.

## Decision
Option C.

## Why
**No comment, doc, or commit message explains why one shared semaphore was chosen over two independent ones.** Stated plainly rather than assumed. The technical justification below is reconstructed from what a shared single-GPU host requires, not sourced from a design discussion:
- If OCR (VLM) and Mapper (LLM) are both GPU-resident on the same device, running them simultaneously risks VRAM contention regardless of which specific jobs they belong to — a single shared semaphore is the simplest way to guarantee that never happens, at the cost of forgoing any concurrency Option B might have safely allowed.
- The default (`gpu_max_concurrency = 1`) is conservative — it doesn't assume anything about how much VRAM headroom exists, which is a defensible default when that headroom hasn't been measured (no VRAM-usage benchmark was found in the repo for either OCR or Mapper).

## Consequences

### Positive
- Removes an entire class of GPU-contention failure by construction — the timeout on lock acquisition (`gpu_lock_timeout_sec = 5`, `config.py:52`) surfaces contention as an explicit `SERVER_BUSY` status rather than a crash or silent hang.

### Negative
- Throughput under concurrent load is strictly serialized — two jobs' OCR and Mapper stages never overlap, even if the GPU would have had headroom for both (unverified, since no VRAM measurement exists to confirm or deny this).
- No configuration exists to raise concurrency for OCR and Mapper independently if their actual VRAM footprints turn out to be small enough to coexist — Option B would require code changes, not just a config value, since the current implementation shares one semaphore object.

### New risks
None beyond the throughput ceiling already noted.

## Evidence
- `gateway/orchestrator.py:197` — the single shared `asyncio.Semaphore`.
- `gateway/orchestrator.py:466-487` (`_run_gpu_bound_stage`) — confirms both OCR and Mapper stage calls route through this same acquire/release.
- `gateway/config.py:51-52` — `gpu_max_concurrency: int = 1`, `gpu_lock_timeout_sec: int = 5`.

## Revisit Trigger
Before raising `gpu_max_concurrency` above 1 or splitting into per-stage semaphores (Option B), measure actual peak VRAM usage for OCR and Mapper independently — this ADR's conservative default was chosen without that measurement, and should be replaced with an evidenced value once it exists, not adjusted by guesswork.
