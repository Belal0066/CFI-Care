#!/usr/bin/env python3
"""
Ticket 1.3: Graph Schema Initialization.
Applies indices to FalkorDB for performance.
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from shared.db_clients import falkor_client
from ingestion.graph import GraphMapper

def main():
    print("="*60)
    print("Initializing Clinical Graph Schema (Ticket 1.3)")
    print("="*60)
    
    if not falkor_client.health_check():
        print("✗ FalkorDB is not reachable. Is docker-compose up?")
        return 1

    indices = GraphMapper.setup_indexes()
    
    success_count = 0
    for query in indices:
        try:
            falkor_client.execute_query(query)
            print(f"✓ Applied: {query}")
            success_count += 1
        except Exception as e:
            # Handle "already indexed" as success
            if "already indexed" in str(e).lower():
                print(f"✓ Already exist: {query}")
                success_count += 1
            else:
                print(f"  Note: {query} -> {e}")
            
    print("-" * 60)
    print(f"Schema Setup Complete: {success_count}/{len(indices)} indices verified.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
