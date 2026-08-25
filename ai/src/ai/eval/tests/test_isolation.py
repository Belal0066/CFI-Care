"""
F4 (egress guard, Groq ban) and the MCP record/replay cache. Each case runs
in a subprocess because both install process-wide httpx patches.
"""
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[2]


def run(code: str, env: dict, cwd: Path = AI_ROOT) -> subprocess.CompletedProcess:
    full_env = {k: v for k, v in os.environ.items() if not k.startswith(("EVAL_", "MCP_", "LLAMACPP", "LANGSMITH"))}
    full_env.update(env)
    return subprocess.run([sys.executable, "-c", textwrap.dedent(code)], cwd=cwd, env=full_env,
                          capture_output=True, text=True, timeout=120)


def test_egress_guard_blocks_unlisted_hosts_and_logs(tmp_path):
    log = tmp_path / "egress.jsonl"
    code = """
        import httpx, sys
        sys.path.insert(0, ".")
        from src.shared import egress_guard
        assert egress_guard.install()
        ok = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200)))
        assert ok.get("http://sglang:30000/v1/models").status_code == 200
        try:
            ok.get("https://api.groq.com/openai/v1/chat/completions")
        except egress_guard.EgressViolation:
            print("BLOCKED")
    """
    res = run(code, {"EVAL_MODE": "1", "EVAL_EGRESS_ALLOWLIST": "sglang,qdrant", "EVAL_EGRESS_LOG": str(log)})
    assert "BLOCKED" in res.stdout, res.stderr
    entries = [json.loads(l) for l in log.read_text().splitlines()]
    assert entries and entries[0]["host"] == "api.groq.com"


def test_egress_guard_off_outside_eval_mode():
    code = """
        import sys; sys.path.insert(0, ".")
        from src.shared import egress_guard
        print("ACTIVE" if egress_guard.install() else "OFF")
    """
    assert "OFF" in run(code, {}).stdout


def test_langsmith_host_only_allowed_when_tracing_on():
    code = """
        import sys; sys.path.insert(0, ".")
        from src.shared import egress_guard
        print(sorted(egress_guard.allowed_hosts()))
    """
    off = run(code, {"EVAL_EGRESS_ALLOWLIST": "sglang"}).stdout
    on = run(code, {"EVAL_EGRESS_ALLOWLIST": "sglang", "LANGSMITH_TRACING": "true"}).stdout
    assert "api.smith.langchain.com" not in off
    assert "api.smith.langchain.com" in on


def test_mcp_router_refuses_groq_in_eval_mode():
    code = """
        import sys; sys.path.insert(0, ".")
        try:
            import router
        except RuntimeError as e:
            print("REFUSED", e)
    """
    res = run(code, {"EVAL_MODE": "1"}, cwd=AI_ROOT / "mcps")
    assert "REFUSED" in res.stdout, res.stdout + res.stderr


def test_mcp_router_uses_configured_endpoint_in_eval_mode():
    code = """
        import sys; sys.path.insert(0, ".")
        import router
        print(type(router.llm).__name__, router.llm.openai_api_base, router.llm.temperature)
    """
    res = run(code, {"EVAL_MODE": "1", "LLAMACPP_API_BASE": "http://sglang:30000/v1",
                     "MODEL_NAME": "medgemma-27b", "MCP_LLM_TEMPERATURE": "0", "MCP_LLM_SEED": "0"},
              cwd=AI_ROOT / "mcps")
    assert "ChatOpenAI http://sglang:30000/v1 0.0" in res.stdout, res.stderr


def test_http_cache_record_replay_strict(tmp_path):
    code = """
        import asyncio, httpx, sys
        sys.path.insert(0, ".")
        calls = []
        def handler(request):
            calls.append(str(request.url))
            return httpx.Response(200, json={"n": len(calls)})
        import http_cache
        assert http_cache.install()
        async def main():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
                r1 = await c.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                                 params={"term": "x", "api_key": "SECRET"})
                r2 = await c.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                                 params={"term": "x"})
                print("FIRST", r1.json()["n"], "SECOND", r2.json()["n"], "LIVE", len(calls))
        asyncio.run(main())
    """
    cache = tmp_path / "cache"
    res = run(code, {"MCP_HTTP_CACHE_DIR": str(cache), "MCP_HTTP_CACHE_MODE": "replay"}, cwd=AI_ROOT / "mcps")
    # The second call (same query without the key) is served from the cache.
    assert "FIRST 1 SECOND 1 LIVE 1" in res.stdout, res.stdout + res.stderr
    stored = next(cache.rglob("*.json")).read_text()
    assert "SECRET" not in stored

    strict = """
        import asyncio, httpx, sys
        sys.path.insert(0, ".")
        import http_cache
        http_cache.install()
        async def main():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))) as c:
                try:
                    await c.get("https://api.fda.gov/drug/label.json", params={"search": "new"})
                except http_cache.CacheMiss:
                    print("MISS")
        asyncio.run(main())
    """
    res = run(strict, {"MCP_HTTP_CACHE_DIR": str(cache), "MCP_HTTP_CACHE_MODE": "strict"}, cwd=AI_ROOT / "mcps")
    assert "MISS" in res.stdout, res.stdout + res.stderr
