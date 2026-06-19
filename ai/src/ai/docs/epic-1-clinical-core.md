# Engineering Documentation: Clinical Core Infrastructure (Epic 1)

## 1. Executive Summary
Epic 1 establishes the **Twin Engine Architecture**, a hybrid data layer designed for high-fidelity clinical reasoning. By synchronizing a Vector Database (**Qdrant**) with a Graph Database (**FalkorDB**), we enable Large Language Models (LLMs) to perform both semantic retrieval and topological traversal of longitudinal patient records.

## 2. Core Architectural Principles

### 2.1 The "Twin Engine" Rule
No data is permitted to exist in the system unless it is present in both engines:
-   **Vector Engine (Qdrant)**: Stores "Clinical Snapshots" (TOON format) for semantic retrieval.
-   **Graph Engine (FalkorDB)**: Stores the "Clinical Story" (Temporal Relationships) for causal and structural reasoning.
-   **Linkage**: Strictly enforced via a shared **UUID** (Extracted from FHIR resource IDs).

### 2.2 TOON (Token-Oriented Object Notation)
To maximize LLM context window efficiency, we use the `python-toon` specification. This reduces token overhead by **30-50%** compared to standard JSON by eliminating redundant punctuation and using tabular formats for uniform clinical data.

### 2.3 2PC-Lite Ingestion
Since Qdrant and FalkorDB do not support distributed transactions, we implemented an application-level **Two-Phase Commit (2PC) Lite**:
1.  **Prepare**: Serialize FHIR resource to TOON and Cypher.
2.  **Phase 1 (Upstream)**: Async write to Qdrant.
3.  **Phase 2 (Downstream)**: Execute Cypher queries in FalkorDB.
4.  **Compensation**: If Phase 2 fails, Phase 1 is rolled back (deleted) to ensure atomicity.

## 3. Component Details

### 3.1 Infrastructure (`docker-compose.yml`)
-   **HAPI FHIR**: Source of truth, R4 compliant.
-   **PostgreSQL**: Persistence layer for HAPI.
-   **Qdrant**: Vector storage (768-dim embeddings).
-   **FalkorDB**: Graph storage (Redis-compatible Cypher engine).

### 3.2 Data Processing Pipeline
-   **Normalization ([src/ingestion/toon.py](../src/ingestion/toon.py))**: Extracts semantic meaning into token-efficient strings.
-   **Graph Mapping ([src/ingestion/graph.py](../src/ingestion/graph.py))**: Maps FHIR resources to a temporal schema:
    `(:Patient)-[:HAS_ENCOUNTER]->(:Encounter)-[:OBSERVED]->(:Observation)`

### 3.3 Integrity & Monitoring
-   **Sync Check ([scripts/sync_check.py](../scripts/sync_check.py))**: A high-performance auditor that identifies "orphaned" records where the Twin Engine rule is violated.

## 4. Security & Compliance (HIPAA)
-   **Traceability**: All ingestion events are logged with metadata.
-   **Auditability**: Every graph node and vector payload contains the original FHIR reference.
-   **Data Gravity**: Data is stored in persistent volumes with strict isolation between services.

## 5. Operations & Verification

### Initializing the Stack
```bash
# Start Docker services
docker-compose up -d

# Initialize Graph Indices
python3 scripts/setup_graph_schema.py
```

### Verification Suite
-   `scripts/verify_infra.py`: Confirms services are healthy.
-   `scripts/test_toon.py`: Validates token-efficiency of snapshots.
-   `scripts/test_ingestion.py`: Executes an E2E 2PC ingestion flow.
-   `scripts/sync_check.py`: Final validation of Twin Engine consistency.

## 6. Technical Specifications Reference
-   [Ticket 1.1: Infra Spec](specs/Ticket-1.1-Infra-Spec.md)
-   [Ticket 1.2 & 1.3: Data/Graph Spec](specs/Ticket-1.2-1.3-Data-Graph-Spec.md)
-   [Ticket 1.4: Ingestion Spec](specs/Ticket-1.4-Ingestion-Spec.md)
