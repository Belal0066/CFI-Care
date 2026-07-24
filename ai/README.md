# AI

Two subsystems make up CFI-Care's AI capabilities. They aren't wired together in code today, but the working hypothesis (see [Architecture & Port Map](docs/ARCHITECTURE.md)) is that they're sequential stages of one pipeline: DOC2FHIR turns scanned documents into FHIR data, and the Clinical AI System reasons over that FHIR data. The diagram below shows that hypothesis visually — the dashed edges mark connections that are inferred from configuration, not wired in code.

```mermaid
flowchart LR
    CLIN["Clinician / User"]
    DOC["Scanned Medical Documents"]
    EXT["External Medical Sources<br/>PubMed / OpenFDA / MedlinePlus"]
    NODE["Node.js Downstream<br/>(external consumer)"]
    HAPI[("HAPI FHIR<br/>shared, hypothesized")]

    subgraph AI["ai/ — this repo section"]
        D2F["DOC2FHIR"]
        CAI["Clinical AI System"]
    end

    DOC --> D2F
    D2F --> NODE
    D2F -. optional .-> HAPI
    HAPI -. hypothesized, unwired .-> CAI

    CLIN --> CAI
    CAI --> EXT
```

## Documentation Map

Every doc in `ai/` in one table, organized by what you're trying to do — not by which subsystem happens to own the file.

| I want to... | Read |
|---|---|
| Understand what this does, at all | This file |
| See the whole system's architecture, data flow, and what's actually guaranteed (both subsystems) | [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md) |
| Know what can fail and what actually happens when it does (both subsystems) | [`docs/FAILURE_MODES.md`](docs/FAILURE_MODES.md) |
| Understand why a specific technical decision was made, and what alternatives were rejected | [`docs/adr/`](docs/adr/) |
| See the cross-subsystem port map and how DOC2FHIR/Clinical AI relate | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Clinical AI System** | |
| Run it, see its architecture/status/results | [`src/ai/README.md`](src/ai/README.md) |
| Step-by-step launch instructions | [`src/ai/LAUNCH.md`](src/ai/LAUNCH.md) |
| Full API reference | [`src/ai/API.md`](src/ai/API.md) |
| Navigate its code as a developer — module map, known bugs, test status | [`src/ai/context.md`](src/ai/context.md) |
| Use the dashboard UI | [`src/ai/docs/ui-usage-guide.md`](src/ai/docs/ui-usage-guide.md) |
| Understand the input data format and internal model attributes | [`src/ai/docs/data-reference.md`](src/ai/docs/data-reference.md) |
| See the deployment/connection diagram | [`src/ai/docs/component_diagram.md`](src/ai/docs/component_diagram.md) |
| Use the image/vision capability | [`src/ai/docs/vision-support.md`](src/ai/docs/vision-support.md) |
| **DOC2FHIR** | |
| Run it, see its endpoints/port map/architecture | [`src/DOC2FHIR/README.md`](src/DOC2FHIR/README.md) |
| Integrate with its API — request shapes, error codes, code snippets | [`src/DOC2FHIR/DOC2FHIR_AI_Context.md`](src/DOC2FHIR/DOC2FHIR_AI_Context.md) |
| See the OpenAPI export | [`src/DOC2FHIR/DocOnFHIR_API_Spec.md`](src/DOC2FHIR/DocOnFHIR_API_Spec.md) |
| Run/configure the Mapper (FHIR-generation LLM) | [`src/DOC2FHIR/Mapper/README.md`](src/DOC2FHIR/Mapper/README.md) |

