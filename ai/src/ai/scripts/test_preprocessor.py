"""
Test script for the preprocessing and normalization layer.
Validates all aspects of Ticket 4.1-4.2 implementation.
"""
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion.preprocessor import (
    ClinicalPreprocessor,
    preprocess_json_file,
    PreprocessingError,
    EventTag,
    DiagnosisType,
    ClinicalCategory
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_basic_preprocessing():
    """Test basic preprocessing pipeline"""
    logger.info("=" * 60)
    logger.info("TEST 1: Basic Preprocessing Pipeline")
    logger.info("=" * 60)
    
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    
    assert result["eoc_id"] == "eoc-4c6444dc-4b19-4467-84cf-71b67833987e"
    assert len(result["normalized_nodes"]) == 10
    assert len(result["timeline"]) == 10
    assert result["statistics"]["successfully_normalized"] == 10
    assert result["statistics"]["failed_nodes"] == 0
    
    logger.info("✓ Successfully preprocessed all nodes")
    logger.info(f"✓ EOC ID: {result['eoc_id']}")
    logger.info(f"✓ Total nodes: {len(result['normalized_nodes'])}")
    
    return result


def test_chronological_sorting(result: Dict[str, Any]):
    """Test that timeline is properly sorted"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 2: Chronological Sorting")
    logger.info("=" * 60)
    
    timeline = result["timeline"]
    
    # Check ordering
    for i in range(len(timeline) - 1):
        assert timeline[i].date_issued <= timeline[i + 1].date_issued, \
            f"Timeline not sorted: {timeline[i].date_normalized} > {timeline[i+1].date_normalized}"
    
    logger.info("✓ Timeline is chronologically sorted")
    logger.info(f"  First event: {timeline[0].date_normalized} - {timeline[0].text_primary}")
    logger.info(f"  Last event: {timeline[-1].date_normalized} - {timeline[-1].text_primary}")


def test_graph_structure(result: Dict[str, Any]):
    """Test graph relationship preservation"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 3: Graph Structure Preservation")
    logger.info("=" * 60)
    
    graph = result["graph_structure"]
    
    assert "node_map" in graph
    assert "root_nodes" in graph
    assert "children_map" in graph
    
    logger.info(f"✓ Total nodes in graph: {graph['total_nodes']}")
    logger.info(f"✓ Root nodes: {graph['root_count']}")
    
    # Verify father-child relationships
    for node in result["normalized_nodes"]:
        if node.father_id:
            assert node.father_id in graph["node_map"], \
                f"Father node {node.father_id} not found for {node.id}"
    
    logger.info("✓ All father-child relationships preserved")
    
    # Show tree structure
    logger.info("\nGraph Structure:")
    for root in graph["root_nodes"]:
        _print_tree(root.id, graph["node_map"], graph["children_map"], indent=0)


def _print_tree(node_id: str, node_map: Dict, children_map: Dict, indent: int):
    """Helper to print tree structure"""
    node = node_map[node_id]
    prefix = "  " * indent
    logger.info(f"{prefix}└─ [{node.date_normalized[:10]}] {node.text_primary[:50]}")
    
    if node_id in children_map:
        for child_id in children_map[node_id]:
            _print_tree(child_id, node_map, children_map, indent + 1)


def test_semantic_normalization(result: Dict[str, Any]):
    """Test semantic category and tag mapping"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 4: Semantic Normalization")
    logger.info("=" * 60)
    
    nodes = result["normalized_nodes"]
    
    # Check that all enums are properly set (they're strings due to use_enum_values)
    for node in nodes:
        assert node.category in [e.value for e in ClinicalCategory], f"Invalid category: {node.category}"
        assert node.event_tag in [e.value for e in EventTag], f"Invalid event_tag: {node.event_tag}"
        assert node.diagnosis_type in [e.value for e in DiagnosisType], f"Invalid diagnosis_type: {node.diagnosis_type}"
    
    logger.info("✓ All semantic enums properly mapped")
    
    # Show distribution
    logger.info("\nEvent Tag Distribution:")
    for tag, count in result["statistics"]["event_tag_distribution"].items():
        logger.info(f"  {tag}: {count}")
    
    # Verify specific nodes
    logger.info("\nSample Node Analysis:")
    for node in nodes[:3]:
        logger.info(f"\n  Node: {node.text_primary}")
        logger.info(f"    Category: {node.category}")
        logger.info(f"    Event Tag: {node.event_tag}")
        logger.info(f"    Is Diagnosis: {node.is_diagnosis}")
        if node.is_diagnosis:
            logger.info(f"    Diagnosis Type: {node.diagnosis_type}")


def test_diagnosis_classification(result: Dict[str, Any]):
    """Test diagnosis type classification"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 5: Diagnosis Classification")
    logger.info("=" * 60)
    
    nodes = result["normalized_nodes"]
    diagnoses = [n for n in nodes if n.is_diagnosis]
    
    logger.info(f"✓ Found {len(diagnoses)} diagnosis nodes")
    
    for diag in diagnoses:
        logger.info(f"\n  {diag.text_primary}")
        logger.info(f"    Type: {diag.diagnosis_type}")
        logger.info(f"    Date: {diag.date_normalized}")
        logger.info(f"    Details: {diag.details[:100]}...")
    
    # Verify expected classifications
    expected_diagnoses = {
        "Initial Diagnosis: Bronchitis": DiagnosisType.PROVISIONAL,
        "Differential Diagnosis: Atypical Pneumonia vs. Drug Reaction": DiagnosisType.DIFFERENTIAL,
        "Final Diagnosis: Mycoplasma Pneumonia": DiagnosisType.FINAL
    }
    
    for node in diagnoses:
        if node.text_primary in expected_diagnoses:
            expected_type = expected_diagnoses[node.text_primary]
            assert node.diagnosis_type == expected_type, \
                f"Wrong diagnosis type for '{node.text_primary}': got {node.diagnosis_type}, expected {expected_type}"
    
    logger.info("\n✓ Diagnosis classification correct")


