#!/usr/bin/env python3
"""Unified DOC2FHIR Command Center — FastAPI SPA, port 8503."""

from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
GATEWAY_URL = os.getenv("DOC2FHIR_GATEWAY_URL", "http://127.0.0.1:8001")
OCR_URL = os.getenv("DOC2FHIR_OCR_URL", "http://127.0.0.1:7862")
MAPPER_URL = os.getenv("DOC2FHIR_MAPPER_URL", "http://127.0.0.1:8070")
HAPI_FHIR_URL = os.getenv("DOC2FHIR_HAPI_FHIR_URL", "http://127.0.0.1:8080/fhir")

# Local-only by default — this debug UI is not meant to be exposed cross-origin.
UI_V2_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DOC2FHIR_UI_V2_ALLOWED_ORIGINS",
        "http://127.0.0.1:8503,http://localhost:8503",
    ).split(",")
    if origin.strip()
]

# Shared secret guarding destructive endpoints (history/FHIR resource deletion).
# Unset by default — deletion is disabled until an operator explicitly sets it.
UI_V2_INTERNAL_SECRET = os.getenv("DOC2FHIR_INTERNAL_SECRET", "")


def _require_internal_secret(request: Request) -> None:
    """Fail-closed guard for destructive endpoints: no secret configured means no deletes."""
    if not UI_V2_INTERNAL_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Destructive operations are disabled: DOC2FHIR_INTERNAL_SECRET is not configured.",
        )
    if request.headers.get("X-Internal-Secret") != UI_V2_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Internal-Secret.")
VLLM_LOG_PATH = ROOT / ".." / "OCR" / "OCRpipelie" / "vLLM_8118_lowvram.log"
DB_PATH = ROOT / ".ui_v2_history.db"

STATUS = {"state": "idle", "detail": "Idle", "updated_at": time.time()}

VLLM_LOG_PATH = VLLM_LOG_PATH.resolve()

# ---------------------------------------------------------------------------
# SQLite history helpers
# ---------------------------------------------------------------------------

def _init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            filename TEXT,
            job_id TEXT,
            status TEXT,
            stage TEXT,
            started_at REAL,
            finished_at REAL,
            fhir_valid INTEGER DEFAULT 0,
            metrics_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.commit()
    conn.close()


def _save_run(run_id: str, filename: str, job_id: str, status: str = "running",
              stage: str = "ocr", started_at: float | None = None,
              finished_at: float | None = None, fhir_valid: bool = False,
              metrics: dict | None = None):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """INSERT OR REPLACE INTO runs
           (id, filename, job_id, status, stage, started_at, finished_at, fhir_valid, metrics_json)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (run_id, filename, job_id, status, stage, started_at, finished_at,
         int(fhir_valid), json.dumps(metrics or {})),
    )
    conn.commit()
    conn.close()


def _get_runs(limit: int = 50) -> list[dict]:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _delete_run(run_id: str):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("DELETE FROM runs WHERE id=?", (run_id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# HTML page builder
# ---------------------------------------------------------------------------

def build_home() -> str:
    return r"""<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>DOC2FHIR Command Center</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117; --card: #161b22; --ink: #c9d1d9; --muted: #8b949e;
      --line: #30363d; --accent: #238636; --shadow: 0 8px 24px rgba(0,0,0,0.5);
      --vram-color: #2166ac; --token-color: #2f8f2f; --page-color: #cc7a00;
      --latency-color: #8f3fb0; --warn: #d29922; --danger: #f85149;
      --blue: #58a6ff; --purple: #bc8cff; --orange: #d29922;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: "Manrope","Segoe UI",sans-serif;
      color: var(--ink); background: var(--bg);
    }
    .page { max-width: 1400px; margin: 0 auto; padding: 0 12px 20px; }

    /* === System Radar === */
    .radar {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg); border-bottom: 1px solid var(--line);
      padding: 8px 0; display: flex; align-items: center; gap: 10px;
      flex-wrap: wrap; margin-bottom: 10px;
    }
    .radar-title { font-weight: 800; color: #fff; font-size: 1rem; margin-right: auto; }
    .radar-badge {
      font-size: 0.65rem; font-weight: 700; padding: 3px 10px;
      border-radius: 999px; border: 1px solid var(--line);
      display: inline-flex; align-items: center; gap: 4px;
    }
    .radar-badge .dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      animation: pulse-dot 2s infinite;
    }
    .dot.green { background: #3fb950; }
    .dot.yellow { background: var(--warn); }
    .dot.red { background: var(--danger); }
    @keyframes pulse-dot {
      0%,100% { opacity: 1; } 50% { opacity: 0.4; }
    }

    /* === Main Tabs === */
    .main-tabs {
      display: flex; gap: 2px; border-bottom: 1px solid var(--line);
      margin-bottom: 14px; overflow-x: auto;
    }
    .main-tab {
      border: none; background: transparent; color: var(--muted);
      padding: 10px 18px; cursor: pointer; font-weight: 700; font-size: 0.8rem;
      border-bottom: 2px solid transparent; transition: all 0.15s;
      white-space: nowrap;
    }
    .main-tab:hover { color: #fff; background: var(--card); }
    .main-tab.active { color: #fff; border-bottom-color: var(--accent); }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* === Section Title === */
    .section-title {
      font-size: 0.75rem; font-weight: 800; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.05em;
      border-bottom: 1px solid var(--line); padding-bottom: 4px; display: block;
      margin-bottom: 10px;
    }

    /* === Metric Cards === */
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px; margin-bottom: 10px;
    }
    .metric-card {
      background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
      padding: 12px; text-align: left; position: relative; overflow: hidden;
    }
    .metric-card .m-val { font-size: 1.3rem; font-weight: 800; color: #fff; line-height: 1.2; }
    .metric-card .m-sub { font-size: 0.7rem; color: var(--muted); margin-top: 2px; display: block; }
    .metric-card .m-lbl {
      font-size: 0.65rem; color: var(--muted); font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; display: block;
    }
    .metric-card.warning { border-color: var(--warn); }
    .metric-card.warning .m-val { color: var(--warn); }
    .metric-card.danger { border-color: var(--danger); }
    .metric-card.danger .m-val { color: var(--danger); }

    /* === Status Bar === */
    .status-bar { margin: 10px 0; height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
    .status-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.35s ease; }
    .badge {
      font-size: 0.75rem; font-weight: 800; color: #fff; background: var(--accent);
      border: 1px solid rgba(240,246,252,0.1); border-radius: 999px;
      padding: 4px 12px; text-transform: uppercase; display: inline-block;
    }

    /* === Dropzone === */
    .dropzone {
      border: 2px dashed var(--line); border-radius: 10px; background: var(--bg);
      min-height: 72px; display: flex; flex-direction: column;
      justify-content: center; align-items: center; padding: 10px;
      cursor: pointer; text-align: center;
    }
    .dropzone.active { background: var(--card); border-color: var(--accent); }
    .dropzone-title { font-weight: 800; color: var(--blue); font-size: 0.9rem; }
    .dropzone-sub { color: var(--muted); font-size: 0.8rem; margin-top: 2px; }
    .file-name { font-size: 0.8rem; color: #79c0ff; margin-top: 4px; font-weight: 600; }
    #file-input { display: none; }

    /* === Buttons === */
    button {
      border: 1px solid var(--line); color: #fff; padding: 8px 14px;
      border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.15s;
      font-family: inherit; font-size: 0.8rem;
    }
    button:hover { filter: brightness(1.15); }
    .btn-primary { background: var(--accent); border-color: rgba(240,246,252,0.1); }
    .btn-danger { background: var(--danger); }
    .btn-secondary { background: #21262d; }

    /* === Animated Pipeline === */
    .pipeline-flow {
      display: flex; align-items: center; justify-content: center;
      gap: 4px; padding: 14px 8px; overflow-x: auto;
    }
    .p-stage {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 14px; border-radius: 8px; background: var(--card);
      border: 1px solid var(--line); min-width: 80px; transition: all 0.4s;
      position: relative;
    }
    .p-stage .p-icon { font-size: 1.3rem; }
    .p-stage .p-label { font-size: 0.65rem; font-weight: 700; color: var(--muted); margin-top: 3px; text-transform: uppercase; }
    .p-stage .p-time { font-size: 0.6rem; color: var(--muted); font-family: monospace; }
    .p-stage.active { border-color: var(--accent); background: #162b1a; }
    .p-stage.active .p-label { color: var(--accent); }
    .p-stage.done { border-color: var(--accent); background: #162b1a; }
    .p-stage.done .p-label { color: #3fb950; }
    .p-stage.failed { border-color: var(--danger); background: #2a1a1a; }
    .p-stage.failed .p-label { color: var(--danger); }
    .p-arrow { color: var(--muted); font-size: 1rem; padding: 0 2px; }

    /* === Form Layout === */
    .form-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: end; margin-bottom: 12px; }

    /* === Layout columns === */
    .layout-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .card {
      border: 1px solid var(--line); border-radius: 10px; padding: 14px;
      background: var(--card); box-shadow: var(--shadow);
    }
    .card-title { font-weight: 800; color: #fff; font-size: 0.85rem; margin-bottom: 10px; text-transform: uppercase; }

    /* === Output Box === */
    .output-box {
      background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
      padding: 10px; max-height: 360px; overflow: auto;
      font-family: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
      font-size: 0.75rem; color: #7ee787; white-space: pre-wrap;
    }

    /* === Tabs (sub-tabs within a pane) === */
    .stabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 10px; }
    .stab-btn {
      border: none; background: transparent; color: var(--muted);
      padding: 6px 12px; cursor: pointer; font-weight: 600; font-size: 0.75rem;
      border-bottom: 2px solid transparent;
    }
    .stab-btn:hover { color: #fff; }
    .stab-btn.active { color: #fff; border-bottom-color: var(--accent); }
    .stab-pane { display: none; }
    .stab-pane.active { display: block; }

    /* === Performance Canvas === */
    #perf-canvas { width: 100%; height: 220px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); cursor: crosshair; }
    #perf-tooltip {
      position: fixed; background: rgba(13,17,23,0.95); border: 1px solid var(--line);
      border-radius: 4px; padding: 6px; font-size: 0.65rem; pointer-events: none;
      display: none; z-index: 200; box-shadow: var(--shadow); color: #fff;
    }

    /* === Queue Bars === */
    .b-row { display: grid; grid-template-columns: 110px 1fr 60px; align-items: center; gap: 8px; margin: 4px 0; }
    .b-label { font-size: 0.68rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
    .b-bar { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
    .b-fill { height: 100%; width: 0%; transition: width 0.35s ease; }
    .b-val { font-size: 0.68rem; color: var(--ink); font-weight: 800; text-align: right; font-family: monospace; }

    /* === Timing Strip === */
    .timing-bar-container { display: flex; height: 20px; background: var(--line); border-radius: 4px; overflow: hidden; margin: 6px 0; }
    .t-fill { height: 100%; transition: width 0.3s; position: relative; }
    .t-fill:hover::after { content: attr(data-label); position: absolute; top: -22px; left: 50%; transform: translateX(-50%); background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 9px; white-space: nowrap; z-index: 10; }

    /* === Logs Panel === */
    .logs-panel { border: 1px solid var(--line); border-radius: 8px; background: var(--bg); margin-top: 10px; overflow: hidden; }
    .logs-header {
      padding: 8px 12px; background: var(--card); color: #fff; font-size: 0.75rem;
      font-weight: 700; display: flex; justify-content: space-between;
      align-items: center; border-bottom: 1px solid var(--line);
    }
    .logs-body {
      padding: 10px; max-height: 160px; overflow-y: auto;
      font-family: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
      font-size: 0.7rem; color: #7ee787; margin: 0; white-space: pre-wrap; line-height: 1.4;
      transition: max-height 0.2s;
    }
    .logs-body.collapsed { max-height: 0; padding: 0; overflow: hidden; }

    /* === Config Grid === */
    .config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; padding: 10px; }
    .config-item { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
    .cfg-lbl { font-size: 0.6rem; color: var(--muted); text-transform: uppercase; font-weight: 700; display: block; }
    .cfg-val { font-size: 0.8rem; color: #fff; font-family: monospace; display: block; margin-top: 2px; }
    .cfg-note { font-size: 0.6rem; color: var(--warn); margin-top: 3px; display: block; font-style: italic; }

    /* === FHIR Graph === */
    #fhir-graph { width: 100%; height: 300px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }

    /* === History Table === */
    .tbl { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
    .tbl th { background: var(--card); padding: 8px; text-align: left; font-weight: 700; border-bottom: 1px solid var(--line); color: var(--muted); text-transform: uppercase; font-size: 0.65rem; }
    .tbl td { padding: 8px; border-bottom: 1px solid var(--line); }
    .tbl tr:hover { background: var(--card); }

    /* === Neon DB === */
    .neon-search { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .neon-search select, .neon-search input {
      background: var(--bg); border: 1px solid var(--line); color: #fff;
      padding: 6px 10px; border-radius: 6px; font-family: inherit; font-size: 0.8rem;
    }
    .neon-search input { flex: 1; min-width: 120px; }

    /* === Mapper Lab === */
    .mapper-pane { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 500px; }
    .mapper-pane textarea {
      width: 100%; height: 220px; background: var(--bg); border: 1px solid var(--line);
      color: #7ee787; font-family: monospace; font-size: 0.75rem; padding: 8px; border-radius: 6px; resize: vertical;
    }
    #mapper-response { min-height: 300px; }

    /* === Msg === */
    #msg { margin-top: 8px; font-size: 0.8rem; font-weight: 600; padding: 8px 12px; border-radius: 6px; display: none; }
    #msg.success { display: block; background: var(--accent); color: #fff; }
    #msg.error { display: block; background: var(--danger); color: #fff; }
    #msg.info { display: block; background: #1f6feb; color: #fff; }

    /* === Image wrap === */
    .image-wrap { min-height: 400px; display: flex; align-items: center; justify-content: center; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .image-wrap img { max-width: 100%; max-height: 400px; object-fit: contain; }

    @media (max-width: 1000px) {
      .layout-2col { grid-template-columns: 1fr; }
      .mapper-pane { grid-template-columns: 1fr; }
      .form-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- ========== System Radar ========== -->
    <div class="radar">
      <span class="radar-title">☤ DOC2FHIR Command Center</span>
      <span class="radar-badge"><span class="dot green" id="rd-gateway"></span> Gateway</span>
      <span class="radar-badge"><span class="dot green" id="rd-ocr"></span> OCR</span>
      <span class="radar-badge"><span class="dot green" id="rd-mapper"></span> Mapper</span>
      <span class="radar-badge"><span class="dot green" id="rd-hapi"></span> HAPI FHIR</span>
      <span class="radar-badge" id="rd-gpu" style="font-family:monospace;">GPU: -- GB</span>
    </div>

    <!-- ========== Main Tabs ========== -->
    <div class="main-tabs">
      <button class="main-tab active" data-tab="pipeline">Pipeline</button>
      <button class="main-tab" data-tab="ocr">OCR Lab</button>
      <button class="main-tab" data-tab="mapper">Mapper Lab</button>
      <button class="main-tab" data-tab="history">History</button>
      <button class="main-tab" data-tab="neon">Neon DB</button>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: Pipeline                                                     -->
    <!-- ================================================================ -->
    <div id="tab-pipeline" class="tab-pane active">

      <div class="form-row">
        <div class="field">
          <div id="pl-dropzone" class="dropzone" role="button" tabindex="0">
            <div class="dropzone-title">Drop PDF or Image</div>
            <div class="dropzone-sub">Click to browse — .pdf .png .jpg .tif</div>
            <div id="pl-file-name" class="file-name"></div>
          </div>
          <input id="pl-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp"/>
        </div>
        <button id="pl-clear-btn" class="btn-secondary" type="button">Clear</button>
        <button id="pl-run-btn" class="btn-primary" type="button">Start Pipeline</button>
      </div>

      <div id="msg"></div>

      <!-- Animated Pipeline Flow -->
      <div class="pipeline-flow" id="pl-flow">
        <div class="p-stage" id="pl-s-upload"><span class="p-icon">📄</span><span class="p-label">Upload</span><span class="p-time"></span></div>
        <span class="p-arrow">→</span>
        <div class="p-stage" id="pl-s-ocr"><span class="p-icon">🔍</span><span class="p-label">OCR</span><span class="p-time"></span></div>
        <span class="p-arrow">→</span>
        <div class="p-stage" id="pl-s-extract"><span class="p-icon">🧩</span><span class="p-label">Extract</span><span class="p-time"></span></div>
        <span class="p-arrow">→</span>
        <div class="p-stage" id="pl-s-map"><span class="p-icon">🧠</span><span class="p-label">Map</span><span class="p-time"></span></div>
        <span class="p-arrow">→</span>
        <div class="p-stage" id="pl-s-delivery"><span class="p-icon">📤</span><span class="p-label">Delivery</span><span class="p-time"></span></div>
        <span class="p-arrow">→</span>
        <div class="p-stage" id="pl-s-done"><span class="p-icon">✅</span><span class="p-label">Complete</span><span class="p-time"></span></div>
      </div>

      <div class="status-bar"><div class="status-fill" id="pl-progress"></div></div>

      <!-- Results -->
      <div class="layout-2col" id="pl-results" style="display:none;">
        <div class="card">
          <div class="card-title">Original Document</div>
          <div class="image-wrap" id="pl-original-wrap">
            <img id="pl-original-img" style="display:none;" alt="Original"/>
            <object id="pl-original-pdf" type="application/pdf" style="display:none;width:100%;height:400px;"></object>
            <div id="pl-original-empty" style="color:var(--muted);font-size:0.8rem;">Waiting...</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">OCR Output</div>
          <div class="stabs">
            <button class="stab-btn active" data-tab="pl-ocr-text">Text</button>
            <button class="stab-btn" data-tab="pl-ocr-raw">JSON</button>
            <button class="stab-btn" data-tab="pl-ocr-layout">Layout</button>
          </div>
          <div id="stab-pl-ocr-text" class="stab-pane active"><div class="output-box" id="pl-ocr-text">Awaiting OCR...</div></div>
          <div id="stab-pl-ocr-raw" class="stab-pane"><div class="output-box" id="pl-ocr-raw">--</div></div>
          <div id="stab-pl-ocr-layout" class="stab-pane"><div class="output-box" id="pl-ocr-layout">--</div></div>
        </div>
      </div>

      <div class="layout-2col" id="pl-fhir-section" style="display:none;">
        <div class="card">
          <div class="card-title">FHIR Bundle</div>
          <div class="stabs">
            <button class="stab-btn active" data-tab="pl-fhir-table">Table</button>
            <button class="stab-btn" data-tab="pl-fhir-raw">JSON</button>
            <button class="stab-btn" data-tab="pl-fhir-val">Validation</button>
          </div>
          <div id="stab-pl-fhir-table" class="stab-pane active"><div class="output-box" id="pl-fhir-table" style="font-family:inherit;color:inherit;"></div></div>
          <div id="stab-pl-fhir-raw" class="stab-pane"><div class="output-box" id="pl-fhir-raw">--</div></div>
          <div id="stab-pl-fhir-val" class="stab-pane"><div class="output-box" id="pl-fhir-val" style="font-family:inherit;color:inherit;">--</div></div>
        </div>
        <div class="card">
          <div class="card-title">FHIR Resource Graph</div>
          <canvas id="fhir-graph"></canvas>
          <div style="margin-top:8px;">
            <button id="pl-push-btn" class="btn-primary" style="display:none;">Push to HAPI FHIR</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: OCR Lab                                                      -->
    <!-- ================================================================ -->
    <div id="tab-ocr" class="tab-pane">
      <div class="metrics-grid">
        <div class="metric-card" id="ocr-card-vram">
          <div class="m-val" id="ocr-vram">0.00 GB</div>
          <span class="m-sub" id="ocr-vram-pct">0% of 8 GB</span>
          <div class="m-lbl">VRAM Used</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="ocr-token-tps">0.0</div>
          <span class="m-sub" id="ocr-token-bd">0.0 gen + 0.0 prompt</span>
          <div class="m-lbl">Token TPS</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="ocr-page-tps">0.00 p/s</div>
          <span class="m-sub" id="ocr-page-min">≈ 0.0 pages/min</span>
          <div class="m-lbl">Throughput</div>
        </div>
        <div class="metric-card">
          <div class="m-val" id="ocr-elapsed">0.0s</div>
          <span class="m-sub" id="ocr-state-label">idle</span>
          <div class="m-lbl">Status</div>
        </div>
      </div>

      <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="metric-card"><div class="m-val" id="ocr-dataload">0.00s</div><div class="m-lbl">Data Load</div></div>
        <div class="metric-card"><div class="m-val" id="ocr-layout-time">0.00s</div><div class="m-lbl">Layout</div></div>
        <div class="metric-card"><div class="m-val" id="ocr-vlm-time">0.00s</div><div class="m-lbl">VLM Rec</div></div>
        <div class="metric-card"><div class="m-val" id="ocr-kv">0%</div><div class="m-lbl">KV Cache</div></div>
      </div>

      <div class="card" style="margin-top:10px;">
        <div class="card-title">Live Performance Trace</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.7rem;color:var(--muted);margin-bottom:8px;">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--vram-color);margin-right:4px;"></span>VRAM (GB)</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--token-color);margin-right:4px;"></span>Token TPS</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--page-color);margin-right:4px;"></span>Pages/s</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--latency-color);margin-right:4px;"></span>VLM Latency (s)</span>
        </div>
        <canvas id="perf-canvas"></canvas>
        <div id="perf-tooltip"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;">
          <div>
            <span class="section-title">Queue Depths</span>
            <div class="b-row"><div class="b-label">Data Loading</div><div class="b-bar"><div class="b-fill" id="q-load" style="background:var(--blue);"></div></div><div class="b-val"><span id="q-load-val">0</span>/32</div></div>
            <div class="b-row"><div class="b-label">Layout</div><div class="b-bar"><div class="b-fill" id="q-layout" style="background:var(--purple);"></div></div><div class="b-val"><span id="q-layout-val">0</span>/32</div></div>
            <div class="b-row"><div class="b-label">VLM</div><div class="b-bar"><div class="b-fill" id="q-vlm" style="background:var(--orange);"></div></div><div class="b-val"><span id="q-vlm-val">0</span>/32</div></div>
          </div>
          <div>
            <span class="section-title">Timing Breakdown</span>
            <div class="timing-bar-container">
              <div class="t-fill" id="t-load" style="background:var(--blue);width:0%;" data-label="Load"></div>
              <div class="t-fill" id="t-layout" style="background:var(--purple);width:0%;" data-label="Layout"></div>
              <div class="t-fill" id="t-vlm" style="background:var(--orange);width:0%;" data-label="VLM"></div>
            </div>
            <div id="ocr-bottleneck" style="font-size:0.7rem;color:var(--danger);font-weight:700;margin-top:4px;text-align:center;"></div>
          </div>
        </div>
      </div>

      <div class="logs-panel">
        <div class="logs-header"><span>Backend Config</span></div>
        <div class="config-grid" id="ocr-config"></div>
      </div>

      <div class="logs-panel">
        <div class="logs-header">
          <span>vLLM Log Trace</span>
          <button class="toggle-logs-btn" style="background:#21262d;border:1px solid var(--line);color:var(--ink);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem;">Show</button>
        </div>
        <pre class="logs-body collapsed" id="ocr-logs"></pre>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: Mapper Lab                                                   -->
    <!-- ================================================================ -->
    <div id="tab-mapper" class="tab-pane">
      <div class="mapper-pane">
        <div>
          <span class="section-title">System Prompt</span>
          <textarea id="mapper-prompt" placeholder="System prompt for FHIR mapping..."></textarea>
          <div style="display:flex;gap:6px;margin:6px 0;">
            <button id="mapper-load-prompt" class="btn-secondary">Load Prompt from File</button>
            <button id="mapper-load-ocr" class="btn-secondary">Load from Last OCR</button>
          </div>
          <span class="section-title">Medical Markdown Input</span>
          <textarea id="mapper-input" placeholder="Paste medical markdown text here..."></textarea>
          <div style="display:flex;gap:6px;margin:6px 0;">
            <button id="mapper-load-sample" class="btn-secondary">Load Sample Report</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
            <label style="font-size:0.7rem;color:var(--muted);">Context:</label>
            <input type="number" id="mapper-ctx" value="6144" style="width:70px;background:var(--bg);border:1px solid var(--line);color:#fff;padding:4px 6px;border-radius:4px;font-size:0.75rem;">
            <label style="font-size:0.7rem;color:var(--muted);">Max tokens:</label>
            <input type="number" id="mapper-maxtokens" value="4096" style="width:70px;background:var(--bg);border:1px solid var(--line);color:#fff;padding:4px 6px;border-radius:4px;font-size:0.75rem;">
            <button id="mapper-send" class="btn-primary">Send to Model</button>
          </div>
        </div>
        <div>
          <span class="section-title">Response</span>
          <div class="output-box" id="mapper-response">Ready...</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr);margin-top:8px;">
            <div class="metric-card"><div class="m-val" id="mapper-latency">--</div><div class="m-lbl">Latency</div></div>
            <div class="metric-card"><div class="m-val" id="mapper-tokens">--</div><div class="m-lbl">Input Tokens</div></div>
            <div class="metric-card"><div class="m-val" id="mapper-status">--</div><div class="m-lbl">Status</div></div>
          </div>
          <div class="stabs" style="margin-top:8px;">
            <button class="stab-btn active" data-tab="map-val">Validation</button>
            <button class="stab-btn" data-tab="map-json">Formatted</button>
          </div>
          <div id="stab-map-val" class="stab-pane active"><div class="output-box" id="map-val-box" style="font-family:inherit;color:inherit;max-height:200px;">Awaiting response...</div></div>
          <div id="stab-map-json" class="stab-pane"><div class="output-box" id="map-json-box">--</div></div>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: History                                                      -->
    <!-- ================================================================ -->
    <div id="tab-history" class="tab-pane">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <input type="text" id="hist-search" placeholder="Search filename or job..." style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--line);color:#fff;padding:6px 10px;border-radius:6px;font-family:inherit;font-size:0.8rem;">
        <button id="hist-refresh" class="btn-secondary">Refresh</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="tbl">
          <thead><tr>
            <th>Run ID</th><th>File</th><th>Job ID</th><th>Status</th><th>Stage</th><th>FHIR</th><th>Duration</th><th>Action</th>
          </tr></thead>
          <tbody id="hist-body"></tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-title">Performance Trend <span style="font-weight:400;font-size:0.7rem;color:var(--muted);text-transform:none;">(last 20 runs)</span></div>
        <canvas id="hist-chart" style="width:100%;height:200px;border:1px solid var(--line);border-radius:6px;background:var(--bg);"></canvas>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: Neon DB                                                      -->
    <!-- ================================================================ -->
    <div id="tab-neon" class="tab-pane">
      <div class="neon-search">
        <select id="neon-type">
          <option value="Patient">Patient</option>
          <option value="Observation">Observation</option>
          <option value="DiagnosticReport">DiagnosticReport</option>
          <option value="Condition">Condition</option>
          <option value="MedicationRequest">MedicationRequest</option>
          <option value="AllergyIntolerance">AllergyIntolerance</option>
          <option value="Provenance">Provenance</option>
          <option value="Basic">Basic</option>
        </select>
        <input type="text" id="neon-search" placeholder="Search by ID or patient reference...">
        <button id="neon-fetch" class="btn-primary">Fetch</button>
        <button id="neon-stats" class="btn-secondary">Count All Types</button>
      </div>
      <div id="neon-counts" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;"></div>
      <div style="overflow-x:auto;">
        <table class="tbl">
          <thead><tr><th>ID</th><th>Type</th><th>Summary</th><th>Actions</th></tr></thead>
          <tbody id="neon-body"></tbody>
        </table>
      </div>
      <div class="card" style="margin-top:10px;display:none;" id="neon-detail-card">
        <div class="card-title">Resource Detail <button id="neon-detail-close" class="btn-secondary" style="float:right;padding:2px 8px;font-size:0.65rem;">Close</button></div>
        <div class="output-box" id="neon-detail" style="max-height:400px;"></div>
      </div>
    </div>
  </div>

  <script>
    // ======================================================================
    // TAB SYSTEM
    // ======================================================================
    (function() {
      const mainTabs = document.querySelectorAll('.main-tab');
      const panes = {};
      mainTabs.forEach(t => { panes[t.dataset.tab] = document.getElementById('tab-'+t.dataset.tab); });
      mainTabs.forEach(t => {
        t.addEventListener('click', () => {
          mainTabs.forEach(x => x.classList.remove('active'));
          Object.values(panes).forEach(p => p.classList.remove('active'));
          t.classList.add('active');
          const pane = panes[t.dataset.tab];
          if (pane) pane.classList.add('active');
        });
      });
    })();

    // Sub-tabs
    document.querySelectorAll('.stabs').forEach(group => {
      group.querySelectorAll('.stab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const parent = btn.closest('.card') || btn.closest('div');
          group.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = document.getElementById('stab-'+btn.dataset.tab);
          if (target) {
            parent.querySelectorAll('.stab-pane').forEach(p => p.classList.remove('active'));
            target.classList.add('active');
          }
        });
      });
    });

    // Logs toggle
    document.querySelectorAll('.toggle-logs-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const body = btn.closest('.logs-panel').querySelector('.logs-body');
        body.classList.toggle('collapsed');
        btn.textContent = body.classList.contains('collapsed') ? 'Show' : 'Hide';
      });
    });

    // ======================================================================
    // SYSTEM RADAR
    // ======================================================================
    async function updateRadar() {
      try {
        const r = await fetch('/api/health');
        const d = await r.json();
        const setDot = (id, ok) => {
          const el = document.getElementById('rd-'+id);
          if (el) { el.className = 'dot ' + (ok ? 'green' : 'red'); }
        };
        setDot('gateway', d.gateway);
        setDot('ocr', d.ocr);
        setDot('mapper', d.mapper);
        setDot('hapi', d.hapi);
        if (d.gpu !== undefined) {
          document.getElementById('rd-gpu').textContent = 'GPU: ' + d.gpu.toFixed(2) + ' GB';
        }
      } catch(_) {}
    }
    setInterval(updateRadar, 5000);
    updateRadar();

    // ======================================================================
    // PIPELINE TAB
    // ======================================================================
    const plDrop = document.getElementById('pl-dropzone');
    const plFile = document.getElementById('pl-file-input');
    const plFileName = document.getElementById('pl-file-name');

    plDrop.addEventListener('click', () => plFile.click());
    plFile.addEventListener('change', () => {
      const f = plFile.files && plFile.files[0];
      plFileName.textContent = f ? 'Selected: ' + f.name : '';
    });
    ['dragenter','dragover'].forEach(e => { plDrop.addEventListener(e, ev => { ev.preventDefault(); plDrop.classList.add('active'); }); });
    ['dragleave','drop'].forEach(e => { plDrop.addEventListener(e, ev => { ev.preventDefault(); plDrop.classList.remove('active'); }); });
    plDrop.addEventListener('drop', e => { plFile.files = e.dataTransfer.files; plFileName.textContent = plFile.files[0] ? 'Selected: ' + plFile.files[0].name : ''; });

    const msg = document.getElementById('msg');
    function setMsg(text, type) { msg.textContent = text; msg.className = type; msg.style.display = 'block'; }
    function clearMsg() { msg.style.display = 'none'; }

    const STAGE_MAP = {
      'QUEUED':'ocr', 'OCR_PROCESSING':'ocr', 'MAPPING':'map', 'COMPLETED':'done', 'FAILED':'failed'
    };

    function setPipelineStage(stageKey, active) {
      const el = document.getElementById('pl-s-'+stageKey);
      if (!el) return;
      el.classList.remove('active','done','failed');
      if (active === 'active') el.classList.add('active');
      else if (active === 'done') el.classList.add('done');
      else if (active === 'failed') el.classList.add('failed');
    }

    function resetPipelineFlow() {
      ['upload','ocr','extract','map','delivery','done'].forEach(s => setPipelineStage(s, ''));
      document.getElementById('pl-progress').style.width = '0%';
      document.getElementById('pl-results').style.display = 'none';
      document.getElementById('pl-fhir-section').style.display = 'none';
      document.getElementById('pl-push-btn').style.display = 'none';
    }

    document.getElementById('pl-clear-btn').addEventListener('click', () => {
      plFile.value = ''; plFileName.textContent = ''; clearMsg(); resetPipelineFlow();
      ['pl-ocr-text','pl-ocr-raw','pl-ocr-layout','pl-fhir-table','pl-fhir-raw','pl-fhir-val'].forEach(id => {
        document.getElementById(id).textContent = '--';
      });
      drawFhirGraph([]);
    });

    document.getElementById('pl-run-btn').addEventListener('click', async () => {
      if (!plFile.files || !plFile.files[0]) { setMsg('Please select a file first.', 'error'); return; }
      clearMsg(); resetPipelineFlow();
      setPipelineStage('upload', 'done');
      setPipelineStage('ocr', 'active');
      document.getElementById('pl-run-btn').disabled = true;

      try {
        const fd = new FormData();
        fd.append('file', plFile.files[0]);
        const res = await fetch('/api/gateway/submit', { method:'POST', body:fd });
        const data = await res.json();
        if (!res.ok) { setMsg('Upload failed: ' + (data.detail||'error'), 'error'); document.getElementById('pl-run-btn').disabled = false; return; }

        const jobId = data.job_id;
        setMsg('Job: ' + jobId.substring(0,12)+'...', 'info');
        setPipelineStage('ocr', 'done');
        setPipelineStage('extract', 'active');

        // Poll
        let done = false;
        while (!done) {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const pr = await fetch('/api/gateway/result/' + jobId);
            const pd = await pr.json();
            if (!pr.ok) continue;
            const state = (pd.job?.state || '').toUpperCase();
            const progress = pd.job?.progress || 0;
            document.getElementById('pl-progress').style.width = Math.min(100, progress) + '%';

            if (state === 'OCR_PROCESSING') {
              setPipelineStage('ocr', 'done'); setPipelineStage('extract', 'active');
            } else if (state === 'MAPPING') {
              setPipelineStage('extract', 'done'); setPipelineStage('map', 'active');
            } else if (state === 'COMPLETED') {
              setPipelineStage('map', 'done'); setPipelineStage('delivery', 'done'); setPipelineStage('done', 'done');
              done = true;
            } else if (state === 'FAILED') {
              setPipelineStage('failed', 'failed');
              setMsg('Failed: ' + (pd.job?.error_message || 'unknown'), 'error');
              done = true;
            }

            // Show OCR output if available
            if (pd.ocr_output) {
              document.getElementById('pl-results').style.display = 'grid';
              document.getElementById('pl-ocr-text').textContent = pd.ocr_output.extracted_text || JSON.stringify(pd.ocr_output,null,2);
              document.getElementById('pl-ocr-raw').textContent = JSON.stringify(pd.ocr_output,null,2);
              if (pd.ocr_output.layouts) {
                document.getElementById('pl-ocr-layout').textContent = JSON.stringify(pd.ocr_output.layouts,null,2);
              }
            }

            // Show FHIR bundle if available
            if (pd.fhir_bundle) {
              document.getElementById('pl-fhir-section').style.display = 'grid';
              document.getElementById('pl-fhir-raw').textContent = JSON.stringify(pd.fhir_bundle,null,2);
              document.getElementById('pl-push-btn').style.display = 'inline-block';
              document.getElementById('pl-push-btn').dataset.jobId = jobId;

              // Build resource table
              const entries = pd.fhir_bundle.entry || [];
              let html = '<table style="width:100%;border-collapse:collapse;font-size:0.75rem;"><tr style="border-bottom:1px solid var(--line);color:var(--muted);"><th style="padding:4px;">Type</th><th style="padding:4px;">ID</th></tr>';
              entries.forEach(e => {
                const r = e.resource || {};
                html += '<tr><td style="padding:4px;">'+(r.resourceType||'?')+'</td><td style="padding:4px;font-family:monospace;">'+(r.id||'')+'</td></tr>';
              });
              html += '</table>';
              document.getElementById('pl-fhir-table').innerHTML = html;

              // Validation
              const val = pd.fhir_validation || {};
              let vhtml = '';
              (val.errors || []).forEach(e => {
                const pass = e.startsWith('Valid') || e.includes('PASS');
                vhtml += '<div style="margin:2px 0;'+(pass?'color:#3fb950':'color:var(--danger)')+'">'+(pass?'✓ ':'✗ ')+e+'</div>';
              });
              document.getElementById('pl-fhir-val').innerHTML = vhtml || '<div style="color:var(--muted);">No validation data</div>';

              // Draw FHIR graph
              drawFhirGraph(entries);
            }
          } catch(e) { console.error('Poll error:', e); }
        }
      } catch(e) { setMsg('Error: '+e.message, 'error'); }
      document.getElementById('pl-run-btn').disabled = false;
    });

    // Push to HAPI
    document.getElementById('pl-push-btn').addEventListener('click', async () => {
      const jobId = document.getElementById('pl-push-btn').dataset.jobId;
      if (!jobId) return;
      document.getElementById('pl-push-btn').disabled = true;
      try {
        const r = await fetch('/api/gateway/push/'+jobId, { method:'POST' });
        const d = await r.json();
        if (d.success) {
          setMsg('Pushed to HAPI FHIR successfully! '+(d.created_resources||[]).length+' resources.', 'success');
        } else {
          setMsg('Push failed: '+(d.error||'unknown'), 'error');
        }
      } catch(e) { setMsg('Push error: '+e.message, 'error'); }
      document.getElementById('pl-push-btn').disabled = false;
    });

    // FHIR Resource Graph (canvas)
    function drawFhirGraph(entries) {
      const canvas = document.getElementById('fhir-graph');
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.max(200, rect.width - 4);
      const h = 300;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);

      if (!entries || entries.length === 0) {
        ctx.fillStyle = '#8b949e'; ctx.font = '14px Manrope';
        ctx.textAlign = 'center'; ctx.fillText('No resources to display', w/2, h/2);
        return;
      }

      const resources = entries.map(e => e.resource || {}).filter(r => r.resourceType);
      if (resources.length === 0) return;

      const colors = {'Patient':'#58a6ff','Observation':'#3fb950','DiagnosticReport':'#d29922',
        'Condition':'#f85149','MedicationRequest':'#bc8cff','AllergyIntolerance':'#f0883e',
        'Provenance':'#8b949e','Basic':'#79c0ff'};
      const radius = 28;
      const cx = w/2, cy = h/2;
      const angleStep = (2 * Math.PI) / resources.length;

      // Draw edges first
      resources.forEach((r, i) => {
        const a1 = i * angleStep - Math.PI/2;
        const x1 = cx + Math.cos(a1) * Math.min(w/3, h/3);
        const y1 = cy + Math.sin(a1) * Math.min(w/3, h/3);
        resources.forEach((r2, j) => {
          if (i === j) return;
          if (r.subject || r.patient || r.performer) {
            const a2 = j * angleStep - Math.PI/2;
            const x2 = cx + Math.cos(a2) * Math.min(w/3, h/3);
            const y2 = cy + Math.sin(a2) * Math.min(w/3, h/3);
            ctx.beginPath(); ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
            ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
          }
        });
      });

      // Draw nodes
      resources.forEach((r, i) => {
        const angle = i * angleStep - Math.PI/2;
        const x = cx + Math.cos(angle) * Math.min(w/3, h/3);
        const y = cy + Math.sin(angle) * Math.min(w/3, h/3);

        ctx.beginPath(); ctx.arc(x, y, radius, 0, 2*Math.PI);
        ctx.fillStyle = colors[r.resourceType] || '#8b949e';
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Manrope';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = r.resourceType.substring(0, 4);
        ctx.fillText(label, x, y);

        // Label below
        ctx.fillStyle = '#c9d1d9'; ctx.font = '9px Manrope';
        ctx.fillText(r.id ? r.id.substring(0,8) : '', x, y + radius + 12);
      });
    }

    // ======================================================================
    // OCR LAB TAB
    // ======================================================================
    const perfHistory = { vram:[], tokenTps:[], pageTps:[], latency:[], events:[], maxPoints:60, runVramSamples:[] };

    function pushPoint(arr, val) { arr.push(isFinite(val) ? val : 0); if (arr.length > perfHistory.maxPoints) arr.shift(); }

    function drawPerfGraph() {
      const canvas = document.getElementById('perf-canvas');
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.max(100, Math.floor(rect.width) - 4);
      const h = 220;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);

      // Background zones
      ctx.fillStyle = '#1a2a1a'; ctx.fillRect(0, h*0.25, w, h*0.75);
      ctx.fillStyle = '#2a261a'; ctx.fillRect(0, h*0.125, w, h*0.125);
      ctx.fillStyle = '#2a1a1a'; ctx.fillRect(0, 0, w, h*0.125);

      // Grid
      ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.setLineDash([5,5]);
      for (let i=1; i<4; i++) { const y = (h/4)*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      ctx.setLineDash([]);

      ctx.fillStyle = '#8b949e'; ctx.font = '9px monospace';
      ctx.textAlign = 'left'; ctx.fillText('8GB', 4, 10); ctx.fillText('0GB', 4, h-4);
      ctx.textAlign = 'right'; ctx.fillText('40s', w-4, 10); ctx.textAlign = 'left';

      const maxToken = Math.max(1, ...perfHistory.tokenTps, 100);
      const maxPage = Math.max(0.1, ...perfHistory.pageTps, 1);

      function drawSeries(values, color, maxY, fill) {
        if (!values.length) return;
        const step = values.length > 1 ? w/(values.length-1) : w;
        if (fill) {
          ctx.beginPath(); ctx.fillStyle = color+'1a';
          ctx.moveTo(0,h); values.forEach((v,i) => { const x=i*step, y=h-Math.min(maxY,Math.max(0,v))/maxY*h; ctx.lineTo(x,y); });
          ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
        values.forEach((v,i) => { const x=i*step, y=h-Math.min(maxY,Math.max(0,v))/maxY*h; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.stroke();
      }

      drawSeries(perfHistory.vram, '#2166ac', 8, true);
      drawSeries(perfHistory.tokenTps, '#2f8f2f', maxToken, false);
      drawSeries(perfHistory.pageTps, '#cc7a00', maxPage, false);
      drawSeries(perfHistory.latency, '#8f3fb0', 40, false);
    }

    async function pollOcrStatus() {
      try {
        const r = await fetch('/api/ocr/status'); if (!r.ok) return;
        const s = await r.json();

        const vram = Number(s.vram_gb||0), vramPct = (vram/8*100).toFixed(1);
        document.getElementById('ocr-vram').textContent = vram.toFixed(2)+' GB';
        document.getElementById('ocr-vram-pct').textContent = vramPct+'% of 8 GB';
        const card = document.getElementById('ocr-card-vram');
        card.classList.toggle('warning', vram > 6.8); card.classList.toggle('danger', vram > 7.5);

        const vllm = s.vllm || {};
        const pt = Number(vllm.prompt_tps||0), gt = Number(vllm.generation_tps||0);
        document.getElementById('ocr-token-tps').textContent = (pt+gt).toFixed(1);
        document.getElementById('ocr-token-bd').textContent = gt.toFixed(1)+' gen + '+pt.toFixed(1)+' prompt';

        const pageTps = Number(s.page_throughput||0);
        document.getElementById('ocr-page-tps').textContent = pageTps.toFixed(2)+' p/s';
        document.getElementById('ocr-page-min').textContent = '\u2248 '+(pageTps*60).toFixed(1)+' pages/min';

        document.getElementById('ocr-elapsed').textContent = (s.elapsed_sec||0).toFixed(1)+'s';
        document.getElementById('ocr-state-label').textContent = (s.state||'idle');

        document.getElementById('ocr-dataload').textContent = ((s.timings||{}).data_load_time||0).toFixed(2)+'s';
        document.getElementById('ocr-layout-time').textContent = ((s.timings||{}).layout_time||0).toFixed(2)+'s';
        document.getElementById('ocr-vlm-time').textContent = ((s.timings||{}).vlm_time||0).toFixed(2)+'s';
        document.getElementById('ocr-kv').textContent = (vllm.kv_cache_pct||0).toFixed(1)+'%';

        // Queue depths
        const q = s.pipeline_queues || {};
        const qLoad = Number(q.data_loading||0), qLayout = Number(q.layout||0), qVlm = Number((q.vlm_waiting||0)+(q.vlm_running||0));
        document.getElementById('q-load').style.width = Math.min(100, qLoad/32*100)+'%';
        document.getElementById('q-layout').style.width = Math.min(100, qLayout/32*100)+'%';
        document.getElementById('q-vlm').style.width = Math.min(100, qVlm/32*100)+'%';
        document.getElementById('q-load-val').textContent = qLoad.toFixed(0);
        document.getElementById('q-layout-val').textContent = qLayout.toFixed(0);
        document.getElementById('q-vlm-val').textContent = qVlm.toFixed(0);

        // Timing breakdown
        const tLoad = Number((s.timings||{}).data_load_time||0);
        const tLayout = Number((s.timings||{}).layout_time||0);
        const tVlm = Number((s.timings||{}).vlm_time||0);
        const tTotal = tLoad+tLayout+tVlm || 1;
        document.getElementById('t-load').style.width = (tLoad/tTotal*100)+'%';
        document.getElementById('t-layout').style.width = (tLayout/tTotal*100)+'%';
        document.getElementById('t-vlm').style.width = (tVlm/tTotal*100)+'%';
        const bLabel = document.getElementById('ocr-bottleneck');
        if (tVlm/tTotal > 0.8) bLabel.textContent = 'VLM is '+(tVlm/tTotal*100).toFixed(1)+'% of time — bottleneck';
        else bLabel.textContent = '';

        // Perf history
        const active = ['uploading','preparing','running','saving'].includes((s.state||'').toLowerCase());
        if (active) { perfHistory.runVramSamples.push(vram); }
        pushPoint(perfHistory.vram, vram);
        pushPoint(perfHistory.tokenTps, pt+gt);
        pushPoint(perfHistory.pageTps, pageTps);
        pushPoint(perfHistory.latency, s.elapsed_sec||0);
        drawPerfGraph();
      } catch(_) {}
    }

    // Poll OCR status (adaptive: 2s when active, 10s when idle)
    let ocrActive = false;
    async function ocrPollLoop() {
      await pollOcrStatus();
      const s = document.getElementById('ocr-state-label').textContent;
      ocrActive = ['uploading','preparing','running','saving'].includes(s);
      setTimeout(ocrPollLoop, ocrActive ? 2000 : 10000);
    }
    ocrPollLoop();

    // Canvas hover tooltip
    const perfCanvas = document.getElementById('perf-canvas');
    const tooltip = document.getElementById('perf-tooltip');
    if (perfCanvas) {
      perfCanvas.addEventListener('mousemove', (e) => {
        const rect = perfCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pts = perfHistory.vram.length;
        if (pts < 1) { tooltip.style.display = 'none'; return; }
        const step = rect.width / (pts - 1);
        const idx = Math.round(x / step);
        if (idx >= 0 && idx < pts) {
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX+15)+'px'; tooltip.style.top = (e.clientY+15)+'px';
          tooltip.innerHTML = '<strong>Point '+(idx+1)+'</strong><br/>'+
            '<span style="color:#2166ac">VRAM: '+(perfHistory.vram[idx]||0).toFixed(2)+' GB</span><br/>'+
            '<span style="color:#2f8f2f">TP: '+(perfHistory.tokenTps[idx]||0).toFixed(1)+' t/s</span><br/>'+
            '<span style="color:#cc7a00">P/s: '+(perfHistory.pageTps[idx]||0).toFixed(2)+'</span><br/>'+
            '<span style="color:#8f3fb0">Lat: '+(perfHistory.latency[idx]||0).toFixed(1)+'s</span>';
        }
      });
      perfCanvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      window.addEventListener('resize', drawPerfGraph);
    }

    // OCR Logs polling
    async function pollOcrLogs() {
      const body = document.getElementById('ocr-logs');
      if (!body || body.classList.contains('collapsed')) return;
      try {
        const r = await fetch('/api/logs'); if (!r.ok) return;
        const d = await r.json();
        body.textContent = (d.lines||[]).join('');
        body.scrollTop = body.scrollHeight;
      } catch(_) {}
    }
    setInterval(pollOcrLogs, 5000);

    // OCR Config
    async function pollOcrConfig() {
      try {
        const r = await fetch('/api/ocr/status'); if (!r.ok) return;
        const s = await r.json();
        const cfg = s.config || {};
        const container = document.getElementById('ocr-config');
        if (!container || !Object.keys(cfg).length) return;
        container.innerHTML = '';
        for (const [key, val] of Object.entries(cfg)) {
          const item = document.createElement('div'); item.className = 'config-item';
          let note = '';
          if (key === 'gpu_memory_utilization' && val < 0.5) note = 'Conservative — try 0.55+';
          if (key === 'enforce_eager' && val === true) note = 'Disables CUDA graph';
          if (key === 'max_model_len' && val <= 2048) note = 'Safe for 8GB';
          item.innerHTML = '<span class="cfg-lbl">'+key+'</span><span class="cfg-val">'+val+'</span>'+(note?'<span class="cfg-note">'+note+'</span>':'');
          container.appendChild(item);
        }
      } catch(_) {}
    }
    setInterval(pollOcrConfig, 10000);
    setTimeout(pollOcrConfig, 500);

    // ======================================================================
    // MAPPER LAB TAB
    // ======================================================================
    // Load prompt from file
    document.getElementById('mapper-load-prompt').addEventListener('click', async () => {
      try {
        const r = await fetch('/api/mapper/prompt');
        const d = await r.json();
        document.getElementById('mapper-prompt').value = d.prompt || d;
      } catch(e) { alert('Failed to load prompt'); }
    });

    // Load sample markdown
    document.getElementById('mapper-load-sample').addEventListener('click', async () => {
      try {
        const r = await fetch('/api/mapper/sample');
        const d = await r.json();
        document.getElementById('mapper-input').value = d.markdown || d;
      } catch(e) { alert('Failed to load sample'); }
    });

    // Send to model
    document.getElementById('mapper-send').addEventListener('click', async () => {
      const prompt = document.getElementById('mapper-prompt').value;
      const input = document.getElementById('mapper-input').value;
      const ctx = parseInt(document.getElementById('mapper-ctx').value) || 6144;
      const maxtokens = parseInt(document.getElementById('mapper-maxtokens').value) || 4096;

      if (!input) { alert('Please enter or load medical markdown'); return; }
      if (!prompt) { alert('Please load or write a system prompt'); return; }

      const respEl = document.getElementById('mapper-response');
      respEl.textContent = 'Connecting...';
      document.getElementById('mapper-send').disabled = true;

      try {
        const r = await fetch('/api/mapper/stream', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ prompt, input, ctx_size: ctx, max_tokens: maxtokens })
        });
        if (!r.ok) { respEl.textContent = 'Error: ' + (await r.text()); return; }

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        const startTime = performance.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, {stream: true});
          // Parse SSE: "data: {json}\n\n"
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
              try {
                const d = JSON.parse(line.substring(6));
                if (d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content) {
                  full += d.choices[0].delta.content;
                  respEl.textContent = full;
                }
              } catch(_) {}
            }
          }
        }

        const latency = (performance.now() - startTime).toFixed(0);
        document.getElementById('mapper-latency').textContent = latency + ' ms';
        document.getElementById('mapper-tokens').textContent = (full.length / 4).toFixed(0) + ' (est)';
        document.getElementById('mapper-status').textContent = 'Done';

        // Validate JSON
        const jsonMatch = full.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            document.getElementById('map-json-box').textContent = JSON.stringify(parsed, null, 2);
            let vhtml = '';
            if (parsed.resourceType === 'Bundle') vhtml += '<div style="color:#3fb950">✓ resourceType is Bundle</div>';
            else vhtml += '<div style="color:var(--danger)">✗ Expected resourceType Bundle</div>';
            if (parsed.entry) vhtml += '<div style="color:#3fb950">✓ ' + parsed.entry.length + ' resource(s)</div>';
            else vhtml += '<div style="color:var(--danger)">✗ Missing entry array</div>';
            document.getElementById('map-val-box').innerHTML = vhtml;
          } catch(e) {
            document.getElementById('map-val-box').innerHTML = '<div style="color:var(--danger)">✗ Invalid JSON</div>';
          }
        }
      } catch(e) {
        respEl.textContent = 'Error: ' + e.message;
      }
      document.getElementById('mapper-send').disabled = false;
    });

    // ======================================================================
    // HISTORY TAB
    // ======================================================================
    async function loadHistory() {
      try {
        const r = await fetch('/api/history'); if (!r.ok) return;
        const data = await r.json();
        const runs = data.runs || [];
        const body = document.getElementById('hist-body');
        const searchTerm = (document.getElementById('hist-search').value || '').toLowerCase();
        body.innerHTML = '';

        const filtered = searchTerm ? runs.filter(r => (r.filename||'').toLowerCase().includes(searchTerm) || (r.job_id||'').toLowerCase().includes(searchTerm)) : runs;

        filtered.forEach(run => {
          const dur = run.started_at && run.finished_at ? (run.finished_at - run.started_at).toFixed(1) + 's' : '-';
          const tr = document.createElement('tr');
          tr.innerHTML = '<td style="font-family:monospace;">'+(run.id||'').substring(0,10)+'</td>'+
            '<td>'+(run.filename||'')+'</td>'+
            '<td style="font-family:monospace;">'+(run.job_id||'').substring(0,10)+'</td>'+
            '<td><span class="badge" style="background:'+(run.status==='completed'?'var(--accent)':'var(--danger)')+'">'+(run.status||'')+'</span></td>'+
            '<td>'+(run.stage||'')+'</td>'+
            '<td>'+(run.fhir_valid ? '✓' : '✗')+'</td>'+
            '<td>'+dur+'</td>'+
            '<td><button class="btn-danger" style="padding:2px 8px;font-size:0.65rem;" onclick="deleteRun(\''+run.id+'\')">Del</button></td>';
          body.appendChild(tr);
        });

        // Draw trend chart
        drawHistoryTrend(filtered.slice(0, 20));
      } catch(_) {}
    }

    function drawHistoryTrend(runs) {
      const canvas = document.getElementById('hist-chart');
      if (!canvas || !runs.length) return;
      const w = canvas.parentElement.getBoundingClientRect().width;
      const h = 200;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);

      const durations = runs.map(r => r.finished_at && r.started_at ? r.finished_at - r.started_at : 0).reverse();
      if (durations.every(d => d === 0)) return;

      const max = Math.max(...durations);
      const step = durations.length > 1 ? w/(durations.length-1) : w;

      ctx.beginPath(); ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 2;
      durations.forEach((v,i) => {
        const x = i*step, y = h - (v/max)*h*0.8 - 10;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      // Fill area
      ctx.lineTo((durations.length-1)*step, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = '#3fb9501a'; ctx.fill();

      ctx.fillStyle = '#8b949e'; ctx.font = '9px monospace';
      ctx.fillText('Duration (s)', 4, 12);
    }

    window.deleteRun = async function(runId) {
      if (!confirm('Delete this run?')) return;
      try { await fetch('/api/history/'+runId, {method:'DELETE'}); loadHistory(); }
      catch(e) { alert('Delete failed'); }
    };

    document.getElementById('hist-refresh').addEventListener('click', loadHistory);
    document.getElementById('hist-search').addEventListener('input', loadHistory);
    loadHistory();
    setInterval(loadHistory, 15000);

    // ======================================================================
    // NEON DB TAB
    // ======================================================================
    document.getElementById('neon-fetch').addEventListener('click', async () => {
      const type = document.getElementById('neon-type').value;
      const search = document.getElementById('neon-search').value;
      const url = search ? '/api/fhir/'+type+'?search='+encodeURIComponent(search) : '/api/fhir/'+type;
      try {
        const r = await fetch(url); if (!r.ok) { document.getElementById('neon-body').innerHTML = '<tr><td colspan="4" style="color:var(--danger);">Error: '+r.status+'</td></tr>'; return; }
        const data = await r.json();
        const entries = data.entry || [];
        const body = document.getElementById('neon-body');
        body.innerHTML = '';
        entries.forEach(e => {
          const res = e.resource || {};
          const summary = res.code?.text || res.name?.[0]?.text || res.text?.div || JSON.stringify(res).substring(0,60);
          const tr = document.createElement('tr');
          tr.innerHTML = '<td style="font-family:monospace;">'+(res.id||'')+'</td>'+
            '<td>'+(res.resourceType||'')+'</td>'+
            '<td style="color:var(--muted);">'+summary+'</td>'+
            '<td><button class="btn-secondary" style="padding:2px 8px;font-size:0.65rem;" onclick="viewFhir(\''+res.resourceType+'\',\''+res.id+'\')">View</button> '+
            '<button class="btn-danger" style="padding:2px 8px;font-size:0.65rem;" onclick="deleteFhir(\''+res.resourceType+'\',\''+res.id+'\')">Del</button></td>';
          body.appendChild(tr);
        });
        if (!entries.length) body.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">No resources found</td></tr>';
      } catch(e) { document.getElementById('neon-body').innerHTML = '<tr><td colspan="4" style="color:var(--danger);">Error: '+e.message+'</td></tr>'; }
    });

    // Count all types
    document.getElementById('neon-stats').addEventListener('click', async () => {
      const types = ['Patient','Observation','DiagnosticReport','Condition','MedicationRequest','AllergyIntolerance','Provenance','Basic'];
      const container = document.getElementById('neon-counts');
      container.innerHTML = '<span style="color:var(--muted);font-size:0.75rem;">Loading counts...</span>';
      const counts = [];
      for (const t of types) {
        try {
          const r = await fetch('/api/fhir/'+t+'?_summary=count');
          const d = await r.json();
          counts.push({type: t, total: d.total || 0});
        } catch(_) { counts.push({type: t, total: '?'}); }
      }
      container.innerHTML = counts.map(c =>
        '<span style="background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:0.75rem;">'+
        '<strong>'+c.type+'</strong>: '+c.total+'</span>'
      ).join('');
    });

    window.viewFhir = async function(type, id) {
      try {
        const r = await fetch('/api/fhir/'+type+'/'+id);
        const d = await r.json();
        document.getElementById('neon-detail').textContent = JSON.stringify(d, null, 2);
        document.getElementById('neon-detail-card').style.display = 'block';
      } catch(e) { alert('Failed to load resource'); }
    };

    window.deleteFhir = async function(type, id) {
      if (!confirm('Delete '+type+'/'+id+'?')) return;
      try {
        const r = await fetch('/api/fhir/'+type+'/'+id, {method:'DELETE'});
        if (r.ok) { document.getElementById('neon-fetch').click(); }
        else { alert('Delete failed'); }
      } catch(e) { alert('Delete failed'); }
    };

    document.getElementById('neon-detail-close').addEventListener('click', () => {
      document.getElementById('neon-detail-card').style.display = 'none';
    });

    // Initial neon load
    setTimeout(() => document.getElementById('neon-fetch').click(), 500);

    // ======================================================================
    // INITIALIZE
    // ======================================================================
    resetPipelineFlow();
    drawPerfGraph();
  </script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    _init_db()
    yield


app = FastAPI(title="DOC2FHIR Command Center", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=UI_V2_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def home():
    return HTMLResponse(build_home())


# ---------------------------------------------------------------------------
# API: Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def api_health():
    async def probe(url: str, paths: tuple[str, ...]) -> bool:
        async with httpx.AsyncClient(timeout=2.0) as c:
            for p in paths:
                try:
                    r = await c.get(f"{url.rstrip('/')}{p}")
                    if r.status_code < 500:
                        return True
                except Exception:
                    continue
        return False

    gw = await probe(GATEWAY_URL, ("/v1/health", "/health"))
    ocr = await probe(OCR_URL, ("/status", "/health"))
    mapper = await probe(MAPPER_URL, ("/v1/models", "/health"))
    hapi = await probe(HAPI_FHIR_URL, ("", "/Patient?_count=1"))

    gpu = 0.0
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,nounits,noheader"],
            text=True, timeout=3,
        )
        vals = [int(x.strip()) for x in out.strip().split("\n") if x.strip()]
        gpu = round(sum(vals) / 1024.0, 2) if vals else 0.0
    except Exception:
        pass

    return {"gateway": gw, "ocr": ocr, "mapper": mapper, "hapi": hapi, "gpu": gpu}


# ---------------------------------------------------------------------------
# API: Gateway proxy
# ---------------------------------------------------------------------------

@app.post("/api/gateway/submit")
async def api_gateway_submit(file: UploadFile = File(...), metadata: str = Form(default="{}")):
    async with httpx.AsyncClient(timeout=60.0) as c:
        content = await file.read()
        files = {"file": (file.filename or "doc.pdf", content, file.content_type or "application/octet-stream")}
        data = {"metadata": metadata}
        try:
            r = await c.post(f"{GATEWAY_URL}/v1/document/upload", files=files, data=data)
            body = r.json()
            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=body.get("detail", str(body)))

            run_id = str(uuid.uuid4())
            _save_run(run_id=run_id, filename=file.filename or "unknown",
                      job_id=body.get("job_id", ""), status="queued",
                      started_at=time.time())
            return {"job_id": body.get("job_id"), "filename": file.filename, "run_id": run_id}
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Gateway timed out")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Gateway unreachable")


@app.get("/api/gateway/result/{job_id}")
async def api_gateway_result(job_id: str):
    async with httpx.AsyncClient(timeout=30.0) as c:
        try:
            r = await c.get(f"{GATEWAY_URL}/v1/document/result/{job_id}")
            if r.status_code == 404:
                return {"job": None, "events": [], "ocr_output": None, "fhir_bundle": None}
            body = r.json()
            # Update history
            state = body.get("job", {}).get("state", "")
            if state in ("COMPLETED", "FAILED"):
                runs = _get_runs(1)
                for run in runs:
                    if run["job_id"] == job_id:
                        _save_run(run_id=run["id"], filename=run["filename"],
                                  job_id=job_id, status=state.lower(),
                                  stage=state.lower(),
                                  started_at=run["started_at"],
                                  finished_at=time.time(),
                                  fhir_valid=body.get("fhir_validation", {}).get("valid", False),
                                  metrics=body.get("stage_metrics", {}))
            return body
        except httpx.TimeoutException:
            return {"job": {"state": "TIMEOUT", "progress": 0}, "events": [], "ocr_output": None, "fhir_bundle": None}
        except httpx.ConnectError:
            return {"job": {"state": "UNREACHABLE", "progress": 0}, "events": [], "ocr_output": None, "fhir_bundle": None}


@app.post("/api/gateway/push/{job_id}")
async def api_gateway_push(job_id: str):
    async with httpx.AsyncClient(timeout=120.0) as c:
        try:
            r = await c.post(f"{GATEWAY_URL}/v1/document/{job_id}/push-to-hapi")
            return r.json()
        except httpx.TimeoutException:
            return {"success": False, "error": "Gateway timed out"}
        except httpx.ConnectError:
            return {"success": False, "error": "Gateway unreachable"}


# ---------------------------------------------------------------------------
# API: OCR proxy
# ---------------------------------------------------------------------------

@app.get("/api/ocr/status")
async def api_ocr_status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{OCR_URL}/status")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {
        "state": "unreachable", "detail": "OCR service not responding",
        "vram_gb": 0, "vllm": {}, "timings": {}, "pipeline_queues": {},
        "elapsed_sec": 0, "page_throughput": 0, "config": {},
    }


@app.get("/api/logs")
async def api_logs():
    path = Path(str(VLLM_LOG_PATH))
    if not path.exists():
        # Try alternate locations
        alt = ROOT.parent / "OCR" / "OCRpipelie" / "vLLM_8118_lowvram.log"
        if alt.exists():
            path = alt
        else:
            return {"lines": ["Log file not found.\n"]}
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 16384))
            lines = f.readlines()
            return {"lines": lines[-50:]}
    except Exception as e:
        return {"lines": [f"Error: {e}\n"]}


# ---------------------------------------------------------------------------
# API: Mapper proxy
# ---------------------------------------------------------------------------

@app.get("/api/mapper/prompt")
async def api_mapper_prompt():
    prompt_path = ROOT.parent / "Mapper" / "prompts" / "gemma4-fhir-medical.txt"
    if prompt_path.exists():
        return {"prompt": prompt_path.read_text(encoding="utf-8")}
    return {"prompt": "# Medical FHIR Prompt\n\nNo prompt file found."}


@app.get("/api/mapper/sample")
async def api_mapper_sample():
    sample_path = ROOT.parent / "Mapper" / "data" / "OCR" / "cfi care scanner-1.md"
    if sample_path.exists():
        return {"markdown": sample_path.read_text(encoding="utf-8")}
    return {"markdown": "# Sample Report\n\nNo OCR sample file found."}


@app.post("/api/mapper/stream")
async def api_mapper_stream(body: dict):
    prompt = body.get("prompt", "")
    input_text = body.get("input", "")
    ctx_size = int(body.get("ctx_size", 6144))
    max_tokens = int(body.get("max_tokens", 4096))

    # Estimate input tokens (rough)
    input_chars = len(prompt) + len(input_text)
    estimated_tokens = input_chars // 4
    safety_margin = 256
    available = ctx_size - estimated_tokens - safety_margin
    effective_max = max(256, min(max_tokens, available))

    payload = {
        "model": "gemma-4",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": input_text},
        ],
        "temperature": 0.7,
        "top_p": 0.95,
        "max_tokens": effective_max,
        "stream": True,
    }

    async def sse_stream():
        try:
            async with httpx.AsyncClient(timeout=300.0) as c:
                async with c.stream("POST", f"{MAPPER_URL}/v1/chat/completions",
                                    json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            yield f"{line}\n\n"
        except Exception as e:
            yield f"data: {{\"error\": \"{e}\"}}\n\n"

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# API: History
# ---------------------------------------------------------------------------

@app.get("/api/history")
async def api_history():
    return {"runs": _get_runs(50)}


@app.delete("/api/history/{run_id}", dependencies=[Depends(_require_internal_secret)])
async def api_delete_run(run_id: str):
    _delete_run(run_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# API: HAPI FHIR CRUD (Neon DB)
# ---------------------------------------------------------------------------

FHIR_SEARCH_PARAMS = {
    "Patient": "name",
    "Observation": "patient",
    "DiagnosticReport": "patient",
    "Condition": "patient",
    "MedicationRequest": "patient",
    "AllergyIntolerance": "patient",
    "Provenance": "target",
    "Basic": "_id",
}


@app.get("/api/fhir/{resource_type}")
async def api_fhir_list(resource_type: str, search: str = "", _summary: str = ""):
    url = f"{HAPI_FHIR_URL.rstrip('/')}/{resource_type}"
    params = {}
    if _summary:
        params["_summary"] = _summary
    if search:
        param_name = FHIR_SEARCH_PARAMS.get(resource_type, "_id")
        params[param_name] = search
    params["_count"] = "50"

    async with httpx.AsyncClient(timeout=15.0) as c:
        try:
            r = await c.get(url, params=params)
            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=r.text[:200])
            return r.json()
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="HAPI FHIR unreachable or timed out")


@app.get("/api/fhir/{resource_type}/{resource_id}")
async def api_fhir_get(resource_type: str, resource_id: str):
    async with httpx.AsyncClient(timeout=15.0) as c:
        try:
            r = await c.get(f"{HAPI_FHIR_URL.rstrip('/')}/{resource_type}/{resource_id}")
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Resource not found")
            return r.json()
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="HAPI FHIR unreachable or timed out")


@app.delete("/api/fhir/{resource_type}/{resource_id}", dependencies=[Depends(_require_internal_secret)])
async def api_fhir_delete(resource_type: str, resource_id: str):
    async with httpx.AsyncClient(timeout=15.0) as c:
        try:
            r = await c.delete(f"{HAPI_FHIR_URL.rstrip('/')}/{resource_type}/{resource_id}")
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Resource not found")
            return {"status": "deleted", "code": r.status_code}
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="HAPI FHIR unreachable or timed out")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("DOC2FHIR_UI_V2_PORT", "8503"))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False, log_level="info")
