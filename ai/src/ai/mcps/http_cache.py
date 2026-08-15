"""
Record/replay cache for the MedMCP adapters' external HTTP calls.

Live PubMed, OpenFDA and RxNav responses change over time and are
rate-limited, so evaluation runs record each response once and replay it on
every rerun and ablation. Only the raw HTTP data is cached; the router's own
LLM steps (classification, summaries) still run against the model under test.

Configured by environment:
  MCP_HTTP_CACHE_DIR   directory for cached responses (unset = cache off)
  MCP_HTTP_CACHE_MODE  record  - always call live, store every response
                       replay  - serve from cache; on a miss call live,
                                 store it, and log the miss (default)
                       strict  - serve from cache; a miss raises
Cache keys are method + URL with credential parameters (api_key) removed, so
recordings made with and without API keys are interchangeable.
"""
import base64
import hashlib
import json
import logging
import os
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

logger = logging.getLogger(__name__)

CACHED_HOSTS = {"eutils.ncbi.nlm.nih.gov", "api.fda.gov", "rxnav.nlm.nih.gov"}
_SECRET_PARAMS = {"api_key"}

_installed = False


class CacheMiss(RuntimeError):
    pass


def cache_key(method: str, url: str) -> str:
    parts = urlsplit(str(url))
    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in _SECRET_PARAMS)
    normalized = urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, urlencode(query), ""))
    return hashlib.sha256(f"{method.upper()} {normalized}".encode()).hexdigest()


def _path(cache_dir: str, key: str) -> str:
    return os.path.join(cache_dir, key[:2], f"{key}.json")


def _load(cache_dir: str, key: str):
    path = _path(cache_dir, key)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _store(cache_dir: str, key: str, method: str, url: str, response) -> None:
    path = _path(cache_dir, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    parts = urlsplit(str(url))
    safe_query = [(k, v) for k, v in parse_qsl(parts.query) if k not in _SECRET_PARAMS]
    record = {
        "method": method.upper(),
        "url": urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(safe_query), "")),
        "status_code": response.status_code,
        "content_type": response.headers.get("content-type", ""),
        "content_b64": base64.b64encode(response.content).decode(),
        "recorded_at": time.time(),
    }
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(record, f)
    os.replace(tmp, path)


def _log_miss(cache_dir: str, method: str, url: str) -> None:
    with open(os.path.join(cache_dir, "misses.jsonl"), "a") as f:
        f.write(json.dumps({"ts": time.time(), "method": method, "url": cache_key(method, url)}) + "\n")


def install() -> bool:
    global _installed
    cache_dir = os.getenv("MCP_HTTP_CACHE_DIR")
    if _installed or not cache_dir:
        return _installed
    mode = os.getenv("MCP_HTTP_CACHE_MODE", "replay").strip().lower()
    if mode not in ("record", "replay", "strict"):
        raise ValueError(f"MCP_HTTP_CACHE_MODE must be record, replay or strict, not {mode!r}")
    os.makedirs(cache_dir, exist_ok=True)

    import httpx

    orig_send = httpx.AsyncClient.send

    async def send(self, request, *args, **kwargs):
        host = (request.url.host or "").lower()
        if host not in CACHED_HOSTS:
            return await orig_send(self, request, *args, **kwargs)
        key = cache_key(request.method, str(request.url))
        if mode != "record":
            hit = _load(cache_dir, key)
            if hit is not None:
                return httpx.Response(
                    status_code=hit["status_code"],
                    headers={"content-type": hit["content_type"]} if hit["content_type"] else None,
                    content=base64.b64decode(hit["content_b64"]),
                    request=request,
                )
            if mode == "strict":
                raise CacheMiss(f"No cached response for {request.method} {host}{request.url.path}")
            _log_miss(cache_dir, request.method, str(request.url))
        response = await orig_send(self, request, *args, **kwargs)
        await response.aread()
        if response.status_code < 500:
            _store(cache_dir, key, request.method, str(request.url), response)
        return response

    httpx.AsyncClient.send = send
    _installed = True
    logger.info(f"MCP HTTP cache active: mode={mode}, dir={cache_dir}")
    return True
