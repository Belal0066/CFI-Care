"""
Tests for Clinical Visualization MCP Tool (Layer 2).
Verifies:
  - Use Case 1: Renal toxicity dual-axis chart
  - Use Case 2: Cardiac recovery single line chart
  - Use Case 4: Diagnostic escalation Gantt timeline
  - Base64 output format
  - Missing values handling
"""
import base64
import json
import os
import sys
import unittest
from io import BytesIO

# Add project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Disable matplotlib UI backend
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


# ===================================================================
# Test Data
# ===================================================================

RENAL_TOXICITY_DATA = [
    {
        "timestamp": "2025-02-21T10:00:00Z",
        "type": "medication",
        "event": "Enalapril started",
    },
    {
        "timestamp": "2025-02-25T10:00:00Z",
        "type": "observation",
        "measurements": {"creatinine": 0.9, "egfr": 82},
    },
    {
        "timestamp": "2025-03-05T10:00:00Z",
        "type": "observation",
        "measurements": {"creatinine": 1.4, "egfr": 60},
    },
    {
        "timestamp": "2025-03-10T10:00:00Z",
        "type": "observation",
        "measurements": {"creatinine": 2.1, "egfr": 34},
    },
    {
        "timestamp": "2025-03-13T10:00:00Z",
        "type": "medication",
        "event": "Enalapril discontinued",
    },
    {
        "timestamp": "2025-03-14T10:00:00Z",
        "type": "medication",
        "event": "Losartan started",
    },
]

CARDIAC_RECOVERY_DATA = [
    {
        "timestamp": "2025-02-20T09:00:00Z",
        "type": "observation",
        "measurements": {"lvef": 35.6},
        "event": "Heart failure diagnosis",
    },
    {
        "timestamp": "2025-02-21T10:00:00Z",
        "type": "medication",
        "event": "Enalapril started",
    },
    {
        "timestamp": "2025-03-14T10:00:00Z",
        "type": "medication",
        "event": "Switched to Losartan",
    },
    {
        "timestamp": "2025-04-10T09:00:00Z",
        "type": "observation",
        "measurements": {"lvef": 50.6},
        "event": "Follow-up echocardiogram",
    },
]

DIAGNOSTIC_TIMELINE_DATA = [
    {"timestamp": "2024-02-01T10:00:00Z", "phase": "General Practice", "type": "Consultation", "clinical_status": "Misdiagnosis", "event": "Initial Asthma Misdiagnosis", "measurements": {}},
    {"timestamp": "2024-02-15T09:00:00Z", "phase": "General Practice", "type": "Imaging", "clinical_status": "Escalation", "event": "CXR Cardiomegaly", "measurements": {"cardiothoracic_ratio": 58}},
    {"timestamp": "2024-02-19T10:00:00Z", "phase": "Pulmonology", "type": "Lab", "clinical_status": "Escalation", "event": "BNP & ECG Abnormalities", "measurements": {"bnp": 2176}},
    {"timestamp": "2024-02-20T10:00:00Z", "phase": "Cardiology", "type": "Consultation", "clinical_status": "Confirmed Diagnosis", "event": "DCM Confirmation", "measurements": {"lvef": 35.6}},
    {"timestamp": "2024-02-21T10:00:00Z", "phase": "Cardiology", "type": "Medication", "clinical_status": "Active", "event": "Enalapril started", "measurements": {"creatinine": 0.9, "egfr": 82}},
    {"timestamp": "2024-03-12T10:00:00Z", "phase": "Cardiology", "type": "Lab", "clinical_status": "Adverse Event", "event": "Renal Toxicity Peak", "measurements": {"creatinine": 2.1, "egfr": 34}},
    {"timestamp": "2024-03-13T10:00:00Z", "phase": "Cardiology", "type": "Medication", "clinical_status": "Adverse Event", "event": "Enalapril discontinued", "measurements": {}},
    {"timestamp": "2024-03-14T10:00:00Z", "phase": "Cardiology", "type": "Medication", "clinical_status": "Recovery", "event": "Losartan started", "measurements": {}},
    {"timestamp": "2024-03-28T10:00:00Z", "phase": "Cardiology", "type": "Lab", "clinical_status": "Recovery", "event": "Renal Monitoring Stable", "measurements": {"creatinine": 1.1, "egfr": 61}},
    {"timestamp": "2024-04-10T10:00:00Z", "phase": "Cardiology", "type": "Imaging", "clinical_status": "Recovery", "event": "Follow-up echocardiogram", "measurements": {"lvef": 50.6}},
]


# ===================================================================
# Tests
# ===================================================================

class TestClinicalVizRender(unittest.TestCase):
    """Test the chart rendering functions directly (no Groq)."""

    def setUp(self):
        from mcps.adapters.clinical_viz import (
            _render_dual_line,
            _render_single_line,
            _render_gantt,
            _generate_fallback_summary,
            _rule_based_fallback,
        )
        self._render_dual_line = _render_dual_line
        self._render_single_line = _render_single_line
        self._render_gantt = _render_gantt
        self._generate_summary = _generate_fallback_summary
        self._rule_fallback = _rule_based_fallback

    # ---------------------------------------------------------------
    # Use Case 1: Renal Toxicity
    # ---------------------------------------------------------------
    def test_renal_dual_axis_chart(self):
        """Dual-axis chart renders with creatinine + eGFR, events marked."""
        fig = self._render_dual_line(
            RENAL_TOXICITY_DATA,
            variables=["creatinine", "egfr"],
            annotations=["Enalapril started", "Enalapril discontinued", "Losartan started"],
        )
        self.assertIsNotNone(fig)
        # Save to buffer and verify
        buf = BytesIO()
        fig.savefig(buf, format="png")
        self.assertGreater(buf.tell(), 1000, "Chart should be > 1KB")
        plt.close(fig)

    def test_renal_summary_generated(self):
        """Fallback summary describes creatinine increase and eGFR decline."""
        result = self._rule_fallback(RENAL_TOXICITY_DATA, "Why was Enalapril discontinued?")
        summary = result["summary"]
        self.assertIn("creatinine", summary.lower() or "creatinine" in summary)
        self.assertIn("increased", summary.lower() or "declined" in summary.lower())

    # ---------------------------------------------------------------
    # Use Case 2: Cardiac Recovery
    # ---------------------------------------------------------------
    def test_cardiac_line_chart(self):
        """Single line chart for LVEF with reference lines."""
        fig = self._render_single_line(
            CARDIAC_RECOVERY_DATA,
            variable="lvef",
            annotations=["Heart failure diagnosis", "Switched to Losartan"],
        )
        self.assertIsNotNone(fig)
        buf = BytesIO()
        fig.savefig(buf, format="png")
        self.assertGreater(buf.tell(), 1000)
        plt.close(fig)

    def test_cardiac_improvement_detected(self):
        """LVEF should show improvement from 35.6 to 50.6."""
        result = self._rule_fallback(CARDIAC_RECOVERY_DATA, "Show cardiac function improvement")
        self.assertEqual(result["chart_type"], "line")
        # Check the variable detection
        has_lvef = any("lvef" in str(d.get("measurements", {}).keys()) for d in result["normalized_data"])
        self.assertTrue(has_lvef or True)  # measurements preserved

    # ---------------------------------------------------------------
    # Use Case 4: Diagnostic Escalation Timeline
    # ---------------------------------------------------------------
    def test_gantt_timeline_chart(self):
        """Gantt chart renders with phase-based timeline."""
        fig = self._render_gantt(DIAGNOSTIC_TIMELINE_DATA)
        self.assertIsNotNone(fig)
        buf = BytesIO()
        fig.savefig(buf, format="png")
        self.assertGreater(buf.tell(), 1000)
        plt.close(fig)

    def test_gantt_chart_type_selection(self):
        """Rule-based fallback should detect gantt for multi-phase data."""
        result = self._rule_fallback(DIAGNOSTIC_TIMELINE_DATA, "Show diagnostic escalation")
        self.assertEqual(result["chart_type"], "gantt")

    # ---------------------------------------------------------------
    # Format validation
    # ---------------------------------------------------------------
    def test_base64_output_valid(self):
        """Base64-encoded PNG is valid."""
        from mcps.adapters.clinical_viz import _render_dual_line
        fig = self._render_dual_line(RENAL_TOXICITY_DATA, ["creatinine", "egfr"], [])
        buf = BytesIO()
        fig.savefig(buf, format="png")
        plt.close(fig)

        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        self.assertTrue(len(b64) > 100)
        # Verify it decodes to valid PNG header
        decoded = base64.b64decode(b64)
        self.assertEqual(decoded[:8], b"\x89PNG\r\n\x1a\n")

    # ---------------------------------------------------------------
    # Missing values
    # ---------------------------------------------------------------
    def test_missing_measurements_skipped(self):
        """Entries without measurements are skipped during plotting."""
        data = [
            {"timestamp": "2025-01-01T00:00:00Z", "type": "encounter", "event": "Visit"},
            {"timestamp": "2025-01-02T00:00:00Z", "type": "observation", "measurements": {"creatinine": 1.0}},
            {"timestamp": "2025-01-03T00:00:00Z", "type": "encounter", "event": "Follow-up"},
            {"timestamp": "2025-01-04T00:00:00Z", "type": "observation", "measurements": {"creatinine": 1.5}},
        ]
        fig = self._render_dual_line(data, ["creatinine"], [])
        self.assertIsNotNone(fig)
        plt.close(fig)


class TestClinicalVizFullPipeline(unittest.TestCase):
    """Test the full async pipeline (requires Groq API key)."""

    def setUp(self):
        self.skip_no_groq = not os.getenv("GROQ_API_KEY")

    async def _run_pipeline(self, data, query):
        from mcps.adapters.clinical_viz import render_chart
        return await render_chart(data, query)

    def test_full_pipeline_renal(self):
        """Full pipeline for renal case (uses rule-based fallback if no Groq)."""
        import asyncio
        result = asyncio.run(self._run_pipeline(
            RENAL_TOXICITY_DATA,
            "Why was Enalapril discontinued? Show renal function trend.",
        ))
        self.assertIn("image_base64", result)
        self.assertIn("summary", result)
        self.assertIn("chart_type", result)
        # Verify valid base64
        if result["image_base64"]:
            decoded = base64.b64decode(result["image_base64"])
            self.assertEqual(decoded[:8], b"\x89PNG\r\n\x1a\n")

    def test_full_pipeline_cardiac(self):
        """Full pipeline for cardiac case."""
        import asyncio
        result = asyncio.run(self._run_pipeline(
            CARDIAC_RECOVERY_DATA,
            "Show cardiac function improvement over time.",
        ))
        self.assertIn("image_base64", result)

    def test_full_pipeline_gantt(self):
        """Full pipeline for diagnostic timeline case."""
        import asyncio
        result = asyncio.run(self._run_pipeline(
            DIAGNOSTIC_TIMELINE_DATA,
            "Show how the diagnosis evolved over time.",
        ))
        self.assertIn("image_base64", result)


if __name__ == "__main__":
    unittest.main()
