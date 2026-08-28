# Clinical AI System: Evaluation (`clinical-eval-v1`)

`clinical-eval-v1` is 50 questions about 100 real de-identified patients (MIMIC-IV Clinical Database Demo on FHIR v2.1.0). 20 of them are drawn from FHIR-AgentBench. It is an **evaluation set, not a benchmark**. The system under test is described in [SYSTEM_CARD.md](SYSTEM_CARD.md), including the fix log (F1–F7) applied before tagging `eval-v1`. Code: `ai/src/ai/eval/`.

> Results tables are filled in from `results/eval-v1/scores/report.md` after the run. No number appears here without its n, 95% interval and config.

## Data

- **Patients:** MIMIC-IV Clinical Database Demo on FHIR v2.1.0: 100 patients, 929k FHIR R4 resources, ODbL open access. It has **no free-text notes**, so the system retrieves over structured resources only.
- **Benchmark source:** FHIR-AgentBench (CC-BY-4.0; 2,931 single-patient questions on the same demo, each with gold answers and gold resource ids).
- **Index:** one Qdrant point per resource chunk, with patient and resource ids in the payload. Every query is filtered to the question's patient. Shared resources (Medication, Location, Organization) are not indexed; see the system card.
- **Split:** by patient, seed `20260930` (`eval/data/splits.json`). Every patient referenced by Blocks A–D is in **test**. **Dev** (20 other patients) is used only to calibrate the relevance gate.

## The 50 questions (`eval/data/clinical-eval-v1.jsonl`)

| Block | n | Source | Ground truth | Scored by |
|---|---|---|---|---|
| A. Record lookup | 20 | FHIR-AgentBench test split, stratified by gold resource type (6 Observation, 4 MedicationRequest, 3 Encounter, 1 Procedure, 1 Condition, 1 Patient, 4 empty-gold) | Their answer and gold ids | Their judge prompt; Recall@5 |
| B. Hard record reasoning | 10 | Authored: temporal trend, latest value, paraphrase, max, count, negation, diagnosis presence, multi-resource, ICU administration, ordering | Computed by code over the NDJSON (`eval/build_questions.py`) | Same judge prompt; Recall@5 |
| C. Case questions with external evidence | 12 | 4 index cases (richest records); 9 openFDA-label and 3 PubMed questions | 2–5 must-have statements quoted **verbatim** from a named source (label set id + section, or PMID), plus the expected tool | K-QA method: entailed / contradicted must-haves; tool-call correctness |
| D. Unanswerable | 8 | Data the demo cannot hold (notes, reports, social/family history, insurance) or out of scope (prediction), with absence checked by code per patient | Expected abstention | Abstained flag, and the judge's reading of the text |

Question-text rules:
- FHIR-AgentBench questions are kept verbatim, including the time assumption and their agent hints ("When searching for values in the database…"). The only change: MIMIC subject ids ("patient 10018081") are replaced by "the patient", since the `patient_id` filter already scopes retrieval.
- Block A/B/D answers never come from an LLM.
- Block C statements restate published sources and make no clinical judgement of their own (the author is not a clinician). They are marked `draft` until a person reviews every statement. The runner refuses drafts.
- **Empty-gold items** (the record holds nothing matching, so the answer is "none"/"no") are answerable. Two accuracies are reported:
  - **bench:** FHIR-AgentBench's rule, under which a declining answer counts as correct on empty gold.
  - **strict:** a system abstention is always wrong.

## VizMCP check (separate from the 50)

VizMCP is not exercised by the 50 text questions. `eval/viz_check.py` sends 5 chart requests through the full graph (`visualize` node → MCP `render_clinical_viz`). The visualize node always draws the same three charts (renal, cardiac markers, encounter timeline), so the 5 items differ by **patient archetype**, not wording:
- a long creatinine series;
- NTproBNP results;
- many encounters;
- the largest record (48k points);
- sparse labs (no BNP, 2 creatinine results).

Charts are **reviewed by eye** in `results/eval-v1/viz/index.html`, next to the expected series taken from the NDJSON. The code checks only:
- routing reached `visualize`;
- the extracted point counts equal the NDJSON counts;
- each chart rendered, or was empty, as expected.

