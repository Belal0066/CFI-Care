# ADR-012: MCP Host/Client/Server protocol adoption, REST kept as an explicit fallback adapter

## Status
Accepted (implemented, `ai-code-updates` branch) — contemporaneous rationale.

## Context
A real MCP server already existed (`mcps/main.py`, FastMCP, SSE-mounted, registering `get_medical_data` and `render_clinical_viz` as `@mcp.tool()`s) and a real MCP client class already existed (`MCPToolManager`, `src/agent/mcp_client.py:15`, using the official `mcp` Python SDK's `ClientSession`/`sse_client`) — but the agent invoked both tools via a raw `httpx` POST to the server's REST wrapper endpoints (`/mcp/query`, `/mcp/viz/render`), bypassing the MCP protocol entirely. `MCPToolManager` itself was also broken at the time (it referenced `config.mcp_server_url`, which didn't exist on `InfraConfig` — an `AttributeError` waiting to happen the moment anything imported it, which `scripts/test_mcp_gui.py` already did).

## Constraints
- Whatever replaces the REST call has to keep working for both existing tools (`get_medical_data` and `render_clinical_viz`), called from two different places in the graph (`query_mcp` and `generate_visualization`).
- The exact response-serialization behavior of the deployed FastMCP/`mcp` SDK versions (unpinned in `mcps/requirements.txt` at the time) couldn't be verified against a live server in this session's environment — any new parsing logic has to fail safely if that assumption turns out wrong, not silently corrupt results.
- The graph is invoked both synchronously (`app.invoke()`, from the Streamlit UI paths) and asynchronously (`app.ainvoke()`, from `/chat`) — a fix has to work under both without assuming which one is in effect.

## Options

### Option A — Keep the REST bypass (status quo)
Cheap to leave alone, but means a real, already-built MCP server sits unused as MCP — the protocol boundary exists in name only. Also does nothing to fix `MCPToolManager`'s broken config reference.

### Option B — Switch fully to the protocol client, remove the REST path entirely
Rejected: the result-parsing logic's key assumption (that FastMCP serializes a Pydantic-typed tool return as JSON text in a `TextContent` block) was verified by reading the installed `mcp`/`fastmcp` source, not by a live round-trip against the actual running server — removing the working REST path before that assumption is confirmed live would mean no way back if it's wrong.

### Option C — Protocol client as the default, REST kept as an explicit, flagged fallback (chosen)
`_call_mcp_endpoint` (`nodes.py`) checks `os.getenv("MCP_TRANSPORT", "mcp") == "rest"` (`nodes.py:305`) and routes to `_call_mcp_endpoint_protocol` (`nodes.py:310`) by default, or `_call_mcp_endpoint_rest` (the original REST call, kept unchanged) if the operator explicitly opts back. The same pattern applies to visualization (`_render_chart_protocol`, `nodes.py:368`, vs. `_render_chart_rest`, `nodes.py:378`).

## Decision
Option C.

## Why
The point of standing up an MCP server is for something to actually speak MCP to it — Option A leaves that unrealized. But the parsing logic's correctness rests on an assumption this session could verify against source code, not against a live server, so removing the rollback path (Option B) before that's been confirmed in a real deployment would be overconfident given what was actually checked.

## Edge Cases Handled
- **Malformed/unparseable tool result content**: `_parse_mcp_tool_result` (`nodes.py:341`) raises `ValueError` if it can't find parseable JSON in any content block — caught by the surrounding retry loop (see Optimizations), not silently swallowed into a corrupted result.
- **Sync-vs-async graph invocation**: `_run_async_from_sync` (`nodes.py:268`) checks whether the calling thread already has a running event loop; if so, it runs the coroutine in a separate thread via `asyncio.run`, rather than assuming LangGraph isolates sync nodes into a worker thread under `ainvoke()` — an assumption this session could not directly verify, so it was designed around instead of relied upon.
- **`MCPToolManager`'s previously-broken config reference**: fixed by adding `mcp_server_url` (`src/shared/config.py:44`, default `http://localhost:8002/mcp/sse`) rather than deleting the class — it's real, working MCP-SSE client code (using the actual `mcp` SDK), not dead weight, and `scripts/test_mcp_gui.py` already depends on it.
- **Undeclared dependency**: `mcp` was imported by `mcp_client.py` but never listed in `requirements.txt` — a clean install could not have satisfied this import; added (`requirements.txt:36`, `mcp>=1.0.0`).

## Optimizations
- Added bounded retry+backoff (`MCP_MAX_RETRIES = 2`, `nodes.py:264`) on the query path, which previously had zero retries at all — a real asymmetry against DOC2FHIR's adapters, which already classified errors and retried before this fix.
- Reused the exact prompted-JSON/content-block parsing pattern already established elsewhere in this codebase rather than inventing a new response contract.

## Consequences

### Positive
- The system can now accurately be described as calling MedMCP/VizMCP through the real MCP protocol by default — a claim that was false before this change, regardless of how the server itself was described.
- A genuine rollback exists (`MCP_TRANSPORT=rest`) if the protocol path misbehaves against a real deployment, rather than an irreversible switch.

### Negative
- The result-parsing logic's correctness is still unconfirmed against a live server — this ADR does not claim it's proven, only that it's implemented against a verified reading of the relevant library source and covered by mocked unit tests.
- Two code paths (protocol and REST) now exist for the same two tool calls — real, if small, maintenance surface until the REST path can be retired with confidence.

### New risks
None beyond the parsing-assumption risk already stated — the fallback flag exists specifically to bound that risk, not to introduce a new one.

## Evidence
- `src/agent/mcp_client.py:15,55` — `MCPToolManager`, `call_tool`.
- `src/agent/graph/nodes.py:264,268,305,310,341,368,378` — retry bound, sync/async bridge, transport flag, protocol call sites, result parser, both REST fallbacks.
- `src/shared/config.py:44` — `mcp_server_url` field, fixing the prior `AttributeError`.
- `requirements.txt:36` — `mcp>=1.0.0`.

## Revisit Trigger
Once the protocol path has been exercised against a real running MCP server and its result-parsing confirmed correct in practice, re-evaluate whether `MCP_TRANSPORT=rest` and the REST-path functions are still worth keeping, or can be retired.
