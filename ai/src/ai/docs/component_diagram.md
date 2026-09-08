# Clinical AI System — Component Diagram

> **Purpose:** High-level component diagram showing deployment boundaries, containers, and connections. Updated with dual LLM backend support (local 4B + Lightning AI 27B).

---

## Deployment Architecture

> A condensed version of this diagram, with LangGraph routing/audit-loop detail added, is adapted into [ai/README.md](../../../README.md)'s Clinical AI System section — this file remains the full deployment/config reference.

```mermaid
graph TB
    subgraph BWS["BWS Cloud GPU (System Host)"]
        style BWS fill:#1a1a2e,color:#fff,stroke:#16213e

        subgraph UI["Frontend Layer"]
            style UI fill:#0f3460,color:#fff
            DASH["Streamlit dashboard.py<br/>port 8511"]
            SRAG["Streamlit streamlit_rag_app.py<br/>port 8501"]
        end

        subgraph API["API Layer"]
            style API fill:#16213e,color:#fff
            FB["FastAPI Backend<br/>port 8001<br/>/chat /health /ingest"]
        end

        subgraph MCPServer["Medical MCP Server — port 8002"]
            style MCPServer fill:#16213e,color:#fff
            MEDMCP["get_medical_data (MedMCP)<br/>circuit breaker per external source"]
            VIZMCP["render_clinical_viz (VizMCP)"]
        end

        subgraph Python["In-Process Python API"]
            style Python fill:#1a1a4e,color:#fff
            AG["Agentic Graph<br/>src/agent/graph/workflow.py<br/>LangGraph — mode=auto only"]
            DP["Deterministic Pipeline<br/>ClinicalReasoner<br/>Tickets 4-10"]
        end

        subgraph Storage["Storage Layer"]
            style Storage fill:#0d1b3e,color:#fff
            QD[("Qdrant Vector DB<br/>port 6333<br/>Hybrid dense+sparse")]
            RD[("Redis Cloud<br/>port 19534<br/>Patient FHIR data")]
        end

        subgraph LocalLLM["Optional: Local LLM Backend"]
            style LocalLLM fill:#2d1a3e,color:#fff,stroke:#4a1a6e
            LOC["llama.cpp / MedGemma 4B<br/>port 8000<br/>Local GPU inference"]
        end

        DASH -->|"in-process invoke"| AG
        DASH -->|"in-process"| DP
        SRAG -->|"HTTP SSE"| FB
        FB -->|"gRPC/HTTP"| QD
        FB -->|"Redis protocol"| RD
        AG -->|"MCP protocol (SSE), retry+backoff<br/>REST fallback: MCP_TRANSPORT=rest"| MEDMCP
        AG -->|"MCP protocol (SSE)<br/>REST fallback"| VIZMCP
        FB -.->|"direct REST — mode=mcp requests<br/>bypass the agent graph, NOT migrated<br/>to the protocol client"| MEDMCP
        FB -.->|"direct REST — same caveat"| VIZMCP
        AG -->|"HTTP POST /v1/chat/completions"| LOC
        FB -->|"HTTP POST /v1/chat/completions"| LOC
        DP -.->|"optional Qdrant"| QD
    end

    subgraph LAI["Lightning AI Instance (GPU Cloud)"]
        style LAI fill:#1a3a1a,color:#fff,stroke:#2d5a2d
        LLM["SGLang / MedGemma 27B<br/>port 8000<br/>128k context<br/>google/medgemma-27b-it"]
    end

    subgraph External["External Internet APIs"]
        style External fill:#3a1a1a,color:#fff,stroke:#5a2d2d
        PM["PubMed E-utilities<br/>esearch + efetch"]
        FD["OpenFDA<br/>drug/label endpoint"]
        GR["Groq API<br/>llama-3.1-8b-instant"]
        RX["RxNorm<br/>drug name normalization"]
        MLP["MedlinePlus<br/>NIH NLM search"]
    end

    %% WAN connection (lightning backend)
    AG -.->|"WAN: HTTP POST /v1/chat/completions<br/>(when LLM_BACKEND=lightning)"| LLM
    FB -.->|"WAN: HTTP POST /v1/chat/completions<br/>(when LLM_BACKEND=lightning)"| LLM

    %% MCP internet connections — PubMed/OpenFDA/MedlinePlus each behind their own circuit breaker (ADR-013)
    MEDMCP -->|"HTTPS, circuit breaker"| PM
    MEDMCP -->|"HTTPS, circuit breaker"| FD
    MEDMCP -->|"HTTPS"| GR
    MEDMCP -->|"HTTPS"| RX
    MEDMCP -->|"HTTPS, circuit breaker"| MLP
```