MIMIC stores eGFR as text, so renal charts show creatinine only. Build with `python eval/viz_check.py build` (CPU).

## Experiments

| ID | Question | Configs (`eval/configs/`) | Items |
|---|---|---|---|
| E001 (primary) | Does the graph beat plain RAG? | `naive_rag` (same retriever top-5, same model, one call, no tools) vs `full` | 50; **reported per block**: C isolates tool value, A/B/D isolate graph vs plain retrieval |
| E002 | Hybrid vs dense-only inside the graph | `full` vs `e002_dense` | A+B |
| E003 | Are retry + graded evaluator worth it? **Combined toggle**, labelled as such | `e003_off` vs `full` | 50 |
| Repeat | Run-to-run agreement | `full` again, same concurrency (`--tag r2`) | 50 |
| Retrieval study (no LLM) | R1 dense/sparse/hybrid; R2 F1 before/after; R3 intent filter; R4 k∈{5,10,20}; gate calibration | `eval/retrieval_study.py` | All FHIR-AgentBench questions with patient-scoped gold (test split reported) |

All runs use temperature 0, seed 0, a frozen git tag and question set, and pinned images.

## Metrics and statistics

- **Accuracy:** A, B (bench and strict).
- **Recall@5:** gold ids present among the generator's context resources. Reported with full-recall (every gold id present), and per category.
- **Faithfulness:** Ragas, judged against the exact context the generator received (patient records plus MCP evidence), for answered items.
- **Must-have coverage and contradictions:** C.
- **Tool correctness:** C.
- **Abstention:** correct abstention on D; false abstention on A–C.
- **Work per question:** LLM calls, tokens, latency p50/p95. Agent-side calls only; MedMCP's internal LLM calls are not counted.
- **Statistics:**
  - Wilson 95% interval on every rate.
  - Exact McNemar test plus a fixed/broken list for paired accuracy.
  - Bootstrap intervals (10,000 resamples) for means.
  - `ranx` Fisher randomization tests for retrieval configs.
  - The rule of three for zero-failure results.
  - With n=50, the per-category tables matter more than p-values.
- **Judge:**
  - Groq `openai/gpt-oss-120b`, temperature 0, cached.
  - Block A uses FHIR-AgentBench's own prompts (copied verbatim in `eval/judge_prompts.py`) with a different judge model (theirs is o4-mini), so Block A is **not strictly comparable** to their published numbers.
  - 20 answers are hand-checked (`scores/hand_check.jsonl`), and agreement and Cohen's κ are reported.
  - If κ < 0.6, judge-based numbers are not published; the hand labels are.
- **Data to the judge:** the judge receives MIMIC demo data via Groq. This is permitted because the demo is ODbL open data. It would not be permitted for credentialed MIMIC.

**Expected weak spots** (reported, not hidden):
- Aggregate questions (counts, averages) that top-k retrieval cannot cover.
- Block D, because a similarity gate detects "unrelated", not "absent".

## Running it on Lightning AI

One Studio, persistent disk at `/teamspace/studios/this_studio` (`EVAL_HOME` below). Everything that needs no GPU runs on a CPU machine first. The GPU session only serves the model.

### Before the session (CPU Studio)

Nothing large travels over the developer's connection. Only the code goes up (a `git push`). Everything large is fetched from inside the Studio over the datacenter link: the Docker base images and dependencies (images are **built on the Studio**, not pushed from a laptop), the 13.6 GB SGLang image, the ~54 GB MedGemma weights, the MIMIC data, FHIR-AgentBench, and the embedding models.

```bash
git clone --depth 1 -b <branch> https://github.com/Belal0066/CFI-Care.git && cd CFI-Care/ai/src/ai
```

Then, from `ai/src/ai`:

```bash
cp eval/docker/.env.eval.example eval/docker/.env.eval   # fill HF_TOKEN, keys; never commit it
bash eval/docker/prep.sh data       # MIMIC demo (~50 MB) + FHIR-AgentBench
bash eval/docker/prep.sh weights    # MedGemma 27B text (~54 GB) + 4B into $EVAL_HOME/cache/hf
bash eval/docker/prep.sh images     # build runner/mcp; pull qdrant, phoenix, sglang
bash eval/docker/prep.sh index      # embed + index 100 patients, payload indexes, snapshot
bash eval/docker/prep.sh study      # retrieval study + gate calibration (writes metrics.json)
```

