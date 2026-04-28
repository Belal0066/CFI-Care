"""
Integration Example: Preprocessing + Ingestion Pipeline
Shows how to use the new preprocessing layer with existing ingestion service.
"""
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion.preprocessor import (
    preprocess_json_file,
    ClinicalPreprocessor,
    NormalizedNode
)
from src.shared.models import VectorPayload

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class IntegratedClinicalPipeline:
    """
    Complete pipeline: JSON → Preprocessing → Vector/Graph Ingestion
    """
    
    @staticmethod
    def prepare_vector_payload(node: NormalizedNode) -> Dict[str, Any]:
        """
        Convert a NormalizedNode into a VectorPayload-compatible dict.
        This is the format expected by Qdrant ingestion.
        """
        # Combine primary text and details for embedding
        content = f"{node.text_primary}\n\n{node.details}"
        
        # Build rich metadata for filtering
        metadata = {
            "eoc_id": node.eoc_id,
            "date_issued": node.date_normalized,
            "event_tag": node.event_tag,
            "category": node.category,
            "is_diagnosis": node.is_diagnosis,
            "diagnosis_type": node.diagnosis_type if node.is_diagnosis else None,
            "normality": node.normality,
            "priority": node.priority,
            "father_id": node.father_id,
            "relationship_type": node.relationship_type,
        }
        
        return {
            "id": node.id,
            "content": content,
            "source_node_id": node.id,
            "metadata": metadata
        }
    
    @staticmethod
    def prepare_graph_node(node: NormalizedNode) -> Dict[str, Any]:
        """
        Convert a NormalizedNode into a graph node structure.
        This is the format for FalkorDB ingestion.
        """
        return {
            "id": node.id,
            "label": node.event_tag,
            "properties": {
                "text": node.text_primary,
                "details": node.details,
                "date": node.date_normalized,
                "category": node.category,
                "is_diagnosis": node.is_diagnosis,
                "diagnosis_type": node.diagnosis_type,
                "normality": node.normality,
                "priority": node.priority,
                "eoc_id": node.eoc_id,
            }
        }
    
    @staticmethod
    def prepare_graph_edge(node: NormalizedNode) -> Dict[str, Any]:
        """
        Create a graph edge from node to its father.
        Returns None if node has no father.
        """
        if not node.father_id:
            return None
        
        return {
            "from": node.father_id,
            "to": node.id,
            "type": node.relationship_type or "LEADS_TO",
            "properties": {
                "temporal_order": node.date_normalized
            }
        }
    
    @classmethod
    def process_file(cls, input_file: str, output_dir: str = None) -> Dict[str, Any]:
        """
        Full pipeline: preprocess + prepare for ingestion.
        
        Args:
            input_file: Path to input JSON file
            output_dir: Optional directory to save intermediate outputs
            
        Returns:
            Dict with prepared payloads for vector and graph ingestion
        """
        logger.info("=" * 60)
        logger.info("INTEGRATED CLINICAL PIPELINE")
        logger.info("=" * 60)
        
        # Step 1: Preprocess
        logger.info(f"\n[1/4] Preprocessing: {input_file}")
        result = preprocess_json_file(input_file)
        
        logger.info(f"  ✓ Processed {len(result['timeline'])} events")
        logger.info(f"  ✓ Date range: {result['statistics']['date_range']['earliest'][:10]} to {result['statistics']['date_range']['latest'][:10]}")
        
        # Step 2: Prepare vector payloads
        logger.info(f"\n[2/4] Preparing vector payloads...")
        vector_payloads = []
        for node in result["timeline"]:
            payload = cls.prepare_vector_payload(node)
            vector_payloads.append(payload)
        
        logger.info(f"  ✓ Prepared {len(vector_payloads)} vector payloads")
        
        # Step 3: Prepare graph nodes
        logger.info(f"\n[3/4] Preparing graph nodes...")
        graph_nodes = []
        for node in result["normalized_nodes"]:
            graph_node = cls.prepare_graph_node(node)
            graph_nodes.append(graph_node)
        
        logger.info(f"  ✓ Prepared {len(graph_nodes)} graph nodes")
        
        # Step 4: Prepare graph edges
        logger.info(f"\n[4/4] Preparing graph edges...")
        graph_edges = []
        for node in result["normalized_nodes"]:
            edge = cls.prepare_graph_edge(node)
            if edge:
                graph_edges.append(edge)
        
        logger.info(f"  ✓ Prepared {len(graph_edges)} graph edges")
        
        # Package results
        pipeline_output = {
            "preprocessing_result": result,
            "vector_payloads": vector_payloads,
            "graph_nodes": graph_nodes,
            "graph_edges": graph_edges,
            "statistics": {
                "total_events": len(result["timeline"]),
                "vector_payloads": len(vector_payloads),
                "graph_nodes": len(graph_nodes),
                "graph_edges": len(graph_edges),
                "root_events": result["statistics"]["root_nodes"],
                "diagnosis_events": result["statistics"]["diagnosis_count"],
            }
        }
        
        # Optionally save outputs
        if output_dir:
            output_path = Path(output_dir)
            output_path.mkdir(exist_ok=True)
            
            # Save vector payloads
            with open(output_path / "vector_payloads.json", 'w') as f:
                json.dump(vector_payloads, f, indent=2, default=str)
            logger.info(f"\n  → Saved vector payloads to: {output_path / 'vector_payloads.json'}")
            
            # Save graph structure
            with open(output_path / "graph_structure.json", 'w') as f:
                json.dump({
                    "nodes": graph_nodes,
                    "edges": graph_edges
                }, f, indent=2, default=str)
            logger.info(f"  → Saved graph structure to: {output_path / 'graph_structure.json'}")
            
            # Save statistics
            with open(output_path / "pipeline_stats.json", 'w') as f:
                json.dump(pipeline_output["statistics"], f, indent=2)
            logger.info(f"  → Saved statistics to: {output_path / 'pipeline_stats.json'}")
        
        logger.info("\n" + "=" * 60)
        logger.info("PIPELINE COMPLETE")
        logger.info("=" * 60)
        
        return pipeline_output


