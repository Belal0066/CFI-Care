#!/usr/bin/env python3
"""
Seed clinical data into Qdrant clinical_embeddings collection.
Uses IngestionService.ingest_resource() with the custom node list format.
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

from src.ingestion.service import IngestionService

def main():
    data_path = Path("Data/data.json")
    if not data_path.exists():
        logger.error(f"Data file not found: {data_path}")
        return 1

    with open(data_path) as f:
        patient_data = json.load(f)

    # Verify format
    assert "nodes" in patient_data, "Expected 'nodes' key in data"
    logger.info(f"Loaded {len(patient_data['nodes'])} nodes for EOC {patient_data.get('eocId', 'unknown')}")

    # Ingest via IngestionService (handles embedding + Qdrant upsert)
    logger.info("Ingesting into Qdrant via IngestionService...")
    ingestion = IngestionService()
    result = ingestion.ingest_resource(patient_data)

    # Verify
    from src.shared.db_clients import qdrant_client
    qdrant_client.connect()
    coll = qdrant_client.client.get_collection('clinical_embeddings')
    logger.info(f"\nDone! clinical_embeddings: {coll.points_count} points")
    logger.info(f"Result: {result}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