Not indexed above — present but not engineering documentation: `src/ai/docs/thesis/` (thesis write-up materials), `src/ai/docs/myCV.latex` (a contributor's CV).

## DOC2FHIR — Document to FHIR Pipeline

Scanned medical reports (PDF) → OCR → structured extraction → FHIR mapping → delivery. (The default mapping path is LLM-generated, not deterministic — see [`docs/adr/004-fhir-mapping-strategy.md`](docs/adr/004-fhir-mapping-strategy.md).)

The pipeline has two mutually exclusive Mapper paths, selected by `DOC2FHIR_STRUCTURED_PIPELINE_ENABLED` (default off) — shown below. Both GPU-bound stages (OCR, Mapper) share a single concurrency-1 lock.

```mermaid
flowchart TB
    subgraph HOST["DOC2FHIR Host"]
        style HOST fill:#1a1a2e,color:#fff,stroke:#16213e

        CLIENT["Client"]

        subgraph APILayer["API Layer"]
            style APILayer fill:#16213e,color:#fff
            GW["Gateway (FastAPI orchestrator)<br/>port 8001"]
        end

        subgraph GPU["GPU-bound Stages — serialized"]
            style GPU fill:#1a1a4e,color:#fff
            LOCK{{"asyncio.Semaphore(1)<br/>gpu_max_concurrency=1<br/>5s acquire timeout"}}
            OCR["OCR Wrapper<br/>port 7862"]
            VLLM[("vLLM: PaddleOCR-VL-1.5-0.9B<br/>port 8118")]

            subgraph MapperChoice["Mapper — path selected by<br/>DOC2FHIR_STRUCTURED_PIPELINE_ENABLED"]
                style MapperChoice fill:#2d1a3e,color:#fff,stroke:#4a1a6e
                DEFAULT["Default (flag=False):<br/>LLM direct FHIR generation<br/>llama.cpp Gemma-4 GGUF, port 8070<br/>+ regex/structural repair"]
                CLS["DocumentTypeClassifier<br/>(opt-in path)"]
                STRUCTEX["StructuredExtractor (LLM)<br/>intermediate schema, not FHIR"]
                MAP["fhir_mapper.map_to_fhir<br/>deterministic, hardcoded LOINC table"]
                VAL["FhirValidator"]
                CLS --> STRUCTEX --> MAP --> VAL
            end
        end

        subgraph Delivery["Delivery"]
            style Delivery fill:#0d1b3e,color:#fff
            NODEJS[("Node.js downstream<br/>default, downstream_type=nodejs")]
            HAPIOPT[("HAPI FHIR<br/>opt-in, manual push-to-hapi")]
        end
    end

    CLIENT -->|"POST document"| GW
    GW -->|"multipart, 300s, 3 retries"| OCR
    OCR --> VLLM
    OCR -. holds .-> LOCK
    GW -->|"OpenAI chat format, 600s, 2 retries"| DEFAULT
    GW -.->|"opt-in"| CLS
    DEFAULT -. holds .-> LOCK
    DEFAULT --> NODEJS
    VAL --> NODEJS
    GW -.->|"fallback only, manual call"| HAPIOPT
    CLIENT -->|"poll GET /status, /result"| GW
```

- **Start here:** [src/DOC2FHIR/README.md](src/DOC2FHIR/README.md)
- **API contract:** [src/DOC2FHIR/DocOnFHIR_API_Spec.md](src/DOC2FHIR/DocOnFHIR_API_Spec.md)
- **Developer/AI reference:** [src/DOC2FHIR/DOC2FHIR_AI_Context.md](src/DOC2FHIR/DOC2FHIR_AI_Context.md)
- **Mapper component** (llama.cpp + Gemma-4 GGUF, does the structured-to-FHIR reasoning): [src/DOC2FHIR/Mapper/README.md](src/DOC2FHIR/Mapper/README.md)

## Clinical AI System — Agentic RAG Copilot

Deterministic, citation-backed clinical reasoning over longitudinal patient data, built on hybrid (dense + sparse) vector search over Qdrant, routed by a self-correcting LangGraph agent.

Adapted from the deployment diagram in [`src/ai/docs/component_diagram.md`](src/ai/docs/component_diagram.md) with the LangGraph routing/audit logic added and the MCP server's two tools (MedMCP / VizMCP) distinguished — see that doc for the full deployment/config reference.

```mermaid
graph TB
    subgraph BWS["BWS Cloud GPU (System Host)"]
        style BWS fill:#1a1a2e,color:#fff,stroke:#16213e

        subgraph UI["Frontend Layer"]
            style UI fill:#0f3460,color:#fff
            DASH["Streamlit dashboard.py<br/>port 8511"]
        end

        subgraph API["API Layer"]
            style API fill:#16213e,color:#fff
            FB["FastAPI Backend<br/>port 8001<br/>/chat /health /ingest"]
        end

        subgraph Agent["LangGraph Agent — workflow.py"]
            style Agent fill:#1a1a4e,color:#fff
            CLASSIFY["classify<br/>regex IntentClassifier"]
            ROUTE{{"route_intent<br/>viz intent → visualize<br/>is_mcp_query → mcp_search<br/>confidence&lt;0.70 → rag_retrieve<br/>else by intent"}}
            RAG["rag_retrieve<br/>HybridRetriever (Qdrant)"]
            REASON["reason<br/>ClinicalReasoner<br/>deterministic, cited claims"]
            MCPCALL["mcp_search"]
            VIZ["visualize"]
            GEN["generate<br/>LLM phrasing only"]
            AUDIT{{"audit_claims<br/>checks source_node_ids<br/>max 2 retries"}}
            CONF["compute_confidence → END"]

            CLASSIFY --> ROUTE
            ROUTE --> RAG --> REASON --> GEN
            ROUTE --> MCPCALL --> GEN
            ROUTE --> VIZ --> GEN
            REASON -.->|"needs_drug_check"| MCPCALL
            GEN --> AUDIT
            AUDIT -.->|"claim fails, retry ≤2"| GEN
            AUDIT --> CONF
        end

        subgraph Storage["Storage Layer"]
            style Storage fill:#0d1b3e,color:#fff
            QD[("Qdrant<br/>port 6333<br/>dense bge-base + sparse SPLADE, RRF")]
        end

        subgraph MCPServer["Medical MCP Server — mcps/main.py, port 8002"]
            style MCPServer fill:#16213e,color:#fff
            MEDMCP["get_medical_data (MedMCP)<br/>PubMed / OpenFDA / MedlinePlus / RxNav"]
            VIZMCP["render_clinical_viz (VizMCP)<br/>Groq normalize + matplotlib/seaborn"]
        end

        subgraph LocalLLM["Local LLM Backend"]
            style LocalLLM fill:#2d1a3e,color:#fff,stroke:#4a1a6e
            LOC["llama.cpp / MedGemma 4B (Q6_K)<br/>port 8000"]
        end

        DASH -->|"in-process invoke"| CLASSIFY
        FB -->|"/chat request"| CLASSIFY
        RAG --> QD
        MCPCALL -->|"HTTP POST"| MEDMCP
        VIZ -->|"HTTP POST"| VIZMCP
        GEN -->|"HTTP POST /v1/chat/completions"| LOC
    end

    subgraph LAI["Lightning AI (GPU Cloud)"]
        style LAI fill:#1a3a1a,color:#fff,stroke:#2d5a2d
        LLM["SGLang / MedGemma 27B<br/>128k context"]
    end

    GEN -.->|"WAN, when llm_backend=lightning"| LLM
```

Known gaps: the agentic `/chat` path doesn't thread `patient_id` through retrieval, and MCP calls have no retry logic (unlike DOC2FHIR's adapters) — see [`src/ai/context.md`](src/ai/context.md).