def simulate_ingestion(pipeline_output: Dict[str, Any]):
    """
    Simulate the ingestion process (without actually connecting to DBs).
    Shows what would be ingested where.
    """
    logger.info("\n" + "=" * 60)
    logger.info("SIMULATED INGESTION")
    logger.info("=" * 60)
    
    vector_payloads = pipeline_output["vector_payloads"]
    graph_nodes = pipeline_output["graph_nodes"]
    graph_edges = pipeline_output["graph_edges"]
    
    # Simulate vector ingestion
    logger.info("\n[QDRANT] Would ingest:")
    for i, payload in enumerate(vector_payloads[:3]):  # Show first 3
        logger.info(f"\n  Point {i+1}:")
        logger.info(f"    ID: {payload['id']}")
        logger.info(f"    Content: {payload['content'][:80]}...")
        logger.info(f"    Metadata:")
        for key, val in payload['metadata'].items():
            if val:
                logger.info(f"      {key}: {val}")
    
    if len(vector_payloads) > 3:
        logger.info(f"\n  ... and {len(vector_payloads) - 3} more points")
    
    # Simulate graph ingestion
    logger.info("\n\n[FALKORDB] Would ingest:")
    logger.info(f"\n  Nodes: {len(graph_nodes)}")
    logger.info(f"  Edges: {len(graph_edges)}")
    
    logger.info("\n  Sample nodes:")
    for node in graph_nodes[:3]:
        logger.info(f"    ({node['label']}) {node['properties']['text'][:50]}...")
    
    logger.info("\n  Sample edges:")
    for edge in graph_edges[:3]:
        logger.info(f"    {edge['from']} -[{edge['type']}]-> {edge['to']}")


def demonstrate_querying(pipeline_output: Dict[str, Any]):
    """
    Demonstrate how preprocessed data enables powerful queries.
    """
    logger.info("\n" + "=" * 60)
    logger.info("QUERY DEMONSTRATIONS")
    logger.info("=" * 60)
    
    timeline = pipeline_output["preprocessing_result"]["timeline"]
    
    # Query 1: Get all diagnoses
    logger.info("\n[Query 1] Find all diagnoses:")
    diagnoses = [n for n in timeline if n.is_diagnosis]
    for diag in diagnoses:
        logger.info(f"  {diag.date_normalized[:10]}: [{diag.diagnosis_type}] {diag.text_primary}")
    
    # Query 2: Get symptom timeline
    logger.info("\n[Query 2] Symptom progression:")
    symptoms = [n for n in timeline if n.event_tag == "Symptom"]
    for symptom in symptoms:
        logger.info(f"  {symptom.date_normalized[:10]}: {symptom.text_primary}")
    
    # Query 3: Medication history
    logger.info("\n[Query 3] Medication history:")
    meds = [n for n in timeline if n.event_tag == "Medication"]
    for med in meds:
        logger.info(f"  {med.date_normalized[:10]}: {med.text_primary}")
    
    # Query 4: Find adverse events
    logger.info("\n[Query 4] Adverse events:")
    adverse = [n for n in timeline if n.event_tag == "Allergy/Adverse"]
    for event in adverse:
        logger.info(f"  {event.date_normalized[:10]}: {event.text_primary}")
        logger.info(f"    Details: {event.details}")
    
    # Query 5: Temporal analysis
    logger.info("\n[Query 5] Time to final diagnosis:")
    first_event = timeline[0]
    final_diag = [n for n in diagnoses if n.diagnosis_type == "Final"][0]
    days = (final_diag.date_issued - first_event.date_issued).days
    logger.info(f"  From symptom onset to final diagnosis: {days} days")
    logger.info(f"  First event: {first_event.text_primary}")
    logger.info(f"  Final diagnosis: {final_diag.text_primary}")


def main():
    """Run the complete integrated pipeline demonstration."""
    
    # Process the sample data
    pipeline_output = IntegratedClinicalPipeline.process_file(
        input_file="/home/belal/AI_System/Data/data.json",
        output_dir="/home/belal/AI_System/Data/pipeline_output"
    )
    
    # Show what would be ingested
    simulate_ingestion(pipeline_output)
    
    # Demonstrate querying capabilities
    demonstrate_querying(pipeline_output)
    
    logger.info("\n" + "=" * 60)
    logger.info("✓ INTEGRATION DEMONSTRATION COMPLETE")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
