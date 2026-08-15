"""
Outbound-host allowlist for evaluation runs (see ai/docs/SYSTEM_CARD.md, fix F4).

During an eval every LLM call must go to the one configured inference server;
a silent fallback to another provider (e.g. the MedMCP router's Groq branch)
would invalidate every number. install() patches httpx and requests so any
request to a host outside the allowlist raises EgressViolation.

Callers in the graph catch broad exceptions, so a raised violation could be
swallowed. Each violation is therefore also appended to EVAL_EGRESS_LOG; the
eval runner checks that file after every item and aborts the run if it is
non-empty.

Enabled when EVAL_MODE=1. Allowed hosts come from EVAL_EGRESS_ALLOWLIST
(comma-separated hostnames). This module has no project imports so it can be
copied into the MCP server image as a top-level module.
"""
import json
import logging
import os
import time
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)

LANGSMITH_HOSTS = ("api.smith.langchain.com", "eu.api.smith.langchain.com")

_installed = False
_allowed: set = set()


class EgressViolation(RuntimeError):
    pass


def _truthy(value: str) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


def allowed_hosts() -> set:
    hosts = {h.strip().lower() for h in os.getenv("EVAL_EGRESS_ALLOWLIST", "").split(",") if h.strip()}
    if _truthy(os.getenv("LANGSMITH_TRACING", "")):
        hosts.update(LANGSMITH_HOSTS)
    return hosts


def _record(host: str, url: str) -> None:
    path = os.getenv("EVAL_EGRESS_LOG")
    if not path:
        return
    try:
        with open(path, "a") as f:
            f.write(json.dumps({"ts": time.time(), "pid": os.getpid(), "host": host, "url": url}) + "\n")
    except OSError as e:
        logger.error(f"egress guard: could not write violation log {path}: {e}")


def check_url(url: str) -> None:
    host = (urlsplit(str(url)).hostname or "").lower()
    if host in _allowed:
        return
    _record(host, str(url))
    logger.error(f"egress guard: blocked request to {host!r} ({url})")
    raise EgressViolation(f"Outbound request to {host!r} is not allowed during evaluation")


def install() -> bool:
    """Patch httpx and requests. Returns True if the guard is active."""
    global _installed, _allowed
    if _installed:
        return True
    if not _truthy(os.getenv("EVAL_MODE", "")):
        return False
    _allowed = allowed_hosts()
    if not _allowed:
        raise RuntimeError("EVAL_MODE=1 requires EVAL_EGRESS_ALLOWLIST")

    import httpx

    orig_send = httpx.Client.send
    orig_async_send = httpx.AsyncClient.send

    def send(self, request, *args, **kwargs):
        check_url(request.url)
        return orig_send(self, request, *args, **kwargs)

    async def async_send(self, request, *args, **kwargs):
        check_url(request.url)
        return await orig_async_send(self, request, *args, **kwargs)

    httpx.Client.send = send
    httpx.AsyncClient.send = async_send

    try:
        import requests

        orig_req_send = requests.Session.send

        def req_send(self, request, *args, **kwargs):
            check_url(request.url)
            return orig_req_send(self, request, *args, **kwargs)

        requests.Session.send = req_send
    except ImportError:
        pass

    _installed = True
    logger.info(f"egress guard active; allowed hosts: {sorted(_allowed)}")
    return True
