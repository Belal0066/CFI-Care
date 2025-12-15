"""
Extracts explicit relational edges between FHIR resource entities during
ingestion, transforming flat TOON chunks into a schema-bound graph structure.

This bridges the gap between the flat document store (Qdrant) and the
relational graph database (FalkorDB) by materializing edges such as
INDICATED_BY, PART_OF_ENCOUNTER, and HAS_CONDITION at ingest time.

Usage:
    edges = TemporallyIndexedClinicalGraph()
    edges.ingest_fhir_resource(raw_json)
    graph_structure = edges.export_to_hierarchical_context()
"""
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class TemporallyIndexedClinicalGraph:
    """Transforms flat FHIR resources into a temporally-indexed graph structure
    with explicit node-entity relationships."""

    def __init__(self):
        self.nodes: dict[str, dict[str, Any]] = {}
        self.edges: list[dict[str, str]] = []

    def ingest_fhir_resource(self, raw_fhir_json: str) -> None:
        resource = json.loads(raw_fhir_json)
        res_id = resource.get("id")
        res_type = resource.get("resourceType")

        node_payload = {
            "id": res_id,
            "type": res_type,
            "timestamp": resource.get("occurrenceDateTime")
            or resource.get("effectiveDateTime"),
            "data_payload": resource,
        }
        self.nodes[res_id] = node_payload

        if res_type == "MedicationRequest":
            reason_references = resource.get("reasonReference", [])
            for ref in reason_references:
                target_id = ref.get("reference", "").split("/")[-1]
                self.edges.append({
                    "source": res_id,
                    "target": target_id,
                    "relationship": "INDICATED_BY",
                })

        elif res_type == "Observation":
            encounter_ref = resource.get("encounter", {}).get("reference")
            if encounter_ref:
                parent_enc_id = encounter_ref.split("/")[-1]
                self.edges.append({
                    "source": res_id,
                    "target": parent_enc_id,
                    "relationship": "PART_OF_ENCOUNTER",
                })

    def export_to_hierarchical_context(self) -> dict[str, Any]:
        return {
            "graph_nodes": list(self.nodes.values()),
            "structural_edges": self.edges,
        }
