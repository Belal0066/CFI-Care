#!/usr/bin/env python3
"""
Unified Gateway UI for DOC2FHIR end-to-end pipeline.
Orchestrates OCR + Mapper + Downstream delivery via gateway orchestrator.
Provides real-time status tracking, FHIR validation, and performance metrics.
"""

import asyncio
import json
import logging
import mimetypes
import os
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
    if response.status_code != 200:
      error_msg = f"Gateway error: {response.text}"
      logger.error(error_msg)
      return {
        "state": "error",
        "progress": STATUS["progress"],
        "stage": STATUS["stage"],
        "detail": error_msg,
        "error": error_msg,
        "job_id": job_id,
        "metrics": STATUS.get("metrics", {}),
        "last_response": {},
        "fhir_bundle": "",
        "ocr_markdown": "",
      }

    result = response.json()
    state = result.get("state", "unknown")
    progress = float(result.get("progress", 0))
    detail = result.get("detail", "")
    error_message = result.get("error_message", "")

    stage_map = {
      "queued": "ocr",
      "ocr_processing": "ocr",
      "mapping": "mapper",
      "validating": "validation",
      "downstream": "downstream",
      "completed": "complete",
      "failed": "error",
    }
    stage = stage_map.get(state, "unknown")

    await set_status(state=state, detail=detail, stage=stage, error=error_message)

    ocr_markdown = ""
    fhir_bundle = ""

    if result.get("ocr_output_path"):
      try:
        ocr_path = Path(result["ocr_output_path"])
        if ocr_path.exists():
          ocr_markdown = ocr_path.read_text(encoding="utf-8", errors="replace")
      except Exception as exc:
        logger.warning(f"Could not read OCR output: {exc}")

    if result.get("fhir_output_path"):
      try:
        fhir_path = Path(result["fhir_output_path"])
        if fhir_path.exists():
          fhir_bundle = fhir_path.read_text(encoding="utf-8", errors="replace")
      except Exception as exc:
        logger.warning(f"Could not read FHIR output: {exc}")

    fhir_valid = False
    if fhir_bundle:
      try:
        fhir_valid = validate_fhir_bundle(fhir_bundle)["valid"]
      except Exception as exc:
        logger.warning(f"FHIR validation error: {exc}")

    if state == "completed":
      try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
          """UPDATE runs SET status=?, fhir_valid=?, output_path=?, stage=?, finished_at=? WHERE job_id=?""",
          (
            "completed",
            fhir_valid,
            result.get("fhir_output_path", ""),
            stage,
            datetime.now(timezone.utc).isoformat(),
            job_id,
          ),
        )
        conn.commit()
        conn.close()
      except Exception as exc:
        logger.warning(f"Could not update run record: {exc}")

    return {
      "state": state,
      "progress": progress,
      "stage": stage,
      "detail": detail,
      "error": error_message,
      "job_id": job_id,
      "metrics": result.get("metadata", {}),
      "last_response": result,
      "fhir_bundle": fhir_bundle,
      "ocr_markdown": ocr_markdown,
      "fhir_valid": fhir_valid,
    }
  except (httpx.ReadTimeout, httpx.ConnectError) as exc:
    logger.warning(f"Gateway status poll unavailable for {job_id}: {exc}")
    async with STATUS_LOCK:
      snapshot = STATUS.copy()
    if snapshot.get("job_id") != job_id:
      snapshot = {
        "state": "processing",
        "progress": 0.0,
        "stage": "ocr",
        "detail": "Gateway status temporarily unavailable; job may still be running.",
        "error": str(exc),
        "job_id": job_id,
        "metrics": {},
        "last_response": {},
      }
    return {
      "state": snapshot.get("state", "processing"),
      "progress": snapshot.get("progress", 0.0),
      "stage": snapshot.get("stage", "ocr"),
      "detail": snapshot.get("detail", "Gateway status temporarily unavailable."),
      "error": str(exc),
      "job_id": job_id,
      "metrics": snapshot.get("metrics", {}),
      "last_response": snapshot.get("last_response", {}),
      "fhir_bundle": "",
      "ocr_markdown": "",
      "fhir_valid": False,
    }
                "completed": "complete",
                "failed": "error",
            }
            stage = stage_map.get(state, "unknown")

            await set_status(state=state, detail=detail, stage=stage, error=error_message)

            return {
                "state": state,
                "progress": progress,
                "stage": stage,
                "detail": detail,
                "error": error_message,
                "job_id": job_id,
                "metrics": result.get("metadata", {}),
                "last_response": result,
            }
        except (httpx.ReadTimeout, httpx.ConnectError):
            await asyncio.sleep(2)

    raise TimeoutError(f"Job {job_id} did not finish within {timeout_sec} seconds")


