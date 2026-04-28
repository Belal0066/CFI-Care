# Ticket 1.4: 2PC Lite Ingestion Service Spec

## 1. Overview
This module (`src/ingestion/service.py`) orchestrates the "Twin Engine" write path. It ensures that for every clinical entity, we have:
1.  **Vector Context** in Qdrant (TOON Normalized).
2.  **Graph Topology** in FalkorDB (Cypher Mapped).
3.  **Atomic Consistency**: Both must exist with the same UUID, or the transaction fails safe.

## 2. The "2PC Lite" Protocol
Since we are using heterogeneous databases (Vector + Graph) without a distributed transaction manager, we implement an application-level saga:

### Phase 1: Prepare & Vector Write
1.  **Normalization**: Convert FHIR Resource -> TOON String.
2.  **Mapping**: Convert FHIR Resource -> Cypher Queries.
3.  **Step A (Upstream)**: Upsert to Qdrant.
    *   *Failure*: Abort. No side effects.
    *   *Success*: Proceed to Step B.

### Phase 2: Graph Write & Commit
4.  **Step B (Downstream)**: Execute Cypher in FalkorDB.
    *   *Success*: Transaction Complete.
    *   *Failure*: **Compensating Action** -> Delete vector from Qdrant.
5.  **Edge Case (Crash after Step A, before Step B)**:
    *   The record exists in Vector but not Graph ("Orphan").
    *   *Resolution*: The `sync_check.py` script identifies these orphans for manual replay or cleanup.

## 3. Implementation Details

### 3.1 `IngestionService`
-   **Input**: `fhir.resources` object.
-   **Process**:
    ```python
    try:
        # 1. Normalized
        toon = ToonNormalizer.normalize(resource)
        # 2. Map
        cypher = GraphMapper.map(resource)
        
        # 3. Vector Write
        qdrant.upsert(id=resource.id, payload=toon)
        
        # 4. Graph Write
        falkordb.execute(cypher)
        
    except GraphError:
        # Rollback Vector
        qdrant.delete(id=resource.id)
        raise IngestionFailed
    ```

### 3.2 Sync Check Script
-   **Logic**:
    1.  Get all IDs from Qdrant (`scroll` API).
    2.  Get all IDs from FalkorDB (`MATCH (n) RETURN n.id`).
    3.  Compare sets.
    4.  Report `Vector - Graph` (Orphans) and `Graph - Vector` (Missing Context).

## 4. Dependencies
-   `src/ingestion/toon.py` (Ticket 1.2)
-   `src/ingestion/graph.py` (Ticket 1.3)
-   `src/shared/db_clients.py`