Then, still on CPU:
1. Set `RELEVANCE_GATE_THRESHOLD` in the configs from `retrieval_study/gate_calibration.json`, and `INTENT_FILTER_ENABLED` from R3.
2. Review Block C (set `status: reviewed`).
3. Commit and tag `eval-v1`.

### Short check on a cheap GPU (L4/L40S), ~20 minutes

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi   # GPU visible in containers?
# driver < 580: set SGLANG_IMAGE=lmsysorg/sglang:v0.5.19-cu129 in .env.eval
MODEL=google/medgemma-4b-it SERVED=medgemma-4b MCP_HTTP_CACHE_MODE=record \
  docker compose -f eval/docker/docker-compose.eval.yml --env-file eval/docker/.env.eval --profile eval up -d
docker compose ... run --rm runner eval/docker/preflight.py
docker compose ... run --rm runner -m eval.run --config eval/configs/full.yaml --experiment dryrun --allow-draft
docker compose ... run --rm runner -m eval.run --config eval/configs/naive_rag.yaml --experiment dryrun --allow-draft
```

This pass must finish all 50 × each config with 0 crashes, 0 parse failures and 0 egress violations. Recording mode fills the MedMCP HTTP cache. If `docker --gpus` does not work in the Studio, run SGLang natively (`pip install "sglang[all]==0.5.20"; python -m sglang.launch_server ...`) and point `LLAMACPP_BASE_URL`/`LLAMACPP_API_BASE` at the host.

### GPU session (H200 > H100 > A100), 4 hours maximum

| Time | Step |
|---|---|
| 0–10 min | `up -d` with the 27B model; `nvidia-smi --query-gpu=name,driver_version --format=csv > $EVAL_HOME/results/eval-v1/gpu.txt`; `run --rm runner eval/docker/preflight.py` must print PREFLIGHT PASSED |
| 10–20 min | 5 items per config (`--ids a001,b001,c001,d001,a002`); measure items/min; cut sample sizes now if the projection overflows (never the reference config) |
| 20–70 min | E001: `full`, then `naive_rag` |
| 70–110 min | E003: `e003_off`; repeat: `full --experiment repeat --tag r2` |
| 110–120 min | VizMCP check: `run --rm runner eval/viz_check.py run` (5 chart requests; review `results/eval-v1/viz/index.html` afterwards) |
| 120–150 min | E002: `e002_dense` (first to cut if short) |
| last 15 min | Stop, check `results/eval-v1/runs/*.jsonl` and the manifest, shut the GPU down |

Each run is resumable: rerunning the same command skips finished items.

### After the session (CPU)

```bash
docker compose ... --profile score run --rm scorer                       # judge + Ragas
# fill human_correct / human_faithful in results/eval-v1/scores/hand_check.jsonl
docker compose ... --profile score run --rm scorer eval/report.py        # report.md / report.json
docker compose ... --profile score run --rm scorer eval/phoenix_scores.py # scores -> Phoenix span annotations
```

Phoenix keeps its data on the persistent disk, so after the GPU is released it runs on the CPU machine (`--profile score up -d phoenix`, port 6006), with every trace annotated with its scores (`correct_strict`, `recall@5`, `faithfulness`, `must_have_coverage`, `tool_correct`, `declined`).

## Reproducing a table

Every table is regenerated from the tagged commit:
- the question set (`eval/data/`, sha256 in `results/eval-v1/manifest.json`);
- the Qdrant snapshot;
- the configs;
- the commands above.

The manifest also records the SGLang version and server arguments (including whether deterministic inference was on), the Qdrant version, and the GPU.

## Deviations from the written plan

- No reranker exists, so A6 is dropped. A5 (no verification node) would show no effect by construction (see the system card).
- The retrieval study uses FHIR-AgentBench gold resource ids instead of BioASQ: the PubMed tool does not rank with embeddings, so a BioASQ embedding study would test a component the system does not have.
- MedCPT (R5) and the MLflow tracking container were cut; tracing is Phoenix, plus LangSmith on open data only.
