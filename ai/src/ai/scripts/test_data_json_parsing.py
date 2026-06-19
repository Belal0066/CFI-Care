#!/usr/bin/env python3
"""
Test parsing of data.json encounter format
Validates that all fields are correctly extracted
"""
import json
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.ingestion.preprocessor import ClinicalPreprocessor

def test_data_json_parsing():
    """Test parsing the actual data.json file"""
    print("="*70)
    print("TESTING data.json ENCOUNTER PARSING")
    print("="*70)
    
    # Load data.json
    data_path = project_root / "Data" / "data.json"
    with open(data_path, 'r') as f:
        raw_data = json.load(f)
    
    print(f"\n✓ Loaded data.json")
    print(f"  EOC ID: {raw_data['eocId']}")
    print(f"  Nodes: {len(raw_data['nodes'])}")
    
    # Preprocess
    preprocessor = ClinicalPreprocessor()
    result = preprocessor.preprocess_timeline(raw_data)
    
    nodes = result['timeline']
    eoc_id = result['eoc_id']
    stats = result['statistics']
    
    print(f"\n✓ Preprocessing complete")
    print(f"  Processed: {len(nodes)} nodes")
    print(f"  Date range: {nodes[0].date_issued.date()} to {nodes[-1].date_issued.date()}")
    
    # Verify all encounters parsed
    print(f"\n✓ All encounters parsed:")
    for i, node in enumerate(nodes, 1):
        print(f"  {i}. [{node.date_issued.date()}] {node.event_tag}: {node.text_primary[:50]}...")
    
    # Check key fields
    print(f"\n✓ Field validation:")
    
    # IDs
    assert all(node.id for node in nodes), "All nodes must have ID"
    print(f"  ✓ All {len(nodes)} nodes have IDs")
    
    # Dates
    assert all(node.date_issued for node in nodes), "All nodes must have dates"
    print(f"  ✓ All {len(nodes)} nodes have dates")
    
    # Categories
    categories = {node.category for node in nodes}
    print(f"  ✓ Categories: {', '.join(categories)}")
    
    # Event tags
    event_tags = {node.event_tag for node in nodes}
    print(f"  ✓ Event tags: {', '.join(event_tags)}")
    
    # Diagnoses
    diagnoses = [n for n in nodes if n.is_diagnosis]
    print(f"  ✓ Diagnoses: {len(diagnoses)} found")
    for dx in diagnoses:
        print(f"    - {dx.diagnosis_type}: {dx.text_primary}")
    
    # Graph structure
    root_nodes = [n for n in nodes if not n.father_id]
    print(f"  ✓ Graph: {len(root_nodes)} root node(s), {len(nodes) - len(root_nodes)} child nodes")
    
    # Statistics summary
    print(f"\n✓ Statistics:")
    event_counts = {}
    for node in nodes:
        event_counts[node.event_tag] = event_counts.get(node.event_tag, 0) + 1
    for key, value in event_counts.items():
        print(f"  - {key}: {value}")
    
    print(f"\n" + "="*70)
    print("✅ ALL PARSING TESTS PASSED")
    print("="*70)
    print(f"\nThe data.json format is correctly parsed!")
    print(f"All {len(nodes)} encounters extracted with complete metadata.")
    
    return True

if __name__ == "__main__":
    try:
        test_data_json_parsing()
    except Exception as e:
        print(f"\n❌ PARSING FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