def validate_fhir_bundle(bundle_text: str | dict) -> dict:
    """Validate a FHIR bundle and return a simple validation summary."""
    errors: list[str] = []
    valid = True

    try:
        bundle = json.loads(bundle_text) if isinstance(bundle_text, str) else bundle_text
    except (json.JSONDecodeError, ValueError) as exc:
        return {"valid": False, "errors": [f"Invalid JSON: {exc}"], "resource_count": 0}

    if not isinstance(bundle, dict):
        return {"valid": False, "errors": ["FHIR payload must be a JSON object"], "resource_count": 0}

    if bundle.get("resourceType") != "Bundle":
        errors.append(f"Missing resourceType=Bundle (got {bundle.get('resourceType')})")
        valid = False

    bundle_type = bundle.get("type")
    if not bundle_type:
        errors.append("Missing Bundle type")
        valid = False
    elif bundle_type not in {"collection", "transaction", "batch", "history", "searchset"}:
        errors.append(f"Invalid Bundle type: {bundle_type}")
        valid = False

    entries = bundle.get("entry")
    if entries is None:
        errors.append("Missing entry array")
        valid = False
        entries = []
    elif not isinstance(entries, list):
        errors.append("Entry must be a list")
        valid = False
        entries = []
    else:
        for index, entry in enumerate(entries):
            resource = entry.get("resource") if isinstance(entry, dict) else None
            if not isinstance(resource, dict):
                errors.append(f"Entry {index}: missing resource")
                valid = False
                continue
            if "resourceType" not in resource:
                errors.append(f"Entry {index}: missing resourceType")
                valid = False
            if "id" not in resource:
                errors.append(f"Entry {index}: missing id")
                valid = False

    resource_count = len(entries)
    if valid:
        errors.insert(0, f"Valid FHIR Bundle with {resource_count} resources")

    return {"valid": valid, "errors": errors, "resource_count": resource_count}