def test_event_tagging(result: Dict[str, Any]):
    """Test event tagging logic"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 6: Event Tagging")
    logger.info("=" * 60)
    
    nodes = result["normalized_nodes"]
    
    # Verify specific expected tags
    test_cases = [
        ("HPI: Persistent cough and fatigue", EventTag.SYMPTOM),
        ("Chest X-Ray ordered", EventTag.INVESTIGATION),
        ("Initial Diagnosis: Bronchitis", EventTag.DIAGNOSIS),
        ("Prescribed Amoxicillin", EventTag.MEDICATION),
        ("Adverse Drug Reaction to Amoxicillin confirmed", EventTag.ALLERGY_ADVERSE),
        ("Patient condition improved significantly", EventTag.FOLLOW_UP_OUTCOME),
    ]
    
    node_map = {n.text_primary: n for n in nodes}
    
    for text, expected_tag in test_cases:
        if text in node_map:
            actual_tag = node_map[text].event_tag
            logger.info(f"  '{text[:40]}...'")
            logger.info(f"    Expected: {expected_tag}, Got: {actual_tag}")
            assert actual_tag == expected_tag, \
                f"Wrong tag for '{text}': expected {expected_tag}, got {actual_tag}"
    
    logger.info("\n✓ All event tags correct")


def test_temporal_analysis(result: Dict[str, Any]):
    """Test temporal metadata extraction"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 7: Temporal Analysis")
    logger.info("=" * 60)
    
    stats = result["statistics"]
    date_range = stats["date_range"]
    
    logger.info(f"✓ Date Range: {date_range['earliest']} to {date_range['latest']}")
    
    timeline = result["timeline"]
    
    # Calculate time deltas between events
    logger.info("\nEvent Timeline:")
    for i, node in enumerate(timeline):
        days_since_start = (node.date_issued - timeline[0].date_issued).days
        logger.info(f"  Day {days_since_start:2d}: {node.event_tag:20s} - {node.text_primary}")


def test_error_handling():
    """Test error handling for invalid inputs"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 8: Error Handling")
    logger.info("=" * 60)
    
    # Test missing file
    try:
        preprocess_json_file("/nonexistent/file.json")
        assert False, "Should have raised error for missing file"
    except PreprocessingError as e:
        logger.info(f"✓ Correctly caught missing file: {e}")
    
    # Test invalid JSON
    try:
        ClinicalPreprocessor.preprocess_timeline({"nodes": []})
        assert False, "Should have raised error for empty nodes"
    except PreprocessingError as e:
        logger.info(f"✓ Correctly caught empty nodes: {e}")
    
    # Test missing eocId
    try:
        ClinicalPreprocessor.preprocess_timeline({"nodes": [{"id": "test"}]})
        assert False, "Should have raised error for missing eocId"
    except PreprocessingError as e:
        logger.info(f"✓ Correctly caught missing eocId: {e}")
    
    logger.info("\n✓ Error handling working correctly")


def generate_summary_report(result: Dict[str, Any]):
    """Generate a comprehensive summary report"""
    logger.info("\n" + "=" * 60)
    logger.info("PREPROCESSING SUMMARY REPORT")
    logger.info("=" * 60)
    
    stats = result["statistics"]
    
    logger.info(f"\nEpisode of Care: {result['eoc_id']}")
    logger.info(f"Date Range: {stats['date_range']['earliest'][:10]} to {stats['date_range']['latest'][:10]}")
    logger.info(f"\nNodes Processed: {stats['successfully_normalized']}/{stats['total_input_nodes']}")
    logger.info(f"Failed Nodes: {stats['failed_nodes']}")
    logger.info(f"Root Nodes: {stats['root_nodes']}")
    logger.info(f"Diagnosis Nodes: {stats['diagnosis_count']}")
    
    logger.info("\nEvent Distribution:")
    for tag, count in sorted(stats["event_tag_distribution"].items()):
        logger.info(f"  {tag:25s}: {count}")
    
    logger.info("\n" + "=" * 60)
    logger.info("ALL TESTS PASSED ✓")
    logger.info("=" * 60)


def main():
    """Run all tests"""
    try:
        # Run tests in sequence
        result = test_basic_preprocessing()
        test_chronological_sorting(result)
        test_graph_structure(result)
        test_semantic_normalization(result)
        test_diagnosis_classification(result)
        test_event_tagging(result)
        test_temporal_analysis(result)
        test_error_handling()
        
        # Generate final report
        generate_summary_report(result)
        
        # Export normalized data for next stage
        output_path = "/home/belal/AI_System/Data/normalized_timeline.json"
        with open(output_path, 'w') as f:
            json.dump({
                "eoc_id": result["eoc_id"],
                "timeline": [node.dict() for node in result["timeline"]],
                "statistics": result["statistics"]
            }, f, indent=2, default=str)
        
        logger.info(f"\n✓ Normalized timeline exported to: {output_path}")
        
        return 0
        
    except Exception as e:
        logger.error(f"\n✗ TEST FAILED: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
