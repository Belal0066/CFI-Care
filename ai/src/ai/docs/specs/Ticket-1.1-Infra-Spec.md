# Ticket 1.1: Infrastructure Deployment Spec

## 1. Overview
Deploy the "Twin Engine" foundation required for the Clinical-Graph Copilot. This infrastructure includes:
- **HAPI FHIR**: The source of truth for clinical data (JPA server backed by Postgres).
- **Qdrant**: Vector database for semantic search and RAG.
- **FalkorDB**: Graph database (Redis API compatible) for topological reasoning.

## 2. Docker Images
The following images will be pinned in `docker-compose.yml`:

| Service | Image | Tag | Purpose |
| :--- | :--- | :--- | :--- |
| **FHIR Server** | `hapiproject/hapi` | `v6.6.0` | HL7 FHIR R4 REST API. |
| **FHIR DB** | `postgres` | `15-alpine` | Persistence layer for HAPI FHIR. |
| **Vector Engine** | `qdrant/qdrant` | `v1.7.0` | Dense vector storage (768-dim support). |
| **Graph Engine** | `falkordb/falkordb` | `latest` | Cypher-enabled graph storage. |

## 3. Configuration & Ports
- **HAPI FHIR**: Port `8080`. Env vars to connect to Postgres.
- **Qdrant**: Port `6333` (REST), `6334` (GRPC).
- **FalkorDB**: Port `6379`. (Compatible with Redis clients).

## 4. Verification Plan
1. **FHIR**: `GET http://localhost:8080/fhir/metadata` returns CapabilityStatement.
2. **Qdrant**: `GET http://localhost:6333/collections` returns JSON.
3. **FalkorDB**: Connect via `redis-cli` and run `GRAPH.QUERY`.

## 5. Schema Alignment (Architectural View)
- **Constraint**: `UUID` used in FHIR `Resource.id` must be the key in Qdrant `Point.id` and FalkorDB node property `id`.

## 6. Audit & Compliance
- **Logs**: All containers must log to stdout/stderr.
- **Persistence**: Data volumes mounted to `./data/`.