See [ADR-012](../../../docs/adr/012-mcp-protocol-adoption.md) for the protocol-client migration and [ADR-013](../../../docs/adr/013-per-source-circuit-breakers-medmcp.md) for the circuit breakers — both apply to the Agentic Graph's MCP path only; `FastAPI_Backend.py`'s own direct calls for explicit `mode=mcp` requests were not part of that migration and still use the original REST endpoints.

---

## Backend Selection

```mermaid
graph LR
    subgraph Launch["launch.sh"]
        LOCAL["--local"]
        LIGHT["--lightning"]
    end

    LOCAL -->|"sets LLM_BACKEND=local"| C1["Config: llamacpp_base_url<br/>http://localhost:8000"]
    LIGHT -->|"sets LLM_BACKEND=lightning"| C2["Config: lightning_base_url<br/>https://<studio>-8000.<region>.studios.lightning.ai/v1"]

    C1 --> S1["Services use:<br/>config.active_llm_base_url<br/>config.active_llm_model<br/>config.active_llm_api_key"]
    C2 --> S1
```

---

## Connection Map

| Caller | Callee | Protocol | Port | Backend-Dependent? |
|--------|--------|----------|------|--------------------|
| FastAPI Backend | LLM (local or Lightning) | HTTP POST | 8000 or remote | Yes — URL changes |
| Agent Graph | LLM (local or Lightning) | HTTP POST | 8000 or remote | Yes — URL changes |
| FastAPI Backend | Qdrant | gRPC/HTTP | 6333 | No |
| FastAPI Backend | Redis Cloud | Redis protocol | 19534 | No |
| FastAPI Backend | MedMCP / VizMCP | HTTP POST (REST, not migrated) | 8002 | No |
| Agent Graph | MedMCP / VizMCP | MCP protocol (SSE), retry+backoff; `MCP_TRANSPORT=rest` fallback — [ADR-012](../../../docs/adr/012-mcp-protocol-adoption.md) | 8002 | No |
| MedMCP | PubMed | HTTPS, circuit breaker — [ADR-013](../../../docs/adr/013-per-source-circuit-breakers-medmcp.md) | 443 | No |
| MedMCP | OpenFDA | HTTPS, circuit breaker | 443 | No |
| MedMCP | Groq | HTTPS | 443 | No |
| MedMCP | RxNorm | HTTPS | 443 | No |
| MedMCP | MedlinePlus | HTTPS, circuit breaker | 443 | No |
| dashboard.py | Agent Graph | in-process | — | No |
| dashboard.py | Deterministic Pipeline | in-process | — | No |
| streamlit_rag_app.py | FastAPI Backend | HTTP SSE | 8001 | No |

---

## Routing Logic

```
launch.sh --local
  → LLM_BACKEND=local
  → Start llama.cpp on port 8000
  → FastAPI uses http://localhost:8000/v1
  → Agent Graph uses http://localhost:8000/v1

launch.sh --lightning
  → LLM_BACKEND=lightning
  → Skip local llama.cpp
  → FastAPI uses https://<studio>/v1
  → Agent Graph uses https://<studio>/v1
  → Verify connectivity to Lightning AI health endpoint
```

---

## Key Configuration

| Env Var | Default | Used When |
|---------|---------|-----------|
| `LLM_BACKEND` | `local` | Always — selects active backend |
| `LLAMACPP_BASE_URL` | `http://localhost:8000` | `LLM_BACKEND=local` |
| `LLAMACPP_MODEL` | `medgemma-1.5-4b-it-Q6_K.gguf` | `LLM_BACKEND=local` |
| `LIGHTNING_BASE_URL` | `""` | `LLM_BACKEND=lightning` |
| `LIGHTNING_MODEL_NAME` | `google/medgemma-27b-it` | `LLM_BACKEND=lightning` |
| `LIGHTNING_ACCESS_TOKEN` | `""` | `LLM_BACKEND=lightning` (only if port is Private) |

The `InfraConfig` singleton (`src/shared/config.py`) exposes:
- `config.active_llm_base_url` — resolves to the correct URL
- `config.active_llm_model` — resolves to the correct model name
- `config.active_llm_api_key` — resolves to the correct API key
