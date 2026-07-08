# Dashboard Usage Guide

Covers the real, active UI — `src/ui/dashboard.py`, launched via `./launch_dashboard.sh` on **http://localhost:8511**. (`README_DASHBOARD.md` and an earlier version of this doc described a 4-page UI that's since been deprecated — see `context.md`'s dead-code table for `pages_disabled/`. This doc replaces both.)

## Layout

The dashboard is a single page with a **sidebar** (configuration, always visible) and **3 tabs**: **Chat**, **Retrieval Test**, **Data Browser**.

## Sidebar

- **Service Status** — live health check for Qdrant and the active LLM backend (llama.cpp local, or Lightning AI if `LLM_BACKEND=lightning`).
- **Patient Data** — either click **Load Default** (loads `Data/data.json`) or upload your own JSON matching that format. This runs the real deterministic pipeline in-process (`ClinicalPreprocessor` → `PatientStateCompiler` → `DocumentBuilder`) and populates session state — nothing works in the Chat tab's Deterministic mode until this step completes. Once loaded, a **Patient State** expander shows active diagnoses, allergies, recent medications, and clinical status.
- **Reasoning Mode** — a radio choice between two genuinely different code paths:
  - **Agentic RAG** — invokes `src/agent/graph/workflow.py`'s compiled LangGraph in-process. A second radio then picks the agent's `mode`: **Auto-Pilot** (`auto` — confidence-gated routing between RAG and MCP, see `context.md` §4.4.2), **Local RAG** (`local` — forces patient-record retrieval only), **Internet MCP** (`mcp` — forces the internet-search path only), or **Chat Only** (`chat` — skips retrieval entirely).
  - **Deterministic Reasoning (Legacy)** — runs the Tickets 4-10 rule-based pipeline (`ClinicalReasoner`) directly, no LLM-driven routing.
- **Temperature** — a real slider (0.0-1.0, default 0.1, or 0.7 for Chat-only mode).

**One thing worth knowing if you're extending this file**: the "RAG Settings" block that would show a Top-K slider and a Patient ID filter text input (for Local RAG/Auto/Deterministic modes) is currently wrapped in a Python triple-quoted string in `dashboard.py` — meaning it never actually executes. `top_k` and `patient_filter` are hardcoded to `5` and `""` instead of coming from the UI. If you see this block in the source and assume the controls are live, they aren't.

## Tab 1: Chat

The main interaction surface. Ask a question; the response comes from whichever Reasoning Mode is selected in the sidebar. Each assistant message has 👍/👎 feedback buttons — a rating (and optional comment) gets appended to `Data/feedback.jsonl` for later RLHF use. You can also upload a file directly in this tab for one-off document analysis.

## Tab 2: Retrieval Test

Runs `HybridRetriever.search()` directly, without generation — useful for checking what the dense+sparse fusion actually returns for a given query before trusting it in Chat. Takes a search query and an optional patient ID filter; shows the raw retrieved contexts with scores.

## Tab 3: Data Browser

Inspects the Qdrant collection directly — sample a configurable number of points, or look up one by point ID. Useful for confirming ingestion actually wrote what you expect.

## Related

- [`data-reference.md`](data-reference.md) — the input JSON format and the internal data-model attributes (`NormalizedNode`, `ClinicalDocument`) this UI works with.
- [`../context.md`](../context.md) §4.4.2 — the full agent routing logic behind Auto-Pilot mode.
- [`../README.md`](../README.md) — how to launch the dashboard in the first place.