- **Start here:** [src/ai/README.md](src/ai/README.md)
- **Launch guide:** [src/ai/LAUNCH.md](src/ai/LAUNCH.md)
- **API reference:** [src/ai/API.md](src/ai/API.md)
- **Codebase context index** (module map, known bugs, file:line references — written for devs/LLMs navigating the code): [src/ai/context.md](src/ai/context.md)
- **Further docs:** [src/ai/docs/](src/ai/docs/) — UI usage, data format reference, deployment diagram, vision support (see the Documentation Map above for which is which)

## Architecture & Port Map

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the two subsystems above relate (flagged there as an inferred hypothesis, not confirmed by either subsystem's owners), the combined port map across both, and two known port collisions if both stacks run on the same host.

The two real collisions — `:8001` and `:8002` — only occur if both stacks run on the same host, which nothing currently prevents. Full port table in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```mermaid
flowchart LR
    subgraph D2F["DOC2FHIR ports"]
        style D2F fill:#16213e,color:#fff
        D_GW["Gateway :8001"]
        D_MOCK["Mock/offline server :8002"]
        D_OCR["OCR wrapper :7862"]
        D_VLLM["vLLM PaddleOCR-VL :8118"]
        D_MAP["Mapper llama.cpp :8070"]
        D_UI["Pipeline UI :8502"]
    end

    subgraph CAI["Clinical AI System ports"]
        style CAI fill:#0f3460,color:#fff
        C_FB["FastAPI Backend :8001"]
        C_MCP["MCP Server :8002"]
        C_QD["Qdrant :6333/6334"]
        C_LLM["llama.cpp MedGemma 4B :8000"]
        C_DASH["Dashboard :8511"]
    end

    subgraph Shared["Shared / Hypothesized"]
        style Shared fill:#0d1b3e,color:#fff
        HAPI[("HAPI FHIR :8080")]
    end

    D_GW -.->|"COLLISION if co-hosted"| C_FB
    D_MOCK -.->|"COLLISION if co-hosted"| C_MCP
    D_GW -. optional push .-> HAPI
    HAPI -. hypothesized .-> C_FB

    style D_GW stroke:#ff4444,stroke-width:2px
    style C_FB stroke:#ff4444,stroke-width:2px
    style D_MOCK stroke:#ff4444,stroke-width:2px
    style C_MCP stroke:#ff4444,stroke-width:2px
```

## Testing

- **DOC2FHIR:** acceptance, integration, and quality-evaluation suites under [tests/](tests/), run via [tests/run_all_tests.sh](tests/run_all_tests.sh)
- **Clinical AI System:** `PYTHONPATH=$PWD python3 scripts/validate_system.py` from within `src/ai/` (23 tests; see [src/ai/README.md](src/ai/README.md#validation-results))