def build_home() -> str:
    """Build HTML dashboard."""
    return """
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>DOC2FHIR Gateway UI</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --ink: #c9d1d9;
      --muted: #8b949e;
      --line: #30363d;
      --accent: #238636;
      --shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Manrope", "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .page { max-width: 1400px; margin: 20px auto; padding: 0 12px; }
    .hero { margin-bottom: 20px; }
    .hero h1 { margin: 0 0 4px; font-size: 2rem; font-weight: 800; color: #fff; }
    .hero p { margin: 0; color: var(--muted); font-size: 0.9rem; }

    form {
      border: 1px solid var(--line);
      padding: 14px;
      border-radius: 12px;
      background: var(--card);
      box-shadow: var(--shadow);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 20px;
    }

    .field label { display: block; margin-bottom: 5px; font-weight: 700; color: var(--muted); font-size: 0.85rem; }
    .dropzone {
      border: 2px dashed #30363d;
      border-radius: 10px;
      background: #0d1117;
      min-height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 10px;
      cursor: pointer;
      text-align: center;
    }
    .dropzone.active { background: #161b22; border-color: var(--accent); }
    .dropzone-title { font-weight: 800; color: #58a6ff; font-size: 0.95rem; }
    .dropzone-sub { color: var(--muted); font-size: 0.84rem; }
    .file-name { font-size: 0.8rem; color: #79c0ff; margin-top: 4px; font-weight: 600; }
    #file-input { display: none; }

    button {
      border: 1px solid var(--line);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
    }
    #run-btn { background: var(--accent); border-color: rgba(240,246,252,0.1); }
    #run-btn:hover { background: #2ea043; }
    #clear-btn { background: #21262d; border-color: var(--line); }
    #clear-btn:hover { background: #30363d; }

    .status { margin-bottom: 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); box-shadow: var(--shadow); padding: 15px; }
    .status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .badge { font-size: 0.8rem; font-weight: 800; color: #fff; background: #238636; border: 1px solid rgba(240,246,252,0.1); border-radius: 999px; padding: 5px 12px; text-transform: uppercase; }
    .status-detail { color: var(--muted); font-weight: 600; font-size: 0.9rem; }
    .status-bar { margin: 12px 0; height: 8px; border-radius: 999px; background: #30363d; overflow: hidden; }
    .status-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.3s ease; }

    .stage-tracker { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; }
    .stage { padding: 10px; border-radius: 8px; text-align: center; font-size: 0.75rem; font-weight: 700; background: #21262d; }
    .stage.active { background: #238636; color: #fff; }
    .stage.done { background: #238636; color: #fff; }

    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .metric-card { background: #0d1117; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .metric-card .m-val { font-size: 1.3rem; font-weight: 800; color: #fff; }
    .metric-card .m-lbl { font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-top: 6px; }

    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 15px; background: var(--card); box-shadow: var(--shadow); }
    .card-title { font-weight: 800; margin-bottom: 12px; color: #fff; font-size: 0.9rem; text-transform: uppercase; }
    .output-box { background: #0d1117; border: 1px solid var(--line); border-radius: 8px; padding: 12px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; color: #7ee787; }
    .validation-result { margin-top: 12px; }
    .validation-result .item { margin: 4px 0; }
    .validation-result .pass { color: #3fb950; }
    .validation-result .fail { color: #f85149; }

    .tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
    .tab-btn { border: none; background: transparent; color: var(--muted); padding: 8px 12px; cursor: pointer; font-weight: 600; font-size: 0.8rem; border-bottom: 2px solid transparent; }
    .tab-btn.active { color: #fff; border-bottom-color: var(--accent); }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    .history { margin-top: 20px; }
    .history-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .history-table th { background: #21262d; padding: 8px; text-align: left; font-weight: 700; border-bottom: 1px solid var(--line); }
    .history-table td { padding: 8px; border-bottom: 1px solid var(--line); }
    .history-table tr:hover { background: #161b22; }

    #msg { margin-bottom: 12px; font-size: 0.85rem; font-weight: 600; padding: 10px; border-radius: 8px; display: none; }
    #msg.success { display: block; background: #238636; color: #fff; }
    #msg.error { display: block; background: #f85149; color: #fff; }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <h1>DOC2FHIR Gateway</h1>
      <p>Unified end-to-end pipeline: Upload → OCR → Mapper → FHIR Validation</p>
    </div>

    <form id="parse-form" action="#" method="post" enctype="multipart/form-data">
      <div class="field">
        <label>DOCUMENT</label>
        <div id="dropzone" class="dropzone" role="button" tabindex="0">
          <div class="dropzone-title">Drop PDF or Image</div>
          <div class="dropzone-sub">Click to browse</div>
          <div id="file-name" class="file-name"></div>
        </div>
        <input id="file-input" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required />
      </div>
      <button id="clear-btn" type="button">RESET</button>
      <button id="run-btn" type="submit">START PIPELINE</button>
    </form>

    <div id="msg"></div>

    <div class="status">
      <div class="status-header">
        <span style="font-weight: 800; text-transform: uppercase; font-size: 0.8rem;">Pipeline Status</span>
        <span id="status-state" class="badge">idle</span>
      </div>
      <div class="status-bar"><div id="status-fill" class="status-fill"></div></div>
      <div id="status-detail" class="status-detail">Ready</div>

      <div class="stage-tracker">
        <div class="stage" id="stage-ocr">OCR</div>
        <div class="stage" id="stage-mapper">Mapper</div>
        <div class="stage" id="stage-validation">Validation</div>
        <div class="stage" id="stage-downstream">Downstream</div>
        <div class="stage" id="stage-complete">Complete</div>
      </div>

      <div class="metrics">
        <div class="metric-card">
          <div class="m-val" id="m-job-id">-</div>
          <div class="m-lbl">Job ID</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="m-elapsed">0.0s</div>
          <div class="m-lbl">Elapsed</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="m-progress">0%</div>
          <div class="m-lbl">Progress</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="m-state">idle</div>
          <div class="m-lbl">Current State</div>
        </div>
      </div>
    </div>

    <div class="layout">
      <div class="card">
        <div class="card-title">OCR Output (Markdown)</div>
        <div class="tabs">
          <button class="tab-btn active" data-tab="ocr-raw">Raw</button>
          <button class="tab-btn" data-tab="ocr-rendered">Rendered</button>
        </div>
        <div id="tab-ocr-raw" class="tab-pane active">
          <div id="ocr-output" class="output-box">Awaiting OCR results...</div>
        </div>
        <div id="tab-ocr-rendered" class="tab-pane">
          <div id="ocr-rendered" class="output-box" style="font-family: inherit; color: inherit;"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">FHIR Bundle Output</div>
        <div class="tabs">
          <button class="tab-btn active" data-tab="fhir-raw">Raw JSON</button>
          <button class="tab-btn" data-tab="fhir-validation">Validation</button>
          <button class="tab-btn" data-tab="fhir-formatted">Formatted</button>
        </div>
        <div id="tab-fhir-raw" class="tab-pane active">
          <div id="fhir-output" class="output-box">Awaiting FHIR bundle...</div>
        </div>
        <div id="tab-fhir-validation" class="tab-pane">
          <div id="fhir-validation" class="validation-result"></div>
        </div>
        <div id="tab-fhir-formatted" class="tab-pane">
          <div id="fhir-formatted" class="output-box" style="white-space: pre-wrap; font-size: 0.75rem;"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Run History</div>
      <table class="history-table">
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Filename</th>
            <th>Job ID</th>
            <th>Status</th>
            <th>Stage</th>
            <th>FHIR Valid</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody id="history-body">
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileName = document.getElementById('file-name');
    const runBtn = document.getElementById('run-btn');
    const clearBtn = document.getElementById('clear-btn');
    const msgBox = document.getElementById('msg');

    const stateEl = document.getElementById('status-state');
    const detailEl = document.getElementById('status-detail');
    const fillEl = document.getElementById('status-fill');
    const mJobId = document.getElementById('m-job-id');
    const mElapsed = document.getElementById('m-elapsed');
    const mProgress = document.getElementById('m-progress');
    const mState = document.getElementById('m-state');

    const ocrOutput = document.getElementById('ocr-output');
    const ocrRendered = document.getElementById('ocr-rendered');
    const fhirOutput = document.getElementById('fhir-output');
    const fhirValidation = document.getElementById('fhir-validation');
    const fhirFormatted = document.getElementById('fhir-formatted');

    let currentJobId = null;
    let pollTimer = null;
    let startTime = null;

    function setMessage(text, type) {
      msgBox.textContent = text;
      msgBox.className = type;
      msgBox.style.display = 'block';
    }

    function clearMessage() {
      msgBox.style.display = 'none';
    }

    function setTab(groupPrefix, tab) {
      document.querySelectorAll(`[data-tab^="${groupPrefix}"]`).forEach(btn => {
        btn.classList.remove('active');
      });
      document.querySelectorAll(`[id^="tab-${groupPrefix}"]`).forEach(pane => {
        pane.classList.remove('active');
      });
      document.querySelector(`[data-tab="${groupPrefix}-${tab}"]`).classList.add('active');
      document.getElementById(`tab-${groupPrefix}-${tab}`).classList.add('active');
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        const [prefix] = tab.split('-');
        setTab(prefix, tab.split('-').slice(1).join('-'));
      });
    });

    function progressForState(state) {
      const map = {
        idle: 0,
        uploading: 15,
        queued: 25,
        ocr_processing: 40,
        mapping: 65,
        completed: 100,
        error: 100,
      };
      return map[state] ?? 0;
    }

    function stageIndexForState(state) {
      const map = {
        ocr_processing: 0,
        mapping: 1,
        completed: 2,
        downstream: 3,
      };
      return map[state] ?? -1;
    }

    function updateStageTracker(currentStage) {
      const stages = ['stage-ocr', 'stage-mapper', 'stage-validation', 'stage-downstream', 'stage-complete'];
      const idx = stageIndexForState(currentStage);
      stages.forEach((id, i) => {
        const el = document.getElementById(id);
        el.classList.remove('active', 'done');
        if (i < idx) el.classList.add('done');
        if (i === idx) el.classList.add('active');
      });
    }

    async function pollStatus() {
      if (!currentJobId) return;

      try {
        const res = await fetch(`/poll/${currentJobId}`);
        if (!res.ok) return;

        const data = await res.json();
        const state = data.state || 'idle';
        const stage = data.stage || 'none';

        stateEl.textContent = state.toUpperCase();
        detailEl.textContent = data.detail || '';
        mJobId.textContent = currentJobId.slice(0, 12) + '...';
        mProgress.textContent = Math.round(data.progress * 100) + '%';
        mState.textContent = state;

        fillEl.style.width = (progressForState(state) + '%');
        updateStageTracker(state);

        const elapsed = data.started_at ? (Date.now() / 1000 - data.started_at) : 0;
        mElapsed.textContent = elapsed.toFixed(1) + 's';

        // Display outputs
        if (data.last_response) {
          const resp = data.last_response;
          if (resp.ocr_output_path) {
            ocrOutput.textContent = resp.detail || '(OCR completed)';
          }
          // In real scenario, would fetch actual files here
        }

        // Display FHIR if available
        if (data.fhir_bundle) {
          const bundle = data.fhir_bundle;
          fhirOutput.textContent = JSON.stringify(bundle, null, 2);
          fhirFormatted.textContent = JSON.stringify(bundle, null, 2);

          // Validate
          const validation = validateFhir(bundle);
          let html = validation.errors.map(e => {
            const pass = e.includes('valid') || e.includes('found') || e.includes('PASS');
            return `<div class="item ${pass ? 'pass' : 'fail'}">${e}</div>`;
          }).join('');
          fhirValidation.innerHTML = html;
        }

        if (state === 'completed' || state === 'failed') {
          clearInterval(pollTimer);
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    }

    function validateFhir(bundle) {
      const errors = [];
      if (bundle.resourceType !== 'Bundle') {
        errors.push('FAIL: resourceType must be Bundle');
      } else {
        errors.push('PASS: resourceType is Bundle');
      }
      if (bundle.type) {
        errors.push(`PASS: Bundle type is ${bundle.type}`);
      } else {
        errors.push('FAIL: missing Bundle type');
      }
      if (bundle.entry && Array.isArray(bundle.entry)) {
        errors.push(`PASS: Entry array found with ${bundle.entry.length} items`);
      } else {
        errors.push('FAIL: missing or invalid entry array');
      }
      return { valid: !errors.some(e => e.includes('FAIL')), errors };
    }

    async function refreshHistory() {
      try {
        const res = await fetch('/history');
        const data = await res.json();
        const body = document.getElementById('history-body');
        body.innerHTML = '';
        (data.runs || []).forEach(run => {
          const row = document.createElement('tr');
          const duration = run.finished_at && run.started_at 
            ? (run.finished_at - run.started_at).toFixed(1) + 's'
            : '-';
          const fhirVal = run.fhir_valid ? '✓' : '✗';
          row.innerHTML = `
            <td style="font-family: monospace; font-size: 0.75rem;">${run.id.slice(0, 10)}</td>
            <td>${run.filename}</td>
            <td style="font-family: monospace; font-size: 0.75rem;">${(run.job_id || '-').slice(0, 10)}</td>
            <td>${run.status}</td>
            <td>${run.stage}</td>
            <td>${fhirVal}</td>
            <td>${duration}</td>
          `;
          body.appendChild(row);
        });
      } catch (e) {
        console.error('History error:', e);
      }
    }

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileName.textContent = file ? `Selected: ${file.name}` : '';
    });

    ['dragenter', 'dragover'].forEach(e => {
      dropzone.addEventListener(e, (ev) => {
        ev.preventDefault();
        dropzone.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach(e => {
      dropzone.addEventListener(e, (ev) => {
        ev.preventDefault();
        dropzone.classList.remove('active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      fileInput.files = e.dataTransfer.files;
      fileName.textContent = fileInput.files[0] ? `Selected: ${fileInput.files[0].name}` : '';
    });

    clearBtn.addEventListener('click', () => {
      if (pollTimer) clearInterval(pollTimer);
      fileInput.value = '';
      fileName.textContent = '';
      currentJobId = null;
      stateEl.textContent = 'IDLE';
      detailEl.textContent = 'Ready';
      mJobId.textContent = '-';
      mProgress.textContent = '0%';
      mState.textContent = 'idle';
      fillEl.style.width = '0%';
      ocrOutput.textContent = 'Awaiting OCR results...';
      fhirOutput.textContent = 'Awaiting FHIR bundle...';
      clearMessage();
      document.querySelectorAll('.stage').forEach(s => s.classList.remove('active', 'done'));
    });

    document.getElementById('parse-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!fileInput.files || !fileInput.files[0]) {
        setMessage('Please select a file', 'error');
        return;
      }

      clearMessage();
      runBtn.disabled = true;
      startTime = Date.now() / 1000;

      try {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);

        const res = await fetch('/submit', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok) {
          setMessage(`Error: ${data.detail || 'upload failed'}`, 'error');
          runBtn.disabled = false;
          return;
        }

        currentJobId = data.job_id;
        mJobId.textContent = currentJobId.slice(0, 12) + '...';
        setMessage(`Job submitted: ${currentJobId}`, 'success');

        // Start polling
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollStatus, 2000);
        await pollStatus();
      } catch (err) {
        setMessage(`Error: ${err.message}`, 'error');
        runBtn.disabled = false;
      }
    });

    // Initialize
    clearBtn.click();
    refreshHistory();
    setInterval(refreshHistory, 10000);
  </script>
</body>
</html>
"""


