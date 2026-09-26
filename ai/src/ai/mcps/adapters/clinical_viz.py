"""
Clinical Visualization Adapter,  Layer 2 Chart Renderer.
Takes structured patient observations + query, normalizes them, generates a
matplotlib/seaborn chart, returns base64 PNG + summary.

Normalization is deterministic and rule-based by default, so patient
observations never leave the host. Sending them to Groq (third-party API) for
LLM normalization is opt-in: set VIZ_USE_GROQ_NORMALIZER=true AND provide
GROQ_API_KEY. See "Data Residency" in ai/README.md.

Chart types (rule-based, or Groq-selected when opted in):
  - dual_line: creatinine (left) + eGFR (right) renal function
  - line:      single variable (LVEF, HbA1c) with reference lines
  - gantt:     diagnostic escalation timeline by phase
"""
import json
import logging
import base64
import os
import re
from io import BytesIO
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns

sns.set_theme(style="whitegrid")

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Groq client setup (same pattern as mcps/router.py)
# ---------------------------------------------------------------------------
try:
    from langchain_groq import ChatGroq
    from langchain_core.messages import SystemMessage, HumanMessage
except ImportError:
    ChatGroq = None

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_VIZ_MODEL", "llama-3.3-70b-versatile")


def _groq_normalizer_opted_in() -> bool:
    """True only when the operator explicitly allowed sending patient data to Groq.

    Read at call time (not import time) so it can be toggled without a restart
    of the importing process and is easy to test.
    """
    return os.getenv("VIZ_USE_GROQ_NORMALIZER", "").strip().lower() in ("1", "true", "yes", "on")

# ---------------------------------------------------------------------------
# Reference constants
# ---------------------------------------------------------------------------
LVEF_SEVERE = 35.0
LVEF_NORMAL = 55.0

CLINICAL_STATUS_COLORS = {
    "Misdiagnosis": "#e74c3c",
    "Escalation": "#f39c12",
    "Confirmed Diagnosis": "#3498db",
    "Active": "#2ecc71",
    "Adverse Event": "#e74c3c",
    "Recovery": "#2ecc71",
}


# ===================================================================
# Stage 1: Groq Normalizer Agent
# ===================================================================
async def _groq_normalize(
    patient_data: List[Dict[str, Any]], query: str
) -> Dict[str, Any]:
    """
    Use Groq LLM to:
      - Normalize units (creatinine → mg/dL, eGFR → mL/min/1.73m², LVEF → %)
      - Detect missing critical values
      - Determine chart type + variables + annotations
      - Produce a short clinical summary
    """
    # Residency gate: patient observations are sent to a third party only when
    # explicitly opted in AND a key is configured. Otherwise nothing leaves the host.
    if not _groq_normalizer_opted_in() or not ChatGroq or not GROQ_API_KEY:
        return _rule_based_fallback(patient_data, query)

    prompt = (
        "You are a clinical data normalizer. Given patient observations and a clinician query, "
        "normalize the data and return a JSON object with these fields:\n"
        "  - normalized_data: list of observations, each with timestamp, type, measurements dict, "
        "    event (or null), phase (or null), clinical_status (or null), text_summary (or null)\n"
        "  - chart_type: one of 'dual_line' (creatinine+egfr), 'line' (single var like lvef), 'gantt' (phase timeline)\n"
        "  - variables: list of measurement keys to plot\n"
        "  - annotations: list of event strings to mark on chart\n"
        "  - summary: 1-2 sentence clinical trend description\n"
        "  - missing_fields: list of fields that were missing or null\n\n"
        "Unit rules:\n"
        "  - creatinine → mg/dL  (if unit missing, assume mg/dL)\n"
        "  - egfr → mL/min/1.73m²\n"
        "  - lvef → %\n"
        "  - bnp → pg/mL\n"
        "  - cardiothoracic_ratio → %\n\n"
        "Chart selection rules:\n"
        "  - If 'creatinine' or 'egfr' in measurements → chart_type='dual_line', variables=['creatinine', 'egfr']\n"
        "  - If 'lvef' in measurements → chart_type='line', variables=['lvef']\n"
        "  - If 'phase' field present with distinct phases → chart_type='gantt'\n\n"
        f"Clinician query: {query}\n\n"
        f"Patient data:\n{json.dumps(patient_data, indent=2)}\n\n"
        "Return ONLY valid JSON, no other text."
    )

    try:
        llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.1)
        res = llm.invoke([
            SystemMessage(content="You are a clinical data normalizer. Output ONLY JSON."),
            HumanMessage(content=prompt),
        ])
        match = re.search(r"\{.*\}", res.content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    except Exception as e:
        logger.warning(f"Groq normalization failed ({e}), using rule-based fallback")

    return _rule_based_fallback(patient_data, query)


def _rule_based_fallback(
    patient_data: List[Dict[str, Any]], query: str
) -> Dict[str, Any]:
    """Default normalization (deterministic, on-host); also the fallback if the opt-in Groq call fails."""
    all_measurements = set()
    has_phase = any(p.get("phase") for p in patient_data)
    annotations = []
    normalized = []

    for p in patient_data:
        ts = p.get("timestamp", "")
        m = p.get("measurements") or {}
        all_measurements.update(m.keys())
        if p.get("event"):
            annotations.append(p.get("event", ""))
        normalized.append({
            "timestamp": ts,
            "type": p.get("type", "observation"),
            "event": p.get("event"),
            "phase": p.get("phase"),
            "clinical_status": p.get("clinical_status"),
            "text_summary": p.get("text_summary"),
            "measurements": dict(m),
        })

    chart_type = "line"
    variables = list(all_measurements)

    distinct_phases = len(set(p.get("phase", "") for p in patient_data if p.get("phase")))

    # Gantt takes priority if phases are explicitly given
    if has_phase and distinct_phases >= 2:
        chart_type = "gantt"
        variables = []
    elif "creatinine" in all_measurements or "egfr" in all_measurements:
        chart_type = "dual_line"
        variables = [v for v in ["creatinine", "egfr"] if v in all_measurements]
    elif "lvef" in all_measurements:
        chart_type = "line"
        variables = ["lvef"]

    summary = _generate_fallback_summary(normalized, query)

    return {
        "normalized_data": normalized,
        "chart_type": chart_type,
        "variables": variables,
        "annotations": annotations,
        "summary": summary,
        "missing_fields": [],
    }


def _generate_fallback_summary(
    data: List[Dict[str, Any]], query: str
) -> str:
    """Simple template-based summary as last resort."""
    events = [d.get("event") for d in data if d.get("event")]
    measurements_seen = {}
    for d in data:
        for k, v in (d.get("measurements") or {}).items():
            if k not in measurements_seen:
                measurements_seen[k] = []
            measurements_seen[k].append(v)

    parts = []
    for var, vals in measurements_seen.items():
        if len(vals) >= 2:
            direction = "increased" if vals[-1] > vals[0] else "declined"
            parts.append(f"{var} {direction} from {vals[0]} to {vals[-1]}")
    if events:
        parts.append(f"key events: {', '.join(e for e in events if e)}")

    return "; ".join(parts) if parts else f"Clinical trend for: {query}"


# ===================================================================
# Stage 2: Chart Renderers
# ===================================================================
def _render_dual_line(
    data: List[Dict[str, Any]], variables: List[str], annotations: List[str]
) -> plt.Figure:
    """
    Dual-axis line chart: creatinine (left, mg/dL) + eGFR (right, mL/min/1.73m²).
    """
    fig, ax1 = plt.subplots(figsize=(12, 6))

    times, creatinine_vals, egfr_vals = [], [], []
    events = []

    for d in sorted(data, key=lambda x: x.get("timestamp", "")):
        ts = d.get("timestamp", "")
        m = d.get("measurements") or {}
        dt = None
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            try:
                from dateutil import parser as _dparser
                dt = _dparser.parse(ts)
            except Exception:
                pass
        if dt is None:
            continue

        times.append(dt)
        if "creatinine" in m and m["creatinine"] is not None:
            creatinine_vals.append((dt, m["creatinine"]))
        if "egfr" in m and m["egfr"] is not None:
            egfr_vals.append((dt, m["egfr"]))
        if d.get("event"):
            events.append((dt, d["event"]))

    # Creatinine (left axis)
    if creatinine_vals:
        c_t, c_v = zip(*creatinine_vals)
        ax1.plot(c_t, c_v, "o-", color="#e74c3c", linewidth=2.5, markersize=6, label="Creatinine (mg/dL)")
        ax1.fill_between(c_t, c_v, alpha=0.1, color="#e74c3c")
    ax1.set_xlabel("Date", fontsize=12)
    ax1.set_ylabel("Creatinine (mg/dL)", color="#e74c3c", fontsize=12)
    ax1.tick_params(axis="y", labelcolor="#e74c3c")

    # eGFR (right axis)
    ax2 = ax1.twinx()
    if egfr_vals:
        e_t, e_v = zip(*egfr_vals)
        ax2.plot(e_t, e_v, "s--", color="#3498db", linewidth=2.5, markersize=6, label="eGFR (mL/min/1.73m²)")
        ax2.fill_between(e_t, e_v, alpha=0.1, color="#3498db")
    ax2.set_ylabel("eGFR (mL/min/1.73m²)", color="#3498db", fontsize=12)
    ax2.tick_params(axis="y", labelcolor="#3498db")

    # Shaded deterioration region (between first obs and peak)
    if creatinine_vals:
        peak_dt = max(creatinine_vals, key=lambda x: x[1])[0]
        first_dt = creatinine_vals[0][0]
        ax1.axvspan(first_dt, peak_dt, alpha=0.08, color="#e74c3c", label="Deterioration period")

    # Event markers,  stagger labels to avoid overlap
    events_sorted = sorted(events, key=lambda x: x[0])
    label_y_positions = []
    last_dt = None
    y_slot = 0
    for dt, _ in events_sorted:
        if last_dt and (dt - last_dt).total_seconds() < 3 * 86400:
            y_slot = (y_slot + 1) % 3
        else:
            y_slot = 0
        label_y_positions.append(y_slot)
        last_dt = dt

    y_offsets = [0.95, 0.82, 0.69]
    for i, (dt, event) in enumerate(events_sorted):
        color = "#e74c3c" if "discontinu" in event.lower() or "toxicity" in event.lower() else "#2ecc71" if "start" in event.lower() else "#f39c12"
        ax1.axvline(x=dt, color=color, linestyle="--", alpha=0.6, linewidth=1.5)
        y_pos = ax1.get_ylim()[1] * y_offsets[label_y_positions[i]]
        ax1.text(dt, y_pos, event, rotation=45, fontsize=7,
                 color=color, ha="right", va="top", bbox=dict(facecolor="white", alpha=0.7, pad=1))

    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax1.xaxis.set_major_locator(mdates.DayLocator(interval=3))
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45, ha="right")

    # Combined legend
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper left", fontsize=9)

    ax1.grid(True, alpha=0.3)
    ax1.set_title("Renal Function Trend", fontsize=14, fontweight="bold")
    fig.tight_layout()
    return fig


def _render_single_line(
    data: List[Dict[str, Any]],
    variable: str,
    annotations: List[str],
    ref_lines: Optional[List[Tuple[float, str, str]]] = None,
) -> plt.Figure:
    """
    Single line chart with optional reference lines (e.g., LVEF 35%, 55%).
    """
    fig, ax = plt.subplots(figsize=(12, 6))

    times, values = [], []
    events = []

    for d in sorted(data, key=lambda x: x.get("timestamp", "")):
        ts = d.get("timestamp", "")
        m = d.get("measurements") or {}
        dt = None
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            try:
                from dateutil import parser as _dparser
                dt = _dparser.parse(ts)
            except Exception:
                pass
        if dt is None:
            continue

        times.append(dt)
        if variable in m and m[variable] is not None:
            values.append((dt, m[variable]))
        if d.get("event"):
            events.append((dt, d["event"]))

    # Main line
    if values:
        v_t, v_v = zip(*values)
        ax.plot(v_t, v_v, "o-", color="#2ecc71", linewidth=2.5, markersize=7)
        ax.fill_between(v_t, v_v, alpha=0.12, color="#2ecc71")

        # Annotate endpoints
        for label, point, offset in [
            ("Start", values[0], -15),
            ("Latest", values[-1], 15),
        ]:
            ax.annotate(f"{label}: {point[1]}",
                        xy=(point[0], point[1]),
                        xytext=(offset, 10), textcoords="offset points",
                        fontsize=9, fontweight="bold",
                        arrowprops=dict(arrowstyle="->", color="gray", alpha=0.6))

    # Reference lines
    unit = "%" if variable == "lvef" else ""
    if ref_lines is None:
        if variable == "lvef":
            ref_lines = [
                (LVEF_SEVERE, "Severe dysfunction (35%)", "#e74c3c"),
                (LVEF_NORMAL, "Normal lower bound (55%)", "#2ecc71"),
            ]
        else:
            ref_lines = []

    for val, label, color in ref_lines:
        ax.axhline(y=val, color=color, linestyle="--", alpha=0.5, linewidth=1.2)
        ax.text(times[0] if times else datetime.now(), val, f"  {label}",
                fontsize=8, color=color, va="center")

    # Event markers
    for dt, event in events:
        color = "#e74c3c" if any(w in event.lower() for w in ["diagnosis", "failure"]) else "#f39c12" if "switch" in event.lower() else "#2ecc71"
        ax.axvline(x=dt, color=color, linestyle="--", alpha=0.6, linewidth=1.5)
        ax.text(dt, ax.get_ylim()[1] * 0.9, event, rotation=45, fontsize=8,
                color=color, ha="right", va="top", bbox=dict(facecolor="white", alpha=0.7, pad=1))

    label_map = {"lvef": "LVEF (%)", "hba1c": "HbA1c (%)", "bnp": "BNP (pg/mL)"}
    ax.set_ylabel(label_map.get(variable, variable), fontsize=12)
    ax.set_xlabel("Date", fontsize=12)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.xaxis.set_major_locator(mdates.DayLocator(interval=3))
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha="right")

    ax.grid(True, alpha=0.3)
    title_map = {"lvef": "Cardiac Function (LVEF)", "hba1c": "HbA1c Trend", "bnp": "BNP Trend"}
    ax.set_title(title_map.get(variable, f"{variable.upper()} Trend"), fontsize=14, fontweight="bold")
    fig.tight_layout()
    return fig


def _render_gantt(data: List[Dict[str, Any]]) -> plt.Figure:
    """
    Gantt/timeline chart showing diagnostic escalation by phase.
    X-axis = time, Y-axis = clinical phase, color = clinical_status.
    Events in the same phase are staggered into sub-rows to avoid overlap.
    """
    fig, ax = plt.subplots(figsize=(14, 8))

    phase_order = []
    phase_entries: Dict[str, List[Dict]] = {}

    for d in sorted(data, key=lambda x: x.get("timestamp", "")):
        phase = d.get("phase") or "Unknown"
        if phase not in phase_order:
            phase_order.append(phase)
        phase_entries.setdefault(phase, []).append(d)

    # Map phases to base y positions (reverse so first phase is top)
    y_positions = {p: len(phase_order) - 1 - i for i, p in enumerate(phase_order)}

    # Assign sub-rows within each phase to avoid label overlap
    event_markers = []
    sub_row_spacing = 0.25

    for phase, entries in phase_entries.items():
        base_y = y_positions[phase]
        prev_dt = None
        sub_row = 0
        for entry in entries:
            ts = entry.get("timestamp", "")
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                continue

            # Stagger sub-row if events are within 5 days
            if prev_dt and (dt - prev_dt).total_seconds() < 5 * 86400:
                sub_row += 1
            else:
                sub_row = 0
            prev_dt = dt

            status = entry.get("clinical_status", "Unknown")
            color = CLINICAL_STATUS_COLORS.get(status, "#95a5a6")
            event = entry.get("event", "")
            m = entry.get("measurements") or {}

            y_offset = sub_row * sub_row_spacing
            label = event
            if m:
                val_str = ", ".join(f"{k}={v}" for k, v in m.items())
                label += f" ({val_str})"

            # Draw bar
            ax.barh(base_y + y_offset, 0.6, left=mdates.date2num(dt), height=0.2,
                    color=color, alpha=0.7, edgecolor="white", linewidth=1)

            # Label above bar
            ax.text(dt, base_y + y_offset + 0.15, label, fontsize=7, ha="left", va="bottom",
                    color="black",
                    bbox=dict(facecolor=color, alpha=0.15, pad=1, boxstyle="round,pad=0.3"))
            event_markers.append((dt, base_y + y_offset, label, color, status))

    # Y-axis
    ax.set_yticks(list(y_positions.values()))
    ax.set_yticklabels(list(y_positions.keys()), fontsize=11, fontweight="bold")
    ax.set_ylabel("Clinical Phase", fontsize=12)

    # X-axis
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.xaxis.set_major_locator(mdates.DayLocator(interval=3))
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha="right")
    ax.set_xlabel("Date", fontsize=12)

    ax.grid(True, alpha=0.3, axis="x")
    ax.set_title("Diagnostic Escalation Timeline", fontsize=14, fontweight="bold")
    ax.set_xlim(left=mdates.date2num(event_markers[0][0]) - 1 if event_markers else None)

    # Legend for clinical status
    from matplotlib.patches import Patch
    legend_handles = [
        Patch(facecolor=color, alpha=0.7, label=status)
        for status, color in CLINICAL_STATUS_COLORS.items()
        if any(e[4] == status for e in event_markers)
    ]
    if legend_handles:
        ax.legend(handles=legend_handles, loc="upper left", fontsize=8, title="Clinical Status",
                  framealpha=0.9, edgecolor="gray")

    fig.tight_layout()
    return fig


# ===================================================================
# Main entry point
# ===================================================================
async def render_chart(
    patient_data: List[Dict[str, Any]], query: str
) -> Dict[str, Any]:
    """
    Full rendering pipeline:
      1. Normalize data (rule-based by default; Groq only if opted in, see module docstring)
      2. Chart rendering
      3. Base64 encoding
    Returns: { image_base64, summary, chart_type }
    """
    normalized = await _groq_normalize(patient_data, query)
    chart_type = normalized.get("chart_type", "line")
    variables = normalized.get("variables", [])
    annotations = normalized.get("annotations", [])
    data = normalized.get("normalized_data", patient_data)
    summary = normalized.get("summary", f"Clinical trend for: {query}")

    logger.info(f"Rendering chart type={chart_type} variables={variables}")

    if chart_type == "dual_line":
        fig = _render_dual_line(data, variables, annotations)
    elif chart_type == "gantt":
        fig = _render_gantt(data)
    elif chart_type == "line":
        variable = variables[0] if variables else "lvef"
        fig = _render_single_line(data, variable, annotations)
    else:
        variable = variables[0] if variables else "lvef"
        fig = _render_single_line(data, variable, annotations)

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    image_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "image_base64": image_base64,
        "summary": summary,
        "chart_type": chart_type,
    }
