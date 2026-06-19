#!/usr/bin/env python3
"""
Ticket 1.4 Verification: Sync Check Script.
Identifies orphans (Data not satisfying Twin Engine Rule).
"""
import sys
import logging
from typing import Set
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from shared.db_clients import qdrant_client, falkor_client
from shared.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SyncCheck")

def get_vector_ids() -> Set[str]:
    """Retrieve all IDs from Qdrant."""
    try:
        client = qdrant_client.connect()
        # Scroll through all points
        ids = set()
        next_offset = None
        while True:
            records, next_offset = client.scroll(
                collection_name=config.qdrant_collection_name,
                limit=100,
                offset=next_offset,
                with_payload=False,
                with_vectors=False
            )
            for record in records:
                ids.add(record.id)
            
            if next_offset is None:
                break
        return ids
    except Exception as e:
        logger.error(f"Failed to fetch vector IDs: {e}")
        return set()

def get_graph_ids() -> Set[str]:
    """Retrieve all IDs from FalkorDB."""
    try:
        # Match all nodes with an 'id' property
        query = "MATCH (n) WHERE n.id IS NOT NULL RETURN n.id"
        result = falkor_client.execute_query(query)
        
        # Result format [Header, Rows, Stats]
        # Rows are at index 1
        if not result or len(result) < 2:
            return set()
            
        rows = result[1]
        ids = set()
        for row in rows:
            # Row is typically [val1, val2...]. We asked for n.id
            if row and row[0]:
                ids.add(row[0])
        return ids
    except Exception as e:
        logger.error(f"Failed to fetch graph IDs: {e}")
        return set()

def main():
    print("="*60)
    print("Twin Engine Sync Check (Ticket 1.4)")
    print("="*60)

    # 1. Fetch IDs
    vector_ids = get_vector_ids()
    graph_ids = get_graph_ids()
    
    print(f"Vector Count: {len(vector_ids)}")
    print(f"Graph Count:  {len(graph_ids)}")
    
    # 2. Compare
    orphaned_vectors = vector_ids - graph_ids
    missing_context = graph_ids - vector_ids
    
    # 3. Report
    print("-" * 60)
    if not orphaned_vectors and not missing_context:
        print("✓ System is Synchronized (Twin Engine Rule Compliant)")
        return 0

    if orphaned_vectors:
        print(f"✗ ORPHANED VECTORS (In Qdrant, missing in Graph): {len(orphaned_vectors)}")
        for i, uid in enumerate(list(orphaned_vectors)[:5]):
            print(f"  - {uid}")
        if len(orphaned_vectors) > 5: print("  ...and more")
        
    if missing_context:
        print(f"✗ MISSING CONTEXT (In Graph, missing in Qdrant): {len(missing_context)}")
        for i, uid in enumerate(list(missing_context)[:5]):
            print(f"  - {uid}")
        if len(missing_context) > 5: print("  ...and more")

    return 1

if __name__ == "__main__":
    sys.exit(main())
