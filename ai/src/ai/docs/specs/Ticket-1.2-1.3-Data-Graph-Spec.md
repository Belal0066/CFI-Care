# Ticket 1.2 & 1.3: Data Normalization & Graph Schema Spec

## 1. Overview
This specification covers the transformation of raw FHIR data into two distinct formats required by the "Twin Engine" architecture:
1.  **Vector Context (TOON)**: A flat, human-readable markdown string with calculated trends (Ticket 1.2).
2.  **Graph Topology (Cypher)**: A temporal graph structure enabling topological traversal (Ticket 1.3).

## 2. Ticket 1.2: TOON (Task-Oriented Observation Normalization)
**Goal**: Convert rich FHIR JSON into "LLM-Ready" text chunks.

### 2.1 Output Format
The `ToonSnapshot` string must follow this template:
```markdown
**[ISO-DATE] RESOURCE_TYPE: SUMMARY**
*   Details: {Primary Value} {Unit}
*   Context: {Interpretation} (e.g., High, Low)
*   Trend: {Delta vs Previous}
```

### 2.2 Trend Logic (Context Engineering)
For `Observation` resources, the normalizer accepts an optional `previous_value`.
-   **Formula**: `((Current - Previous) / Previous) * 100`% (if float).
-   **Display**: "+15% vs last week" or "Stable".

## 3. Ticket 1.3: Graph Schema (Cypher)
**Goal**: Define the temporal graph structure in FalkorDB.

### 3.1 Node Labels & Properties
All nodes must share the exact `id` (UUID) with their Qdrant/FHIR counterparts.

| Node Label | Core Properties |
| :--- | :--- |
| `:Patient` | `id`, `name`, `dob`, `gender` |
| `:Encounter` | `id`, `start_date`, `end_date`, `type` |
| `:Observation` | `id`, `code`, `value`, `unit`, `date` |
| `:Condition` | `id`, `code`, `onset_date`, `status` |

### 3.2 Relationships
```cypher
(:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
(:Encounter)-[:OBSERVED]->(:Observation)
(:Encounter)-[:DIAGNOSED]->(:Condition)
(:Patient)-[:HAS_CONDITION]->(:Condition) // Direct link for chronic list
```

### 3.3 Indexing Strategy
Execute these on startup to ensure performant range queries:
-   `INDEX FOR (e:Encounter) ON (e.id)`
-   `INDEX FOR (e:Encounter) ON (e.start_date)`
-   `INDEX FOR (o:Observation) ON (o.code)`
-   `INDEX FOR (p:Patient) ON (p.id)`

## 4. Implementation Plan

### 4.1 Modules
-   `src/ingestion/toon.py`: Handles FHIR -> Markdown conversion.
-   `src/ingestion/graph.py`: Handles FHIR -> Cypher mapping.

### 4.2 Handling "Twin Engine" Rule
Both modules will process the *same* FHIR resource wrapper. The system must ensure that the `id` generated/extracted is consistent across both pipelines.
