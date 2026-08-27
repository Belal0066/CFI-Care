#!/usr/bin/env python3
"""
Preflight for the GPU session: run once after `compose up`, before any
experiment. Fails loudly (exit 1) on anything that would waste GPU time or
invalidate results, and writes the run manifest EVAL.md cites.

Checks: the egress guard is active; SGLang serves the expected model name and
answers one seeded, temperature-0 call; Qdrant has the indexed collection;
the MCP server is up; the embedding models load from the offline cache;
the question set has no unreviewed drafts; no egress violations logged.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import httpx  # noqa: E402

from eval.common import QUESTION_SET, RESULTS_DIR, read_jsonl  # noqa: E402

failures: list[str] = []


def check(name: str, fn):
    try:
        detail = fn()
        print(f"  ok   {name}" + (f": {detail}" if detail else ""))
        return detail
    except Exception as e:
        failures.append(f"{name}: {type(e).__name__}: {e}")
        print(f"  FAIL {name}: {type(e).__name__}: {e}")
        return None


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    from src.shared import egress_guard

    manifest: dict = {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "git_sha": os.getenv("GIT_SHA", "unknown")}
    sglang = os.getenv("LLAMACPP_BASE_URL", "http://sglang:30000").rstrip("/")
    served = os.getenv("LLAMACPP_MODEL", "")
    print("Preflight")

    def guard():
        if not egress_guard.install():
            raise RuntimeError("EVAL_MODE is not 1; the egress guard is off")
        return f"allowlist={sorted(egress_guard.allowed_hosts())}"
    check("egress guard", guard)

    def models():
        data = httpx.get(f"{sglang}/v1/models", timeout=10).json()
        ids = [m["id"] for m in data.get("data", [])]
        if served not in ids:
            raise RuntimeError(f"served models {ids} do not include {served!r}")
        return ids
    manifest["served_models"] = check("sglang serves the configured model", models)

    def server_info():
        info = httpx.get(f"{sglang}/get_server_info", timeout=10).json()
        keep = ("version", "model_path", "served_model_name", "dtype", "context_length", "random_seed",
                "enable_deterministic_inference", "tp_size", "mem_fraction_static")
        return {k: info.get(k) for k in keep if k in info}
    manifest["sglang"] = check("sglang server info", server_info)

    def one_call():
        from openai import OpenAI
        client = OpenAI(base_url=f"{sglang}/v1", api_key="sk-no-key")
        r = client.chat.completions.create(model=served, temperature=0, seed=0, max_tokens=5,
                                           messages=[{"role": "user", "content": "Reply with the word OK."}])
        if r.model != served:
            raise RuntimeError(f"response model {r.model!r} != {served!r}")
        return repr(r.choices[0].message.content)
    check("seeded LLM call", one_call)

    def qdrant():
        from src.shared.db_clients import qdrant_client
        client = qdrant_client.connect()
        info = client.get_collection(qdrant_client.collection_name)
        if not info.points_count:
            raise RuntimeError(f"collection {qdrant_client.collection_name} is empty; restore the eval-v1 snapshot")
        version = httpx.get(f"http://{os.getenv('QDRANT_HOST', 'qdrant')}:{os.getenv('QDRANT_PORT', '6333')}/", timeout=5).json()
        indexed = sorted((info.payload_schema or {}).keys())
        if "patient_id" not in indexed:
            raise RuntimeError("no payload index on patient_id")
        return {"collection": qdrant_client.collection_name, "points": info.points_count,
                "version": version.get("version"), "payload_indexes": indexed}
    manifest["qdrant"] = check("qdrant collection", qdrant)

    def mcp():
        # A real MCP protocol handshake over SSE, the way the agent connects.
        import asyncio
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        url = os.getenv("MCP_SERVER_URL", "http://mcp:8002/mcp/sse")

        async def handshake():
            async with sse_client(url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return sorted(t.name for t in (await session.list_tools()).tools)

        tools = asyncio.run(handshake())
        if "get_medical_data" not in tools:
            raise RuntimeError(f"MCP tools {tools} lack get_medical_data")
        return f"{url} tools={tools}"
    check("mcp protocol handshake", mcp)

    def embeddings():
        from src.ingestion.service import IngestionService
        dense = IngestionService.get_embedding("creatinine trend")
        sparse = IngestionService.get_sparse_embedding("creatinine trend")
        if len(dense) != 768 or not sparse:
            raise RuntimeError("embedding models did not load from the cache")
        return "bge-base-en-v1.5 (768) + SPLADE from offline cache"
    check("embedding models", embeddings)

    def questions():
        items = read_jsonl(QUESTION_SET)
        drafts = [x["id"] for x in items if x.get("status") == "draft"]
        if drafts:
            raise RuntimeError(f"unreviewed Block C drafts: {drafts}")
        return f"{len(items)} items, sha256 {sha256(QUESTION_SET)[:12]}"
    manifest["question_set"] = check("question set reviewed", questions)
    if QUESTION_SET.exists():
        manifest["question_set_sha256"] = sha256(QUESTION_SET)
    configs = Path(__file__).resolve().parents[1] / "configs"
    manifest["configs_sha256"] = {p.name: sha256(p) for p in sorted(configs.glob("*.yaml"))}

    def egress_log():
        path = os.getenv("EVAL_EGRESS_LOG")
        if path and os.path.exists(path) and os.path.getsize(path) > 0:
            raise RuntimeError(f"{path} is not empty; inspect and clear it before running")
        return None
    check("no egress violations", egress_log)

    out = RESULTS_DIR / "manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(manifest, open(out, "w"), indent=1, default=str)
    print(f"Manifest: {out}")
    if failures:
        print(f"PREFLIGHT FAILED ({len(failures)}):\n  - " + "\n  - ".join(failures))
        return 1
    print("PREFLIGHT PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
