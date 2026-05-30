"""Simple mock server for DocOnFHIR API testing.

Serves static JSON responses at the real API paths,
so teammates can develop against realistic data without
running the full OCR + Mapper + FHIR pipeline.

Usage:
    python mock/scripts/serve_mock.py

Then point clients to http://localhost:8001
"""

import json
import time
import os
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

MOCK_DIR = Path(__file__).resolve().parent.parent / "responses"


class MockHandler(BaseHTTPRequestHandler):
    server_version = "DocOnFHIR-Mock/1.0"

    def do_POST(self):
        if self.path == "/v1/documents/upload":
            self._serve_file("upload_202.json", 202)

    def do_GET(self):
        # /v1/documents/{job_id}/status
        if "/status" in self.path:
            self._serve_status()
        # /v1/documents/{job_id}/result
        elif "/result" in self.path:
            self._serve_file("result_completed.json", 200)
        elif self.path == "/v1/health":
            self._serve_health()
        else:
            self._serve_404()

    def _serve_status(self):
        # Simulate a short delay then return completed
        # (mimics a job that has already finished)
        self._serve_file("status_completed.json", 200)

    def _serve_health(self):
        body = {
            "status": "ok",
            "service": "DocOnFHIR Mock Server",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "dependencies": {
                "mock": {"ok": True}
            }
        }
        self._send_json(body, 200)

    def _serve_file(self, filename: str, status: int):
        filepath = MOCK_DIR / filename
        if not filepath.exists():
            self._serve_404()
            return
        with open(filepath) as f:
            data = json.load(f)
        self._send_json(data, status)

    def _serve_404(self):
        body = {
            "code": "job_not_found",
            "message": "Job not found (mock server has limited endpoints)",
            "details": {"path": self.path},
            "request_id": None,
        }
        self._send_json(body, 404)

    def _send_json(self, data: dict, status: int):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))

    def log_message(self, format, *args):
        print(f"[MOCK] {self.address_string()} - {args[0]} {args[1]} {args[2]}")


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_PORT", 8001))
    server = HTTPServer(("0.0.0.0", port), MockHandler)
    print(f"DocOnFHIR Mock Server running on http://0.0.0.0:{port}")
    print("Endpoints:")
    print(f"  POST /v1/documents/upload")
    print(f"  GET  /v1/documents/{'{job_id}'}/status")
    print(f"  GET  /v1/documents/{'{job_id}'}/result")
    print(f"  GET  /v1/health")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
