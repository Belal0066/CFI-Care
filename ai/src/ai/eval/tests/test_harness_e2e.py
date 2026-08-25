"""
End-to-end harness test without models: eval.run drives the real LangGraph
graph under EVAL_MODE=1 against a stub OpenAI-compatible server on
localhost, with the retriever faked in-process. Checks the JSONL rows, the
per-call model accounting, resumability, and the wrong-model abort.
Runs in a subprocess because the egress guard patches httpx process-wide.
"""
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[2]

SCRIPT = r'''
import json, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, ".")

RETURN_MODEL = sys.argv[1]

class Stub(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        out = {"id": "x", "object": "chat.completion", "created": 0, "model": RETURN_MODEL,
               "choices": [{"index": 0, "finish_reason": "stop", "logprobs": None,
                            "message": {"role": "assistant", "content": "Potassium was 4.4 mEq/L."}}],
               "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}}
        data = json.dumps(out).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

server = HTTPServer(("127.0.0.1", 0), Stub)
threading.Thread(target=server.serve_forever, daemon=True).start()
import os
os.environ["LLAMACPP_BASE_URL"] = f"http://127.0.0.1:{server.server_port}"

from src.shared.models import EncounterGroup, RetrievedContext
from src.retrieval import service

def fake_topk(self, patient_id, query, k=None, intent=None, use_intent_filter=True, mode="hybrid"):
    return [EncounterGroup(encounter_id="obs-1", score=0.83, chunks=[RetrievedContext(
        anchor_id="obs-1", anchor_content="resourceType: Observation\ncode: Potassium\nvalue: 4.4 mEq/L",
        score=0.03, parent_node_id="obs-1", dense_cosine=0.83)])]
service.HybridRetriever.search_topk_resources = fake_topk

from eval import run
sys.argv = ["run", "--config", "eval/configs/full.yaml", "--experiment", "e2e", "--questions", sys.argv[2],
            "--out-dir", sys.argv[3], "--concurrency", "2"]
sys.exit(run.main())
'''


def _questions(tmp_path: Path) -> Path:
    items = [
        {"id": "b002", "block": "B", "patient_id": "p1", "question": "What was the patient's most recent potassium value?",
         "expected_answer": "4.4", "gold_resource_ids": ["Observation/obs-1"], "answerable": True},
        {"id": "b003", "block": "B", "patient_id": "p1", "question": "Tell me the last potassium result on file.",
         "expected_answer": "4.4", "gold_resource_ids": ["Observation/obs-1"], "answerable": True},
    ]
    path = tmp_path / "q.jsonl"
    path.write_text("\n".join(json.dumps(x) for x in items) + "\n")
    return path


def _run(tmp_path: Path, return_model: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("EVAL_", "MCP_", "LLAMACPP", "LANGSMITH", "PHOENIX"))}
    env.update({
        "EVAL_MODE": "1", "EVAL_EGRESS_ALLOWLIST": "127.0.0.1",
        "EVAL_EGRESS_LOG": str(tmp_path / "egress.jsonl"),
        "LLM_BACKEND": "local", "LLAMACPP_MODEL": "medgemma-27b",
    })
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent(SCRIPT), return_model, str(_questions(tmp_path)), str(tmp_path / "runs")],
        cwd=AI_ROOT, env=env, capture_output=True, text=True, timeout=300,
    )


def test_harness_runs_graph_and_records_calls(tmp_path):
    res = _run(tmp_path, "medgemma-27b")
    assert res.returncode == 0, res.stdout + res.stderr
    rows = [json.loads(l) for l in (tmp_path / "runs" / "e2e__full.jsonl").read_text().splitlines()]
    assert {r["id"] for r in rows} == {"b002", "b003"}
    for r in rows:
        assert not r.get("error"), r.get("traceback")
        assert r["context_resource_ids"] == ["obs-1"]
        assert r["path"][0] == "classify" and "rag_retrieve" in r["path"] and "generate" in r["path"]
        assert r["llm_calls"] and all(c["model_returned"] == "medgemma-27b" for c in r["llm_calls"])
        assert r["answer"] == "Potassium was 4.4 mEq/L."   # confidence block stripped
        assert "Confidence Assessment" in r["answer_raw"]
    assert not (tmp_path / "egress.jsonl").exists()

    again = _run(tmp_path, "medgemma-27b")   # resumable: nothing left to do
    assert "0 to run (2 already done)" in again.stdout, again.stdout + again.stderr


def test_harness_aborts_when_another_model_answers(tmp_path):
    res = _run(tmp_path, "some-other-model")
    assert res.returncode == 3, res.stdout + res.stderr
    assert "RUN INVALID" in res.stdout and "some-other-model" in res.stdout