# ============================================================================
# FASTAPI ENDPOINTS
# ============================================================================

@app.on_event("startup")
async def startup():
    """Initialize database on app startup"""
    init_db()


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the unified UI dashboard"""
    return build_home()


@app.post("/submit")
async def submit_file(file: UploadFile = File(...)):
    """
    Accept file upload, submit to gateway for processing.
    Returns: {job_id, filename}
    """
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        content = await file.read()
        file_path.write_bytes(content)
        logger.info(f"Uploaded file: {file.filename} ({len(content)} bytes)")
        
        # Submit to gateway
        async with httpx.AsyncClient(timeout=30) as client:
            with open(file_path, 'rb') as f:
                files = {'file': (file.filename, f, mimetypes.guess_type(file.filename)[0])}
                response = await client.post(
                    f"{GATEWAY_BASE_URL}/v1/document/upload",
                    files=files
                )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Gateway error: {response.text}"
            )
        
        result = response.json()
        job_id = result.get("job_id")
        
        if not job_id:
            raise HTTPException(status_code=500, detail="No job_id returned from gateway")
        
        # Initialize status tracking
        await set_status(
            state="queued",
            detail="Submitted to gateway",
            stage="ocr",
            error=""
        )
        
        # Save run to database
        run_id = str(uuid.uuid4())
        save_run(
            run_id=run_id,
            filename=file.filename,
            job_id=job_id,
            status="running",
            stage="ocr",
            metrics="{}",
            fhir_valid=False,
            output_path=""
        )
        
        logger.info(f"Job submitted: {job_id} (run_id: {run_id})")
        return {"job_id": job_id, "filename": file.filename, "run_id": run_id}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/poll/{job_id}")
async def poll_job(job_id: str):
    """
    Poll gateway for job status and progress.
    Returns: {state, progress, stage, detail, error, metrics, last_response, fhir_bundle, ocr_markdown}
    """
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{GATEWAY_BASE_URL}/v1/document/status/{job_id}"
            )
      return {
        "state": state,
        "progress": progress,
        "stage": stage,
        "detail": detail,
        "error": error_message,
        "job_id": job_id,
        "metrics": result.get("metadata", {}),
        "last_response": result,
        "fhir_bundle": fhir_bundle,
        "ocr_markdown": ocr_markdown,
        "fhir_valid": fhir_valid
      }
    except (httpx.ReadTimeout, httpx.ConnectError) as exc:
      logger.warning(f"Gateway status poll unavailable for {job_id}: {exc}")
      async with STATUS_LOCK:
        snapshot = STATUS.copy()
      if snapshot.get("job_id") != job_id:
        snapshot = {
          "state": "processing",
          "progress": 0.0,
          "stage": "ocr",
          "detail": "Gateway status temporarily unavailable; job may still be running.",
          "error": str(exc),
          "job_id": job_id,
          "metrics": {},
          "last_response": {},
        }
      return {
        "state": snapshot.get("state", "processing"),
        "progress": snapshot.get("progress", 0.0),
        "stage": snapshot.get("stage", "ocr"),
        "detail": snapshot.get("detail", "Gateway status temporarily unavailable."),
        "error": str(exc),
        "job_id": job_id,
        "metrics": snapshot.get("metrics", {}),
        "last_response": snapshot.get("last_response", {}),
        "fhir_bundle": "",
        "ocr_markdown": "",
        "fhir_valid": False,
      }
                "fhir_bundle": "",
                "ocr_markdown": ""
            }
        
        result = response.json()
        state = result.get("state", "unknown")
        progress = float(result.get("progress", 0))
        detail = result.get("detail", "")
        error_message = result.get("error_message", "")
        
        # Map gateway state to UI stage
        stage_map = {
            "queued": "ocr",
            "ocr_processing": "ocr",
            "mapping": "mapper",
            "validating": "validation",
            "downstream": "downstream",
            "completed": "complete",
            "failed": "error"
        }
        stage = stage_map.get(state, "unknown")
        
        # Update global status
        await set_status(state=state, detail=detail, stage=stage, error=error_message)
        
        # Fetch outputs if available
        ocr_markdown = ""
        fhir_bundle = ""
        
        if result.get("ocr_output_path"):
            try:
                ocr_path = Path(result["ocr_output_path"])
                if ocr_path.exists():
                    ocr_markdown = ocr_path.read_text(encoding='utf-8', errors='replace')
            except Exception as e:
                logger.warning(f"Could not read OCR output: {e}")
        
        if result.get("fhir_output_path"):
            try:
                fhir_path = Path(result["fhir_output_path"])
                if fhir_path.exists():
                    fhir_bundle = fhir_path.read_text(encoding='utf-8', errors='replace')
            except Exception as e:
                logger.warning(f"Could not read FHIR output: {e}")
        
        # Validate FHIR if available
        fhir_valid = False
        if fhir_bundle:
            try:
                fhir_valid = validate_fhir_bundle(fhir_bundle)
            except Exception as e:
                logger.warning(f"FHIR validation error: {e}")
        
        # Update run record on completion
        if state == "completed":
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute(
                    """UPDATE runs SET status=?, fhir_valid=?, output_path=?, 
                       stage=?, finished_at=? WHERE job_id=?""",
                    ("completed", fhir_valid, result.get("fhir_output_path", ""),
                     stage, datetime.now(timezone.utc).isoformat(), job_id)
                )
                conn.commit()
                conn.close()
            except Exception as e:
                logger.warning(f"Could not update run record: {e}")
        
        return {
            "state": state,
            "progress": progress,
            "stage": stage,
            "detail": detail,
            "error": error_message,
            "job_id": job_id,
            "metrics": result.get("metadata", {}),
            "last_response": result,
            "fhir_bundle": fhir_bundle,
            "ocr_markdown": ocr_markdown,
            "fhir_valid": fhir_valid
        }
    
    except Exception as e:
        logger.error(f"Error polling job {job_id}: {e}", exc_info=True)
        return {
            "state": "error",
            "progress": STATUS["progress"],
            "stage": STATUS["stage"],
            "detail": str(e),
            "error": str(e),
            "job_id": job_id,
            "metrics": {},
            "last_response": {},
            "fhir_bundle": "",
            "ocr_markdown": ""
        }


@app.get("/history")
async def get_history():
    """Get run history from database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, filename, job_id, status, started_at, finished_at, 
                      fhir_valid, stage, metrics_json, output_path 
               FROM runs ORDER BY created_at DESC LIMIT 50"""
        )
        rows = cursor.fetchall()
        conn.close()
        
        runs = []
        for row in rows:
            run_dict = dict(row)
            # Calculate duration
            if row["started_at"] and row["finished_at"]:
                start = datetime.fromisoformat(row["started_at"])
                end = datetime.fromisoformat(row["finished_at"])
                duration_sec = (end - start).total_seconds()
                run_dict["duration_sec"] = duration_sec
            else:
                run_dict["duration_sec"] = None
            runs.append(run_dict)
        
        return {"runs": runs}
    
    except Exception as e:
        logger.error(f"Error fetching history: {e}", exc_info=True)
        return {"runs": [], "error": str(e)}


@app.post("/delete_run/{run_id}")
async def delete_run(run_id: str):
    """Delete a run from history"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM runs WHERE id=?", (run_id,))
        conn.commit()
        conn.close()
        logger.info(f"Deleted run: {run_id}")
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting run: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "unified_ui:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )
