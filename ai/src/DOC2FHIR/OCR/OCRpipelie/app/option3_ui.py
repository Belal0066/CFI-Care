#!/usr/bin/env python3
"""Lightweight Option 3 UI wrapper for PaddleOCRVL -> local vLLM backend."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import re
import tempfile
import threading
import time
import uuid
import subprocess
import yaml
import logging
import warnings
from pathlib import Path
from typing import Optional, AsyncGenerator
from contextlib import asynccontextmanager

import fitz
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image
from paddleocr import PaddleOCRVL

try:
    from db import init_db, save_run, get_runs, get_run, delete_run
except ImportError:
    from app.db import init_db, save_run, get_runs, get_run, delete_run


ROOT_DIR = Path(__file__).resolve().parent.parent
SERVER_URL = "http://127.0.0.1:8118/v1"

# Suppress noise from MuPDF/Paddle/vLLM logs
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["PADDLE_SDK_LOG_LEVEL"] = "3"
logging.getLogger("uvicorn.error").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=UserWarning, module="paddle")
warnings.filterwarnings("ignore", category=DeprecationWarning)
try:
    fitz.TOOLS.mupdf_display_errors(False)
except AttributeError:
    pass

VLLM_LOG_PATH = ROOT_DIR / "vLLM_8118_lowvram.log"
UPLOAD_DIR = ROOT_DIR / "uploads" / "option3_ui"
OUTPUT_DIR = ROOT_DIR / "outputs" / "option3_ui"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_MAX_NEW_TOKENS = 128
DEFAULT_MAX_CONCURRENCY = 1
DEFAULT_PDF_DPI = int(os.getenv("OPTION3_PDF_DPI", "110"))

pipeline: Optional[PaddleOCRVL] = None
APP_STARTED_AT = time.time()
WARMUP_DONE = False
WARMUP_LOCK = threading.Lock()
STATUS_LOCK = threading.Lock()
STATUS = {
    "state": "idle",
    "detail": "Idle",
    "error": "",
    "started_at": None,
    "finished_at": None,
    "updated_at": time.time(),
    "timings": {},
    "last_vllm": {},
    "run_context": {},
    "pages_total": 0,
    "pages_done": 0,
}

def _get_vram_gb() -> float:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,nounits,noheader"],
            text=True
        )
        return round(sum(int(x.strip()) for x in out.strip().split("\n")) / 1024.0, 2)
    except Exception:
        return 0.0


def _get_gpu_snapshot() -> dict:
    """Capture a lightweight GPU snapshot for correlation with slow runs."""
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,temperature.gpu,utilization.gpu,clocks.current.graphics",
                "--format=csv,nounits,noheader",
            ],
            text=True,
        )
        rows = [x.strip() for x in out.strip().split("\n") if x.strip()]
        gpus = []
        for idx, row in enumerate(rows):
            parts = [p.strip() for p in row.split(",")]
            if len(parts) < 4:
                continue
            gpus.append(
                {
                    "gpu_index": idx,
                    "memory_used_mb": int(parts[0]),
                    "temperature_c": int(parts[1]),
                    "utilization_pct": int(parts[2]),
                    "graphics_clock_mhz": int(parts[3]),
                }
            )

        return {
            "gpu_count": len(gpus),
            "total_memory_gb": round(sum(g["memory_used_mb"] for g in gpus) / 1024.0, 2),
            "gpus": gpus,
            "sampled_at": time.time(),
        }
    except Exception as e:
        return {"error": str(e), "sampled_at": time.time()}

class TimingWrapper:
    def __init__(self, func, metric_name):
        self.func = func
        self.metric_name = metric_name

    def _execute_and_time(self, res, t0):
        import types
        if isinstance(res, types.GeneratorType):
            def gen():
                try:
                    for r in res:
                        yield r
                finally:
                    with STATUS_LOCK:
                        STATUS["timings"][self.metric_name] = STATUS["timings"].get(self.metric_name, 0) + (time.time() - t0)
            return gen()
        else:
            with STATUS_LOCK:
                STATUS["timings"][self.metric_name] = STATUS["timings"].get(self.metric_name, 0) + (time.time() - t0)
            return res

    def __call__(self, *args, **kwargs):
        t0 = time.time()
        res = self.func(*args, **kwargs)
        return self._execute_and_time(res, t0)

    def __getattr__(self, item):
      return getattr(self.func, item)

    def predict(self, *args, **kwargs):
      t0 = time.time()
      res = self.func.predict(*args, **kwargs)
      return self._execute_and_time(res, t0)

def _read_backend_config() -> dict:
    config_path = ROOT_DIR / "vllm_backend_low_vram.yaml"
    if not config_path.exists():
        return {"fallback": True, "note": "vllm_backend_low_vram.yaml not found"}
    try:
        with open(config_path, "r") as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        return {"error": str(e)}


def _get_backend_config_hash() -> str:
    config_path = ROOT_DIR / "vllm_backend_low_vram.yaml"
    if not config_path.exists():
        return "missing"
    try:
        payload = config_path.read_bytes()
        return hashlib.sha256(payload).hexdigest()[:12]
    except Exception:
        return "unavailable"

def _set_status(state: str, detail: str, error: str = "") -> None:
    with STATUS_LOCK:
        STATUS["state"] = state
        STATUS["detail"] = detail
        STATUS["error"] = error
        if state in {"uploading", "preparing", "running", "saving"}:
            STATUS["finished_at"] = None
        if state in {"running", "uploading", "preparing", "saving"} and STATUS["started_at"] is None:
            STATUS["started_at"] = time.time()
        if state in {"completed", "error"} and STATUS["started_at"] is not None:
            STATUS["finished_at"] = time.time()
        if state == "idle":
            STATUS["started_at"] = None
            STATUS["finished_at"] = None
            STATUS["run_context"] = {}
        STATUS["updated_at"] = time.time()


def _status_snapshot() -> dict:
    with STATUS_LOCK:
        snap = dict(STATUS)

    started_at = snap.get("started_at")
    finished_at = snap.get("finished_at")
    if started_at and finished_at:
        snap["elapsed_sec"] = round(float(finished_at) - float(started_at), 1)
    elif started_at:
        snap["elapsed_sec"] = round(time.time() - float(started_at), 1)
    else:
        snap["elapsed_sec"] = 0.0

    state = str(snap.get("state", "idle")).lower()
    active_state = state in {"uploading", "preparing", "running", "saving"}
    live_vllm = _read_vllm_metrics(prefer_nonzero=active_state)
    if live_vllm:
        with STATUS_LOCK:
            STATUS["last_vllm"] = live_vllm
        snap["vllm"] = live_vllm
    else:
      snap["vllm"] = snap.get("last_vllm", {})

    elapsed = float(snap.get("elapsed_sec", 0.0) or 0.0)
    pages_done = int(snap.get("pages_done", 0) or 0)
    snap["page_throughput"] = round((pages_done / elapsed), 3) if elapsed > 0 else 0.0

    timings = snap.get("timings") or {}
    vllm = snap.get("vllm") or {}
    snap["pipeline_queues"] = {
      # These are lightweight queue approximations to surface bottlenecks while running.
      "data_loading": 1 if state in {"uploading", "preparing"} else 0,
      "layout": 1 if state == "running" and float(timings.get("layout_time", 0) or 0) <= 0 else 0,
      "vlm_waiting": int(vllm.get("waiting_reqs", 0) or 0),
      "vlm_running": int(vllm.get("running_reqs", 0) or 0),
    }

    snap["vram_gb"] = _get_vram_gb()
    snap["config"] = _read_backend_config()
    snap["config_hash"] = _get_backend_config_hash()
    snap["server_uptime_sec"] = round(max(0.0, time.time() - APP_STARTED_AT), 1)
    snap["warmup_done"] = bool(WARMUP_DONE)
    return snap


def _read_vllm_metrics(prefer_nonzero: bool = True) -> dict:
    """Extract throughput/queue metrics from vLLM log lines.

    When prefer_nonzero is True, select the newest active/non-zero sample.
    When False, always select the newest sample (including all-zero idle lines).
    """
    if not VLLM_LOG_PATH.exists():
        return {}

    try:
        with open(VLLM_LOG_PATH, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 131072))
            tail = f.read().decode("utf-8", errors="ignore")
    except Exception:
        return {}

    patt = re.compile(
        r"Avg prompt throughput: ([0-9.]+) tokens/s, Avg generation throughput: ([0-9.]+) tokens/s, "
        r"Running: (\d+) reqs, Waiting: (\d+) reqs, GPU KV cache usage: ([0-9.]+)%"
    )
    matches = patt.findall(tail)
    if not matches:
        return {}

    if prefer_nonzero:
        # While pipeline is active, favor the most recent non-zero sample so
        # quick logging jitter does not flicker the dashboard to zero.
        chosen = None
        for prompt_tps, gen_tps, running, waiting, kv in reversed(matches):
            if float(prompt_tps) > 0 or float(gen_tps) > 0 or int(running) > 0 or int(waiting) > 0:
                chosen = (prompt_tps, gen_tps, running, waiting, kv)
                break
        if chosen is None:
            chosen = matches[-1]
    else:
        chosen = matches[-1]

    prompt_tps, gen_tps, running, waiting, kv = chosen
    return {
        "prompt_tps": float(prompt_tps),
        "generation_tps": float(gen_tps),
        "running_reqs": int(running),
        "waiting_reqs": int(waiting),
        "kv_cache_pct": float(kv),
    }


def get_pipeline() -> PaddleOCRVL:
    global pipeline
    if pipeline is None:
        pipeline = PaddleOCRVL(
            vl_rec_backend="vllm-server",
            vl_rec_server_url=SERVER_URL,
            vl_rec_max_concurrency=DEFAULT_MAX_CONCURRENCY,
        )
        # Wrap known pipeline stages when available. Different PaddleOCR versions
        # expose slightly different attribute names.
        target_objs = [pipeline]
        if hasattr(pipeline, "paddlex_pipeline"):
            target_objs.append(pipeline.paddlex_pipeline)
            if hasattr(pipeline.paddlex_pipeline, "_pipeline"):
                target_objs.append(pipeline.paddlex_pipeline._pipeline)

        layout_attrs = ["doclayout_det", "layout_det_model", "layout_model"]
        vlm_attrs = ["vl_rec_model", "vl_rec", "vlm_model"]
        dataload_attrs = ["img_reader", "data_loader", "image_reader"]

        for obj in target_objs:
            for attr in dataload_attrs:
                if hasattr(obj, attr):
                    setattr(obj, attr, TimingWrapper(getattr(obj, attr), "data_load_time"))
                    break

            for attr in layout_attrs:
                if hasattr(obj, attr):
                    setattr(obj, attr, TimingWrapper(getattr(obj, attr), "layout_time"))
                    break

            for attr in vlm_attrs:
                if hasattr(obj, attr):
                    setattr(obj, attr, TimingWrapper(getattr(obj, attr), "vlm_time"))
                    break
        
        # Optionally mock reading
        
    return pipeline


def _is_image_file(path: Path) -> bool:
    return path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def _to_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _inline_markdown_images(md_text: str, base_dir: Path) -> str:
    def resolve_to_data_url(ref: str) -> str:
        ref = ref.strip().strip('"').strip("'")
        if not ref or ref.startswith(("http://", "https://", "data:")):
            return ref
        target = (base_dir / ref).resolve()
        try:
            if target.is_file():
                return _to_data_url(target)
        except Exception:
            pass
        return ref

    md_text = re.sub(
        r'src=("|\')(.*?)(\1)',
        lambda m: f"src=\"{resolve_to_data_url(m.group(2))}\"",
        md_text,
        flags=re.IGNORECASE,
    )

    md_text = re.sub(
        r'(!\[[^\]]*\]\()([^\)]+)(\))',
        lambda m: f"{m.group(1)}{resolve_to_data_url(m.group(2))}{m.group(3)}",
        md_text,
    )

    return md_text


def _pick_best_annotated_image(page_dir: Path) -> str:
    candidates = [
        p for p in page_dir.rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    ]
    if not candidates:
        return ""

    priority_terms = ["layout_det_res", "layout", "visual", "result", "input_0"]

    def score(path: Path) -> tuple[int, int]:
        name = str(path).lower()
        term_score = sum(1 for t in priority_terms if t in name)
        size = path.stat().st_size if path.exists() else 0
        return term_score, size

    best = sorted(candidates, key=score, reverse=True)[0]
    return _to_data_url(best)


def _render_pdf_pages_to_images(pdf_path: Path, dpi: int, out_dir: Path) -> list[Path]:
    page_paths: list[Path] = []
    doc = fitz.open(str(pdf_path))
    try:
        for i, page in enumerate(doc, start=1):
            mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            out_path = out_dir / f"{pdf_path.stem}_p{i:03d}_{uuid.uuid4().hex[:8]}.png"
            pix.save(str(out_path))
            page_paths.append(out_path)
    finally:
        doc.close()
    return page_paths


def _run_warmup_once() -> None:
    global WARMUP_DONE
    with WARMUP_LOCK:
        if WARMUP_DONE:
            return

        warmup_path = UPLOAD_DIR / f"warmup_{uuid.uuid4().hex[:8]}.png"
        try:
            # Small synthetic image triggers model graph/tokenizer path warmup.
            Image.new("RGB", (64, 64), color=(255, 255, 255)).save(warmup_path, format="PNG")
            pipe = get_pipeline()
            _ = list(pipe.predict(str(warmup_path), max_new_tokens=8))
            WARMUP_DONE = True
            print("INFO: vLLM warmup completed.")
        except Exception as e:
            print(f"WARN: vLLM warmup skipped due to error: {e}")
        finally:
            warmup_path.unlink(missing_ok=True)


def build_home() -> str:
    return """
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Doc OCR</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
      --vram-color: #2166ac;
      --token-color: #2f8f2f;
      --page-color: #cc7a00;
      --latency-color: #8f3fb0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Manrope", "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .page { max-width: 1280px; margin: 22px auto; padding: 0 12px 20px; }
    .hero { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .hero h2 { margin: 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; color: #fff; }
    .hero p { margin: 4px 0 0; color: var(--muted); font-size: 0.92rem; }

    form {
      border: 1px solid var(--line);
      padding: 14px;
      border-radius: 12px;
      background: var(--card);
      box-shadow: var(--shadow);
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: end;
      margin-top: 12px;
    }

    .field label { display: block; margin-bottom: 5px; font-weight: 700; color: var(--muted); font-size: 0.85rem; }
    .dropzone {
      border: 2px dashed #30363d;
      border-radius: 10px;
      background: #0d1117;
      min-height: 76px;
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
    .dropzone-sub { color: var(--muted); font-size: 0.84rem; margin-top: 2px; }
    .file-name { font-size: 0.84rem; color: #79c0ff; margin-top: 6px; font-weight: 600; }
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

    .status {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--card);
      box-shadow: var(--shadow);
      padding: 15px;
    }
    .status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .status-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .badge { font-size: 0.8rem; font-weight: 800; color: #fff; background: #238636; border: 1px solid rgba(240,246,252,0.1); border-radius: 999px; padding: 5px 12px; text-transform: uppercase; }
    .status-detail { color: var(--muted); font-weight: 600; font-size: 0.9rem; }
    .status-bar { margin: 12px 0; height: 8px; border-radius: 999px; background: #30363d; overflow: hidden; }
    .status-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.35s ease; }
    
    .section-title { font-size: 0.75rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: block; border-bottom: 1px solid var(--line); padding-bottom: 4px; }

    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .metric-card { background: #0d1117; border: 1px solid var(--line); border-radius: 8px; padding: 12px; text-align: left; position: relative; overflow: hidden; }
    .metric-card .m-val { font-size: 1.4rem; font-weight: 800; color: #fff; line-height: 1.2; }
    .metric-card .m-sub { font-size: 0.75rem; color: var(--muted); margin-top: 2px; display: block; }
    .metric-card .m-lbl { font-size: 0.7rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; display: block; }
    .metric-card.warning { border-color: #d29922; }
    .metric-card.warning .m-val { color: #d29922; }
    .metric-card.danger { border-color: #f85149; }
    .metric-card.danger .m-val { color: #f85149; }

    .graph-panel {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--card);
      box-shadow: var(--shadow);
      padding: 15px;
    }
    .graph-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .graph-title { font-size: 0.85rem; font-weight: 800; color: #fff; }
    .graph-legend { display: flex; gap: 15px; flex-wrap: wrap; font-size: 0.75rem; color: var(--muted); }
    .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
    #perf-canvas { width: 100%; height: 240px; border: 1px solid var(--line); border-radius: 8px; background: #0d1117; margin-bottom: 5px; cursor: crosshair; }
    #perf-tooltip {
      position: fixed;
      background: rgba(13, 17, 23, 0.95);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 8px;
      font-size: 0.7rem;
      pointer-events: none;
      display: none;
      z-index: 100;
      box-shadow: var(--shadow);
      color: #fff;
    }
    
    .bottleneck-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .queue-section, .timing-section { display: flex; flex-direction: column; gap: 8px; }
    .b-row { display: grid; grid-template-columns: 120px 1fr 60px; align-items: center; gap: 10px; }
    .b-label { font-size: 0.72rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
    .b-bar { height: 8px; background: #30363d; border-radius: 999px; overflow: hidden; }
    .b-fill { height: 100%; width: 0%; transition: width 0.35s ease; }
    #q-load { background: #58a6ff; }
    #q-layout { background: #bc8cff; }
    #q-vlm { background: #d29922; }
    .b-val { font-size: 0.72rem; color: var(--ink); font-weight: 800; text-align: right; font-family: monospace; }
    
    .timing-bar-container { display: flex; height: 24px; background: #30363d; border-radius: 4px; overflow: hidden; margin-top: 4px; }
    .t-fill { height: 100%; transition: width 0.3s; position: relative; }
    .t-fill:hover::after { content: attr(data-label); position: absolute; top: -25px; left: 50%; transform: translateX(-50%); background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; z-index: 10; }

    .logs-panel { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; background: #0d1117; box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
    .logs-header { padding: 10px 14px; background: #161b22; color: #fff; font-size: 0.8rem; font-weight: 700; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); }
    .toggle-logs { background: #21262d; border: 1px solid var(--line); color: var(--ink); padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: bold; }
    .toggle-logs:hover { background: #30363d; }
    .logs-body { padding: 12px; max-height: 200px; overflow-y: auto; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.75rem; color: #7ee787; margin: 0; white-space: pre-wrap; line-height: 1.4; }
    .logs-body.collapsed { max-height: 0; padding-top: 0; padding-bottom: 0; }
    
    .config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 12px; }
    .config-item { background: #161b22; border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
    .cfg-lbl { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; font-weight: 700; display: block; }
    .cfg-val { font-size: 0.85rem; color: #fff; font-family: monospace; display: block; margin-top: 2px; }
    .cfg-note { font-size: 0.65rem; color: #d29922; margin-top: 4px; display: block; font-style: italic; }

    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--card); box-shadow: var(--shadow); }
    .panel-title { font-weight: 800; margin-bottom: 12px; color: #fff; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em; }
    .image-wrap { min-height: 560px; display: flex; align-items: center; justify-content: center; background: #0d1117; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .image-wrap img { max-width: 100%; max-height: 560px; object-fit: contain; }
    .tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    .tab-btn {
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.8rem;
    }
    .tab-btn:hover { background: #21262d; color: #fff; }
    .tab-btn.active { background: #21262d; color: #fff; border-color: var(--line); }
    .tab-pane { display: none; border: 1px solid var(--line); border-radius: 8px; min-height: 520px; padding: 15px; overflow: auto; background: #0d1117; }
    .tab-pane.active { display: block; }
    textarea { width: 100%; min-height: 500px; font-family: monospace; border: none; background: transparent; color: #7ee787; font-size: 0.8rem; resize: none; }
    
    #rendered-md { color: #c9d1d9; line-height: 1.6; }
    #rendered-md h1, #rendered-md h2, #rendered-md h3 { color: #fff; margin-top: 24px; margin-bottom: 16px; font-weight: 600; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    #rendered-md table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    #rendered-md th, #rendered-md td { border: 1px solid var(--line); padding: 8px 12px; }
    #rendered-md th { background: #161b22; }
    #rendered-md code { background: #21262d; padding: 2px 4px; border-radius: 4px; font-family: monospace; }

    .y-axis-label { font-size: 10px; fill: var(--muted); font-family: monospace; }

    @media (max-width: 1000px) {
      .layout { grid-template-columns: 1fr; }
      form { grid-template-columns: 1fr; }
      .bottleneck-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div>
        <h2>Doc OCR</h2>
        <h4>Powered by BWS ヽ(• •)ノ</h4>
        <p>PP-DocLayoutV2 + PaddleOCR-VL</p>
        
      </div>
      <div id="runtime-clock" style="font-family: monospace; font-size: 0.8rem; color: var(--muted);"></div>
    </div>

    <form id="parse-form" action="#" method="post" enctype="multipart/form-data">
      <div class="field">
        <label>DOCUMENT SOURCE</label>
        <div id="dropzone" class="dropzone" role="button" tabindex="0" aria-label="Upload file">
          <div class="dropzone-title">Drop PDF or Image</div>
          <div class="dropzone-sub">Click to browse filesystem</div>
          <div id="file-name" class="file-name"></div>
        </div>
        <input id="file-input" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff" required />
      </div>
      <button id="clear-btn" type="button">RESET</button> <br>
      <button id="run-btn" type="submit">START</button> 
    </form>

    <div class="status">
      <div class="status-header">
        <span class="section-title" style="margin-bottom:0; border:0;">Live Engine Status</span>
        <div class="status-row">
          <span id="status-state" class="badge">idle</span>
          <span id="status-detail" class="status-detail">Idle</span>
        </div>
      </div>
      
      <div class="status-bar"><div id="status-fill" class="status-fill"></div></div>
      
      <span class="section-title">Performance Metrics</span>
      <div class="metrics-grid">
        <div class="metric-card" id="card-vram">
            <div class="m-val" id="m-vram">0.00 GB</div>
            <span class="m-sub" id="m-vram-pct">0% of 8 GB</span>
            <div class="m-lbl">VRAM USED</div>
        </div>
        <div class="metric-card">
            <div class="m-val" id="m-vram-avg">0.00 GB</div>
            <span class="m-sub" id="m-vram-peak">+0.00 GB peak</span>
            <div class="m-lbl">AVG VRAM RUN</div>
        </div>
        <div class="metric-card" id="card-page-tps">
            <div class="m-val" id="m-page-tps">0.00 p/s</div>
            <span class="m-sub" id="m-page-min">≈ 0.0 pages/min</span>
            <div class="m-lbl">THROUGHPUT</div>
        </div>
        <div class="metric-card">
            <div class="m-val" id="m-token-tps">0.0</div>
            <span class="m-sub" id="m-token-breakdown">0.0 gen + 0.0 prompt</span>
            <div class="m-lbl">TOKEN TPS (TOTAL)</div>
        </div>
      </div>
      
      <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-top: 12px;">
        <div class="metric-card"><div class="m-val" id="m-dataload">0.00s</div><div class="m-lbl">DATA LOAD</div></div>
        <div class="metric-card"><div class="m-val" id="m-layout">0.00s</div><div class="m-lbl">LAYOUT</div></div>
        <div class="metric-card"><div class="m-val" id="m-vlm">0.00s</div><div class="m-lbl">VLM REC</div></div>
        <div class="metric-card"><div class="m-val" id="m-elapsed">0.0s</div><div class="m-lbl">TOTAL ELAPSED</div></div>
      </div>
    </div>

    <div class="graph-panel">
      <div class="graph-header">
        <div class="graph-title">Live Performance Trace</div>
        <div class="graph-legend">
          <span><span class="legend-dot" style="background:#2166ac"></span>VRAM (GB)</span>
          <span><span class="legend-dot" style="background:#2f8f2f"></span>Token TPS</span>
          <span><span class="legend-dot" style="background:#cc7a00"></span>Pages/s</span>
          <span><span class="legend-dot" style="background:#8f3fb0"></span>VLM Latency (s)</span>
        </div>
      </div>
      <div style="position: relative;">
        <canvas id="perf-canvas"></canvas>
        <div id="perf-tooltip"></div>
      </div>
      
      <div class="bottleneck-grid">
        <div class="queue-section">
          <span class="section-title">Queue Depths</span>
          <div class="b-row">
            <div class="b-label">Data Loading</div>
            <div class="b-bar"><div id="q-load" class="b-fill"></div></div>
            <div class="b-val"><span id="q-load-val">0</span>/32 max</div>
          </div>
          <div class="b-row">
            <div class="b-label">Layout Detection</div>
            <div class="b-bar"><div id="q-layout" class="b-fill"></div></div>
            <div class="b-val"><span id="q-layout-val">0</span>/32 max</div>
          </div>
          <div class="b-row">
            <div class="b-label">VLM Inference</div>
            <div class="b-bar"><div id="q-vlm" class="b-fill"></div></div>
            <div class="b-val"><span id="q-vlm-val">0</span>/32 max</div>
          </div>
        </div>
        <div class="timing-section">
          <span class="section-title">Timing Breakdown</span>
          <div class="timing-bar-container" id="timing-strip">
            <div id="t-load" class="t-fill" style="background:#58a6ff;" data-label="Load"></div>
            <div id="t-layout" class="t-fill" style="background:#bc8cff;" data-label="Layout"></div>
            <div id="t-vlm" class="t-fill" style="background:#d29922;" data-label="VLM"></div>
          </div>
          <div id="t-bottleneck-label" style="font-size: 0.75rem; color: #f85149; font-weight: 700; margin-top: 4px; text-align: center;"></div>
        </div>
      </div>
    </div>

    <div class="logs-panel" id="config-panel">
      <div class="logs-header"><span>Backend Config</span></div>
      <div class="config-grid" id="config-items"></div>
    </div>

    <div class="logs-panel" id="logs-panel">
      <div class="logs-header">
        <span>System Log Trace</span>
        <button class="toggle-logs" id="toggle-logs-btn">Show Logs</button>
      </div>
      <pre class="logs-body collapsed" id="live-logs"></pre>
    </div>

    <div id="msg" style="margin-top:12px; font-size: 0.85rem; font-weight: 600;"></div>

    <div class="layout">
      <div class="card">
        <div class="panel-title">Original Buffer</div>
        <div class="image-wrap">
          <img id="original-img" alt="Original" style="display:none;" />
          <object id="original-pdf" type="application/pdf" style="display:none; width:100%; height:560px;" data=""></object>
          <div id="original-empty" style="color:var(--muted); font-size: 0.8rem;">Ready for input...</div>
        </div>
      </div>

      <div class="card">
        <div class="tabs">
          <button class="tab-btn active" type="button" data-tab="rendered">STRUCTURED</button>
          <button class="tab-btn" type="button" data-tab="raw-md">MARKDOWN</button>
          <button class="tab-btn" type="button" data-tab="json">ARTIFACTS</button>
          <button class="tab-btn" type="button" data-tab="viz">VISUALIZE</button>
        </div>

        <div id="tab-rendered" class="tab-pane active"><div id="rendered-md"></div></div>
        <div id="tab-raw-md" class="tab-pane"><textarea id="raw-md" readonly></textarea></div>
        <div id="tab-json" class="tab-pane"><textarea id="raw-json" readonly></textarea></div>
        <div id="tab-viz" class="tab-pane">
          <div class="image-wrap" id="tab-viz-wrap" style="flex-direction: column; overflow-y: auto; gap: 10px; padding: 10px 0;">
            <div id="annotated-empty" style="color:var(--muted); font-size: 0.8rem;">Awaiting layout segments...</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card history-panel" style="margin-top:12px;">
      <div class="panel-title">Run History & Database Downloads</div>
      <div id="history-container" style="max-height: 300px; overflow-y: auto;">
        <table style="width:100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--line); color: var(--muted); text-transform: uppercase;">
              <th style="padding: 8px;">Run ID</th>
              <th style="padding: 8px;">File</th>
              <th style="padding: 8px;">Pages</th>
              <th style="padding: 8px;">Duration</th>
              <th style="padding: 8px;">Status</th>
              <th style="padding: 8px;">Action</th>
            </tr>
          </thead>
          <tbody id="history-body">
            <!-- Loaded via JS -->
          </tbody>
        </table>
      </div>
    </div>
  </div>" ,oldString:

  <script>
    const form = document.getElementById('parse-form');
    const runBtn = document.getElementById('run-btn');
    const clearBtn = document.getElementById('clear-btn');
    const msgBox = document.getElementById('msg');

    const stateEl = document.getElementById('status-state');
    const detailEl = document.getElementById('status-detail');
    const fillEl = document.getElementById('status-fill');
    const mPromptTps = document.getElementById('m-prompt-tps');
    const mGenTps = document.getElementById('m-gen-tps');
    const mTokenTps = document.getElementById('m-token-tps');
    const mPageTps = document.getElementById('m-page-tps');
    const mVram = document.getElementById('m-vram');
    const mVramAvg = document.getElementById('m-vram-avg');
    const mDataload = document.getElementById('m-dataload');
    const mLayout = document.getElementById('m-layout');
    const mVlm = document.getElementById('m-vlm');
    const mElapsed = document.getElementById('m-elapsed');
    const configLogs = document.getElementById('config-logs');
    const perfCanvas = document.getElementById('perf-canvas');
    const perfTooltip = document.getElementById('perf-tooltip');
    const qLoad = document.getElementById('q-load');
    const qLayout = document.getElementById('q-layout');
    const qVlm = document.getElementById('q-vlm');
    const qLoadVal = document.getElementById('q-load-val');
    const qLayoutVal = document.getElementById('q-layout-val');
    const qVlmVal = document.getElementById('q-vlm-val');

    const perfHistory = {
      vram: [],
      tokenTps: [],
      pageTps: [],
      latency: [],
      events: [],
      maxPoints: 80,
      runVramSamples: [],
    };

    function resetRunHistory() {
      perfHistory.vram = [];
      perfHistory.tokenTps = [];
      perfHistory.pageTps = [];
      perfHistory.latency = [];
      perfHistory.events = [];
      perfHistory.runVramSamples = [];
      drawPerfGraph();
    }

    function pushPoint(series, value) {
      series.push(Number.isFinite(value) ? value : 0);
      if (series.length > perfHistory.maxPoints) series.shift();
    }

    function pushEvent(label) {
      if (perfHistory.events.length > 0 && perfHistory.events[perfHistory.events.length-1].label === label) return;
      perfHistory.events.push({
        index: perfHistory.vram.length,
        label: label
      });
      if (perfHistory.events.length > 10) perfHistory.events.shift();
    }

    function avg(values) {
      if (!values.length) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    function drawSeries(ctx, width, height, values, maxY, color, fill = false) {
      if (!values.length) return;
      const step = values.length > 1 ? width / (values.length - 1) : width;
      
      if (fill) {
        ctx.beginPath();
        ctx.fillStyle = color + '1a'; // 10% opacity
        ctx.moveTo(0, height);
        values.forEach((v, i) => {
          const x = i * step;
          const y = height - (Math.min(maxY, Math.max(0, v)) / maxY) * height;
          ctx.lineTo(x, y);
        });
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
      }

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      values.forEach((v, i) => {
        const x = i * step;
        const y = height - (Math.min(maxY, Math.max(0, v)) / maxY) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    function drawEventLines(ctx, width, height, pointsCount) {
      if (!perfHistory.events.length || pointsCount < 2) return;
      const step = width / (pointsCount - 1);
      
      ctx.setLineDash([2, 2]);
      ctx.font = 'bold 9px Manrope';
      
      perfHistory.events.forEach(ev => {
        const x = ev.index * step;
        if (x < 0 || x > width) return;
        
        ctx.strokeStyle = '#ffa600';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        ctx.fillStyle = '#ffa600';
        ctx.save();
        ctx.translate(x + 12, 10);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(ev.label.toUpperCase(), 0, 0);
        ctx.restore();
      });
      ctx.setLineDash([]);
    }

    function drawPerfGraph() {
      if (!perfCanvas) return;
      const rect = perfCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(10, Math.floor(rect.width));
      const height = Math.max(10, Math.floor(rect.height));
      perfCanvas.width = Math.floor(width * dpr);
      perfCanvas.height = Math.floor(height * dpr);

      const ctx = perfCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Background Zones for VRAM (Left Axis 0-8GB)
      // Green zone
      ctx.fillStyle = '#1a2a1a';
      ctx.fillRect(0, height * 0.25, width, height * 0.75); 
      // Yellow zone (6-7GB)
      ctx.fillStyle = '#2a261a';
      ctx.fillRect(0, height * 0.125, width, height * 0.125);
      // Red zone (7-8GB)
      ctx.fillStyle = '#2a1a1a';
      ctx.fillRect(0, 0, width, height * 0.125);

      // Grid & Axes
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Dual Y-Axis markers (Left: VRAM 0-8GB, Right: Latency 0-40s)
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.fillText('8GB', 5, 12);
      ctx.fillText('6GB', 5, height * 0.25 + 10);
      ctx.fillText('0GB', 5, height - 5);
      ctx.textAlign = 'right';
      ctx.fillText('40s', width - 5, 12);
      ctx.fillText('0s', width - 5, height - 5);
      ctx.textAlign = 'left';

      // 8GB Ceiling Line
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(width, 1); ctx.stroke();

      const maxToken = Math.max(1, ...perfHistory.tokenTps, 100);
      const maxPage = Math.max(0.1, ...perfHistory.pageTps, 1);

      drawSeries(ctx, width, height, perfHistory.vram, 8, '#2166ac', true);
      drawSeries(ctx, width, height, perfHistory.tokenTps, maxToken, '#2f8f2f');
      drawSeries(ctx, width, height, perfHistory.pageTps, maxPage, '#cc7a00');
      drawSeries(ctx, width, height, perfHistory.latency, 40, '#8f3fb0');
      
      drawEventLines(ctx, width, height, perfHistory.vram.length);
    }

    window.addEventListener('resize', drawPerfGraph);

    perfCanvas.addEventListener('mousemove', (e) => {
      const rect = perfCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const points = perfHistory.vram.length;
      if (points < 1) {
        perfTooltip.style.display = 'none';
        return;
      }

      const step = rect.width / (points - 1);
      const idx = Math.round(x / step);
      if (idx >= 0 && idx < points) {
        perfTooltip.style.display = 'block';
        perfTooltip.style.left = (e.clientX + 15) + 'px';
        perfTooltip.style.top = (e.clientY + 15) + 'px';
        
        const vram = perfHistory.vram[idx];
        const tokens = perfHistory.tokenTps[idx];
        const pages = perfHistory.pageTps[idx];
        const latency = perfHistory.latency[idx];
        
        let html = `<strong>Point ${idx + 1}</strong><br/>`;
        html += `<span style="color:#2166ac">VRAM: ${vram.toFixed(2)} GB</span><br/>`;
        html += `<span style="color:#2f8f2f">TP: ${tokens.toFixed(1)} t/s</span><br/>`;
        html += `<span style="color:#cc7a00">P/s: ${pages.toFixed(2)}</span><br/>`;
        html += `<span style="color:#8f3fb0">Lat: ${latency.toFixed(1)}s</span>`;
        
        const ev = perfHistory.events.find(e => e.index === idx);
        if (ev) {
          html += `<br/><span style="color:#ffa600">Event: ${ev.label}</span>`;
        }
        
        perfTooltip.innerHTML = html;
      }
    });

    perfCanvas.addEventListener('mouseleave', () => {
      perfTooltip.style.display = 'none';
    });

    const liveLogs = document.getElementById('live-logs');
    const toggleLogsBtn = document.getElementById('toggle-logs-btn');

    let currentState = 'idle';
    let statusPollTimer = null;
    let logsPollTimer = null;

    function isActiveState(state) {
      return ['uploading', 'preparing', 'running', 'saving'].includes((state || '').toLowerCase());
    }

    function nextStatusPollMs() {
      return isActiveState(currentState) ? 2000 : 12000;
    }

    function nextLogsPollMs() {
      return isActiveState(currentState) ? 5000 : 20000;
    }

    function scheduleStatusPoll() {
      if (statusPollTimer) clearTimeout(statusPollTimer);
      statusPollTimer = setTimeout(async () => {
        await pollStatus();
        scheduleStatusPoll();
      }, nextStatusPollMs());
    }

    function scheduleLogsPoll() {
      if (logsPollTimer) clearTimeout(logsPollTimer);
      logsPollTimer = setTimeout(async () => {
        await pollLogs();
        scheduleLogsPoll();
      }, nextLogsPollMs());
    }

    toggleLogsBtn.addEventListener('click', () => {
      liveLogs.classList.toggle('collapsed');
      toggleLogsBtn.textContent = liveLogs.classList.contains('collapsed') ? 'Expand' : 'Collapse';
    });

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileName = document.getElementById('file-name');

    const originalImg = document.getElementById('original-img');
    const originalPdf = document.getElementById('original-pdf');
    const originalEmpty = document.getElementById('original-empty');
    
    const tabVizWrap = document.getElementById('tab-viz-wrap');
    const annotatedEmpty = document.getElementById('annotated-empty');

    const rendered = document.getElementById('rendered-md');
    const rawMd = document.getElementById('raw-md');
    const rawJson = document.getElementById('raw-json');

    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const panes = {
      rendered: document.getElementById('tab-rendered'),
      'raw-md': document.getElementById('tab-raw-md'),
      json: document.getElementById('tab-json'),
      viz: document.getElementById('tab-viz')
    };

    function activateTab(tabKey) {
      tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabKey));
      Object.entries(panes).forEach(([key, pane]) => pane.classList.toggle('active', key === tabKey));
    }
    tabs.forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

    function progressForState(state) {
      const map = {
        idle: 0,
        uploading: 15,
        preparing: 35,
        running: 70,
        saving: 88,
        completed: 100,
        error: 100,
      };
      return map[state] ?? 0;
    }

    function updateStatusView(s) {
      const state = (s.state || 'idle').toLowerCase();
      currentState = state;
      stateEl.textContent = state;
      const total = Number(s.pages_total || 0);
      const done = Number(s.pages_done || 0);
      if (total > 0 && isActiveState(state)) {
        detailEl.textContent = `${s.detail || ''} (${done}/${total})`;
      } else {
        detailEl.textContent = s.detail || '';
      }
      fillEl.style.width = progressForState(state) + '%';

      const m = s.vllm || {};
      const promptTps = Number(m.prompt_tps ?? 0);
      const genTps = Number(m.generation_tps ?? 0);
      const totalTokenTps = promptTps + genTps;
      const vram = Number(s.vram_gb ?? 0);
      const pageTps = Number(s.page_throughput ?? 0);
      const elapsed = Number(s.elapsed_sec ?? 0);

      const vramPct = (vram / 8 * 100).toFixed(1);
      const mPageTpsVal = document.getElementById('m-page-tps');
      const mPageMin = document.getElementById('m-page-min');
      const mVramVal = document.getElementById('m-vram');
      const mVramPct = document.getElementById('m-vram-pct');
      const cardVram = document.getElementById('card-vram');
      const cardPageTps = document.getElementById('card-page-tps');

      mVramVal.textContent = vram.toFixed(2) + ' GB';
      mVramPct.textContent = `${vramPct}% of 8 GB`;
      if (vram > 6.8) cardVram.classList.add('warning'); else cardVram.classList.remove('warning');
      if (vram > 7.5) cardVram.classList.add('danger'); else cardVram.classList.remove('danger');

      mPageTpsVal.textContent = pageTps.toFixed(2) + ' p/s';
      const pagesMin = (pageTps * 60).toFixed(1);
      mPageMin.textContent = `≈ ${pagesMin} pages/min ${pageTps < 1 && pageTps > 0 ? '— below 1 p/s target' : ''}`;
      if (pageTps > 0 && pageTps < 0.2) cardPageTps.classList.add('warning'); else cardPageTps.classList.remove('warning');

      document.getElementById('m-token-tps').textContent = totalTokenTps.toFixed(1);
      document.getElementById('m-token-breakdown').textContent = `${genTps.toFixed(1)} gen + ${promptTps.toFixed(1)} prompt`;

      document.getElementById('m-dataload').textContent = ((s.timings || {}).data_load_time || 0).toFixed(2) + 's';
      document.getElementById('m-layout').textContent = ((s.timings || {}).layout_time || 0).toFixed(2) + 's';
      document.getElementById('m-vlm').textContent = ((s.timings || {}).vlm_time || 0).toFixed(2) + 's';
      document.getElementById('m-elapsed').textContent = elapsed.toFixed(1) + 's';

      const tLoad = ((s.timings || {}).data_load_time || 0);
      const tLayout = ((s.timings || {}).layout_time || 0);
      const tVlm = ((s.timings || {}).vlm_time || 0);
      const tTotal = tLoad + tLayout + tVlm || 1;
      
      document.getElementById('t-load').style.width = (tLoad / tTotal * 100) + '%';
      document.getElementById('t-layout').style.width = (tLayout / tTotal * 100) + '%';
      document.getElementById('t-vlm').style.width = (tVlm / tTotal * 100) + '%';
      
      const bLabel = document.getElementById('t-bottleneck-label');
      if (tVlm / tTotal > 0.8) {
        bLabel.textContent = `VLM recognition is ${(tVlm/tTotal*100).toFixed(1)}% of elapsed time — bottleneck`;
      } else {
        bLabel.textContent = '';
      }

      if (['uploading', 'preparing', 'running', 'saving'].includes(state)) {
        perfHistory.runVramSamples.push(vram);
        pushEvent(s.detail || state);
      }
      const peakVram = Math.max(...(perfHistory.runVramSamples.length ? perfHistory.runVramSamples : [0]));
      const avgVramVal = avg(perfHistory.runVramSamples);
      document.getElementById('m-vram-avg').textContent = avgVramVal.toFixed(2) + ' GB';
      document.getElementById('m-vram-peak').textContent = `Δ +${(peakVram - avgVramVal).toFixed(2)} GB peak`;

      pushPoint(perfHistory.vram, vram);
      pushPoint(perfHistory.tokenTps, totalTokenTps);
      pushPoint(perfHistory.pageTps, pageTps);
      pushPoint(perfHistory.latency, elapsed);
      drawPerfGraph();

      const q = s.pipeline_queues || {};
      const qLoadNum = Number(q.data_loading ?? 0);
      const qLayoutNum = Number(q.layout ?? 0);
      const qVlmNum = Number((q.vlm_waiting ?? 0) + (q.vlm_running ?? 0));
      qLoad.style.width = Math.min(100, (qLoadNum / 32) * 100) + '%';
      qLayout.style.width = Math.min(100, (qLayoutNum / 32) * 100) + '%';
      qVlm.style.width = Math.min(100, (qVlmNum / 32) * 100) + '%';
      document.getElementById('q-load-val').textContent = qLoadNum.toFixed(0);
      document.getElementById('q-layout-val').textContent = qLayoutNum.toFixed(0);
      document.getElementById('q-vlm-val').textContent = qVlmNum.toFixed(0);

      if (s.config) {
          const configContainer = document.getElementById('config-items');
          configContainer.innerHTML = '';
          for (const [key, val] of Object.entries(s.config)) {
             const item = document.createElement('div');
             item.className = 'config-item';
             let note = '';
             if (key === 'gpu_memory_utilization' && val < 0.5) note = 'Conservative — try 0.55+ for better KV cache';
             if (key === 'enforce_eager' && val === true) note = 'Disables CUDA graph — reduces throughput';
             if (key === 'max_model_len' && val <= 2048) note = 'Safe for 8 GB. Increase to 4096 if needed';
             
             item.innerHTML = `
               <span class="cfg-lbl">${key}</span>
               <span class="cfg-val">${val}</span>
               ${note ? `<span class="cfg-note">${note}</span>` : ''}
             `;
             configContainer.appendChild(item);
          }
      }
    }

    async function pollLogs() {
      if (liveLogs.classList.contains('collapsed')) return;
      if (!isActiveState(currentState)) return;
      try {
        const res = await fetch('/logs');
        if (!res.ok) return;
        const data = await res.json();
        const shouldScroll = liveLogs.scrollTop + liveLogs.clientHeight >= liveLogs.scrollHeight - 10;
        liveLogs.textContent = (data.lines || []).join('');
        if (shouldScroll) {
          liveLogs.scrollTop = liveLogs.scrollHeight;
        }
      } catch (_) {}
    }

    async function pollStatus() {
      try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const s = await res.json();
        updateStatusView(s);
        if (!isActiveState((s.state || '').toLowerCase()) && msgBox.textContent.startsWith('Parsing...')) {
          msgBox.textContent = s.detail || 'Completed';
        }
      } catch (_) {
        // Keep silent; next poll may recover.
      }
    }

    function setFileLabel() {
      const file = fileInput.files && fileInput.files[0];
      fileName.textContent = file ? `Selected: ${file.name}` : '';
    }

    function setOriginalFile(url, type) {
      originalImg.style.display = 'none';
      if (originalPdf) originalPdf.style.display = 'none';
      originalEmpty.style.display = 'none';
      
      if (!url) {
        originalEmpty.style.display = 'block';
      } else if (type === 'application/pdf') {
        if (originalPdf) {
          originalPdf.data = url;
          originalPdf.style.display = 'block';
        }
      } else {
        originalImg.src = url;
        originalImg.style.display = 'block';
      }
    }

    function setAnnotatedImages(urls) {
      Array.from(tabVizWrap.querySelectorAll('img')).forEach(img => img.remove());
      
      if (!urls || urls.length === 0) {
        annotatedEmpty.style.display = 'block';
      } else {
        annotatedEmpty.style.display = 'none';
        urls.forEach(url => {
          const img = document.createElement('img');
          img.src = url;
          img.style.marginBottom = '12px';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '560px';
          img.style.objectFit = 'contain';
          tabVizWrap.appendChild(img);
        });
      }
    }

    async function refreshHistory() {
      try {
        const res = await fetch('/history');
        const data = await res.json();
        const body = document.getElementById('history-body');
        body.innerHTML = '';
        (data.history || []).forEach(run => {
          const row = document.createElement('tr');
          row.style.borderBottom = '1px solid var(--line)';
          const duration = run.finished_at && run.started_at ? (run.finished_at - run.started_at).toFixed(1) + 's' : '-';
          row.innerHTML = `
            <td style="padding: 8px; color: var(--muted); font-family: monospace;">${run.id}</td>
            <td style="padding: 8px;">${run.filename}</td>
            <td style="padding: 8px;">${run.pages_done}/${run.pages_total}</td>
            <td style="padding: 8px;">${duration}</td>
            <td style="padding: 8px;"><span class="badge" style="background: ${run.status==='completed'?'#238636':'#f85149'}">${run.status}</span></td>
            <td style="padding: 8px;">
               <button onclick="downloadPerf('${run.id}')" style="padding: 4px 8px; font-size: 0.7rem; background: var(--accent); border:none; border-radius:4px; color:white; cursor:pointer;">PERF</button>
               <button onclick="deleteRun('${run.id}')" style="padding: 4px 8px; font-size: 0.7rem; background: #f85149; border:none; border-radius:4px; color:white; cursor:pointer;">DEL</button>
            </td>
          `;
          // Store the metrics blob for download
          row._metrics = run.metrics_json;
          body.appendChild(row);
        });
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }

    async function downloadPerf(runId) {
      // Find the row with this runId
      const rows = Array.from(document.querySelectorAll('#history-body tr'));
      const row = rows.find(r => r.cells[0].textContent === runId);
      if (!row || !row._metrics) return;

      const blob = new Blob([row._metrics], {type: 'application/json'});
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `perf_data_${runId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    }

    async function deleteRun(runId) {
      if (!confirm('Are you sure you want to delete this run from history?')) return;
      try {
        const res = await fetch(`/delete_run/${runId}`, { method: 'POST' });
        if (res.ok) {
          refreshHistory();
        } else {
          alert('Delete failed');
        }
      } catch (e) {
        console.error(e);
      }
    }

    function clearOutputs() {
      msgBox.textContent = '';
      rendered.innerHTML = '';
      rawMd.value = '';
      rawJson.value = '';
      setOriginalFile('', '');
      setAnnotatedImages([]);
      resetRunHistory();
      updateStatusView({ state: 'idle', detail: 'Idle', elapsed_sec: 0, vllm: {} });
      activateTab('rendered');
      refreshHistory();
    }

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener('change', setFileLabel);

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;
      fileInput.files = files;
      setFileLabel();
    });

    clearBtn.addEventListener('click', async () => {
      fileInput.value = '';
      setFileLabel();
      clearOutputs();
      try {
        await fetch('/reset_api', { method: 'POST' });
        msgBox.textContent = 'System Reset Complete.';
      } catch (e) {
        msgBox.textContent = 'Reset error, check console.';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!fileInput.files || fileInput.files.length === 0) {
        msgBox.textContent = 'Please select a file first.';
        return;
      }

      // Automatically reset system metrics/view for every new entry
      clearOutputs();
      resetRunHistory();
      try {
        await fetch('/reset_api', { method: 'POST' });
      } catch (err) {
        console.warn('Silent reset failed:', err);
      }

      runBtn.disabled = true;
      clearBtn.disabled = true;
      let parseStartTime = Date.now();
      msgBox.textContent = 'Parsing... (0s)';

      const parseMsgTimer = setInterval(() => {
        const elapsed = Math.round((Date.now() - parseStartTime) / 1000);
        if (msgBox.textContent.startsWith('Parsing...')) {
            msgBox.textContent = `Parsing... (${elapsed}s)`;
        }
      }, 1000);
      await pollStatus();

      try {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);

        const res = await fetch('/parse_api', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || 'Parse failed');
        }

        msgBox.textContent = data.message || '';
        rawMd.value = data.raw_markdown || '';
        rawJson.value = data.raw_json || '';

        const renderSrc = data.rendered_markdown || data.raw_markdown || '';
        rendered.innerHTML = window.marked ? marked.parse(renderSrc) : renderSrc;

        setOriginalFile(data.original_file_url || '', data.original_file_type || '');
        setAnnotatedImages(data.annotated_image_urls || []);
        activateTab('rendered');
      } catch (err) {
        msgBox.textContent = `Parse failed: ${err.message || err}`;
      } finally {
        clearInterval(parseMsgTimer);
        await pollStatus();
        runBtn.disabled = false;
        clearBtn.disabled = false;
      }
    });

    clearOutputs();
    refreshHistory();
    pollStatus();
    pollLogs();
    scheduleStatusPoll();
    scheduleLogsPoll();
  </script>
</body>
</html>
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    # Initialize DB
    init_db()
    # Keep startup responsive while warming model paths in background.
    threading.Thread(target=_run_warmup_once, daemon=True).start()
    yield

app = FastAPI(title="Option3 UI", lifespan=lifespan)


@app.get("/history", response_class=JSONResponse)
async def history() -> JSONResponse:
    try:
        data = get_runs()
        return JSONResponse({"history": data})
    except Exception as e:
        return JSONResponse({"detail": f"Failed to fetch history: {e}"}, status_code=500)

@app.post("/delete_run/{run_id}", response_class=JSONResponse)
async def delete_run_api(run_id: str) -> JSONResponse:
    try:
        run = get_run(run_id)
        if run:
            # Optionally remove physical files if desired
            # out_dir = Path(run["output_path"])
            # if out_dir.exists():
            #     import shutil
            #     shutil.rmtree(out_dir)
            delete_run(run_id)
        return JSONResponse({"message": "Run deleted from database"})
    except Exception as e:
        return JSONResponse({"detail": f"Delete failed: {e}"}, status_code=500)

@app.get("/", response_class=HTMLResponse)
async def home() -> HTMLResponse:
    return HTMLResponse(build_home())


@app.get("/status", response_class=JSONResponse)
async def status() -> JSONResponse:
    return JSONResponse(_status_snapshot())


@app.get("/logs", response_class=JSONResponse)
async def logs() -> JSONResponse:
    if not VLLM_LOG_PATH.exists():
        return JSONResponse({"lines": ["Log file not found.\n"]})
    try:
        with open(VLLM_LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 16384))
            lines = f.readlines()
            return JSONResponse({"lines": lines[-50:]})
    except Exception as e:
        return JSONResponse({"lines": [f"Error reading logs: {e}\n"]})




@app.post("/reset_api", response_class=JSONResponse)
async def reset_api() -> JSONResponse:
    global pipeline
    try:
        if pipeline is not None:
            # Attempt to clear Paddle internal caches if they exist
            import paddle
            paddle.device.cuda.empty_cache()
            # We don't necessarily want to kill the pipeline object if it's the server client,
            # but we can reset the status.
        
        with STATUS_LOCK:
            for key in ["timings", "last_vllm", "run_context"]:
                STATUS[key] = {}
            STATUS["pages_total"] = 0
            STATUS["pages_done"] = 0
            STATUS["state"] = "idle"
            STATUS["detail"] = "Idle"
            STATUS["started_at"] = None
            STATUS["finished_at"] = None
            
        return JSONResponse({"message": "Backend status reset. CUDA cache cleared if applicable."})
    except Exception as e:
        return JSONResponse({"detail": f"Reset failed: {e}"}, status_code=500)


@app.post("/parse_api", response_class=JSONResponse)
async def parse_api(file: UploadFile = File(...)) -> JSONResponse:
    suffix = Path(file.filename).suffix or ".bin"
    tmp_path: Optional[Path] = None
    staged_input_paths: list[Path] = []

    try:
        parse_started = time.time()
        warmup_at_start = bool(WARMUP_DONE)
        run_context = {
            "warmup_done_at_start": warmup_at_start,
            "pdf_dpi": DEFAULT_PDF_DPI,
            "config_hash": _get_backend_config_hash(),
            "server_uptime_sec_at_start": round(max(0.0, parse_started - APP_STARTED_AT), 1),
            "gpu_start": _get_gpu_snapshot(),
            "source_suffix": suffix.lower(),
        }
        _set_status("uploading", f"Uploading: {file.filename}")

        with STATUS_LOCK:
            STATUS["timings"] = {}
            STATUS["last_vllm"] = {}
            STATUS["run_context"] = run_context
            STATUS["pages_total"] = 0
            STATUS["pages_done"] = 0
            STATUS["started_at"] = time.time()
            STATUS["finished_at"] = None

        upload_t0 = time.time()
        with tempfile.NamedTemporaryFile(suffix=suffix, dir=UPLOAD_DIR, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)
        with STATUS_LOCK:
            STATUS["timings"]["data_load_time"] = round(time.time() - upload_t0, 4)

        _set_status("preparing", "Preparing pipeline")
        out_dir = OUTPUT_DIR / f"run_{uuid.uuid4().hex[:10]}"
        out_dir.mkdir(parents=True, exist_ok=True)

        _set_status("running", "Running OCR + VLM inference")
        pipeline_obj = get_pipeline()
        print(f"INFO: Starting pipeline prediction on {tmp_path}")
        start_time = time.time()

        loop = asyncio.get_event_loop()
        if suffix.lower() == ".pdf":
            _set_status("preparing", f"Rendering PDF pages at {DEFAULT_PDF_DPI} DPI")
            staged_input_paths = _render_pdf_pages_to_images(tmp_path, DEFAULT_PDF_DPI, UPLOAD_DIR)
            if not staged_input_paths:
                raise ValueError("PDF rendering failed: Could not extract any valid pages from file.")
        else:
            staged_input_paths = [tmp_path]

        with STATUS_LOCK:
            STATUS["pages_total"] = len(staged_input_paths)
            STATUS["pages_done"] = 0

        results = []
        total_inputs = len(staged_input_paths)
        for i, input_path in enumerate(staged_input_paths, start=1):
            _set_status("running", f"Running OCR + VLM inference page {i}/{total_inputs}")
            page_results = await loop.run_in_executor(
                None,
                lambda p=str(input_path): list(
                    pipeline_obj.predict(
                        p,
                        max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
                    )
                ),
            )
            if page_results:
                results.extend(page_results)

            with STATUS_LOCK:
                STATUS["pages_done"] = i

        duration = time.time() - start_time
        with STATUS_LOCK:
            STATUS["pages_total"] = max(STATUS.get("pages_total", 0), len(results))
            # Fallback: if wrapper did not capture, keep inference wall-clock.
            if STATUS["timings"].get("vlm_time", 0) <= 0:
                STATUS["timings"]["vlm_time"] = round(duration, 4)
        print(f"INFO: Pipeline prediction completed in {duration:.2f} seconds.")

        raw_md_pages = []
        rendered_md_pages = []
        json_pages = []
        original_file_url = _to_data_url(tmp_path)
        original_file_type = mimetypes.guess_type(tmp_path.name)[0] or "application/octet-stream"
        annotated_image_urls = []

        _set_status("saving", "Saving markdown/json/visualization outputs")
        for idx, res in enumerate(results, start=1):
            _set_status("saving", f"Saving page {idx}/{len(results)}")
            page_dir = out_dir / f"page_{idx:03d}"
            page_dir.mkdir(parents=True, exist_ok=True)
            res.save_to_markdown(save_path=str(page_dir))
            res.save_to_json(save_path=str(page_dir))
            res.save_to_img(save_path=str(page_dir))

            md_files = sorted(page_dir.rglob("*.md"))
            if md_files:
                raw_text = md_files[0].read_text(encoding="utf-8")
                raw_md_pages.append(raw_text)
                rendered_md_pages.append(_inline_markdown_images(raw_text, md_files[0].parent))

            json_files = sorted(page_dir.rglob("*.json"))
            if json_files:
                try:
                    json_pages.append(json.loads(json_files[0].read_text(encoding="utf-8")))
                except Exception:
                    pass

            best_img = _pick_best_annotated_image(page_dir)
            if best_img:
                annotated_image_urls.append(best_img)

            with STATUS_LOCK:
                STATUS["pages_done"] = idx

        merged_md = "\n\n---\n\n".join(raw_md_pages)
        merged_rendered_md = "\n\n---\n\n".join(rendered_md_pages)
        merged_json = json.dumps({"pages": json_pages}, ensure_ascii=False, indent=2)

        total_elapsed = round(time.time() - parse_started, 4)
        with STATUS_LOCK:
          STATUS["timings"]["end_to_end_time"] = total_elapsed
          if STATUS["timings"].get("layout_time", 0) <= 0:
            # If internals are not hookable on this version, expose a stable estimate.
            data_t = float(STATUS["timings"].get("data_load_time", 0))
            vlm_t = float(STATUS["timings"].get("vlm_time", 0))
            STATUS["timings"]["layout_time"] = max(0.0, round(total_elapsed - data_t - vlm_t, 4))
          STATUS["run_context"]["gpu_end"] = _get_gpu_snapshot()
          STATUS["run_context"]["warmup_done_at_end"] = bool(WARMUP_DONE)

        _set_status("completed", "Completed")
        
        # Save to DB
        try:
            snap = _status_snapshot()
            save_run(
                run_id=str(out_dir.name),
                filename=file.filename,
                started_at=snap.get("started_at"),
                finished_at=snap.get("finished_at"),
                pages_total=snap.get("pages_total", 0),
                pages_done=snap.get("pages_done", 0),
                status="completed",
                metrics=snap,
                output_path=str(out_dir)
            )
        except Exception as db_err:
            print(f"ERROR: Failed to save run to database: {db_err}")

        return JSONResponse(
            {
                "message": f"Parsed {len(results)} page(s). Output saved in: {out_dir}",
                "raw_markdown": merged_md,
                "rendered_markdown": merged_rendered_md,
                "raw_json": merged_json,
                "original_file_url": original_file_url,
                "original_file_type": original_file_type,
                "annotated_image_urls": annotated_image_urls,
            }
        )
    except Exception as e:
        _set_status("error", "Parse failed", error=str(e))
        return JSONResponse({"detail": f"Parse failed: {e}"}, status_code=500)
    finally:
        for staged_path in staged_input_paths:
            if staged_path != tmp_path:
                staged_path.unlink(missing_ok=True)
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("option3_ui:app", host="0.0.0.0", port=7862, reload=False)
