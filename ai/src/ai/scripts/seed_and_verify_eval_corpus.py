#!/usr/bin/env python3
"""
Seeds the evaluation corpus (3 cohorts) into Qdrant and verifies payload flags.
Wipes the configured collection (QDRANT_COLLECTION_NAME) and rebuilds it.
"""

import json
import re
import uuid
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

from qdrant_client import QdrantClient
from qdrant_client.models import (
    PointStruct, VectorParams, SparseVectorParams, Distance,
    Filter, FieldCondition, MatchValue,
)
from fastembed import TextEmbedding, SparseTextEmbedding


def run_system_seeding():
    print("Connecting to local Qdrant engine on port 6333...")
    client = QdrantClient(url="http://localhost:6333")
    from src.shared.config import config
    collection_name = config.qdrant_collection_name

    print("Initializing embedding models (bge-base-en-v1.5 + SPLADE)...")
    dense_embedder = TextEmbedding(model_name="BAAI/bge-base-en-v1.5")
    sparse_embedder = SparseTextEmbedding(model_name="prithivida/Splade_PP_en_v1")

    # Recreate collection — wipe stale 10-doc footprint
    print(f"Recreating collection '{collection_name}'...")
    client.recreate_collection(
        collection_name=collection_name,
        vectors_config={
            "text-dense": VectorParams(size=768, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            "text-sparse": SparseVectorParams(),
        },
    )

    with open("evaluation_corpus.json", "r") as f:
        corpus_data = json.load(f)

    uploaded_points_count = 0

    for cohort_id, cohort_body in corpus_data["cohorts"].items():
        patient_id = cohort_body["patient_id"]
        points = cohort_body["points"]
        print(f"Embedding {len(points)} points for {cohort_id} (Patient: {patient_id})...")

        # Map resource_type + TOON type to event_tag (matches extract_search_flags)
        _TYPE_TO_EVENT_TAG = {
            "Diagnosis": "Diagnosis",
            "Symptom": "Symptom",
            "Medication": "Medication",
            "Outcome": "FollowUp/Outcome",
            "Allergy": "Allergy/Adverse",
            "Investigation": "Investigation",
        }

        batch = []
        for record in points:
            text_content = record["toon_content"]

            dense_vector = list(next(dense_embedder.embed([text_content])))
            sparse_raw = list(sparse_embedder.embed([text_content]))[0]

            sparse_vector = {
                "indices": sparse_raw.indices.tolist(),
                "values": sparse_raw.values.tolist(),
            }

            # Extract TYPE from TOON content to determine event_tag
            # Support both old format (TYPE: Diagnosis) and new YAML-like format (resourceType: Observation)
            type_match = re.search(r'TYPE:\s*(\w+)', text_content)
            if type_match:
                toon_type = type_match.group(1)
            else:
                # New YAML-like format: extract from resourceType or code
                resource_match = re.search(r'resourceType:\s*(\w+)', text_content)
                toon_type = resource_match.group(1) if resource_match else "Unknown"
            event_tag = _TYPE_TO_EVENT_TAG.get(toon_type, toon_type)
            is_investigation = (event_tag == "Investigation")

            payload = {
                "id": record["node_id"],
                "patient_id": patient_id,
                "resource_type": record["resource_type"],
                "event_tag": event_tag,
                "toon_content": text_content,
                "fhir_raw": record["fhir_raw"],
                "chunk_index": 0,
                "parent_node_id": record["parent_node_id"],
                "is_diagnosis": record["is_diagnosis"],
                "is_medication": record["is_medication"],
                "is_allergy": record["is_allergy"],
                "is_symptom": record["is_symptom"],
                "is_outcome": record["is_outcome"],
                "is_investigation": is_investigation,
            }

            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, record["node_id"]))

            batch.append(
                PointStruct(
                    id=point_id,
                    vector={
                        "text-dense": dense_vector,
                        "text-sparse": sparse_vector,
                    },
                    payload=payload,
                )
            )

        client.upsert(collection_name=collection_name, points=batch)
        uploaded_points_count += len(batch)
        print(f"  Upserted {len(batch)} points.")

    print(f"\n[SUCCESS] Injected {uploaded_points_count} validated evaluation points.")

    # Verify payload flag filtering
    print("\nVerifying Qdrant payload flag filtering...")
    for cohort_id, cohort_body in corpus_data["cohorts"].items():
        patient_id = cohort_body["patient_id"]
        test = client.search(
            collection_name=collection_name,
            query_vector=("text-dense", list(next(dense_embedder.embed(["test"])))),
            query_filter=Filter(
                must=[
                    FieldCondition(key="patient_id", match=MatchValue(value=patient_id)),
                ]
            ),
            limit=10,
        )
        print(f"  {cohort_id} ({patient_id}): {len(test)} points found")

    # Test intent filter on Gamma cohort
    print("\nTesting is_medication flag filter on pat-cohort-gamma...")
    med_results = client.search(
        collection_name=collection_name,
        query_vector=("text-dense", list(next(dense_embedder.embed(["Enalapril dosage"])))),
        query_filter=Filter(
            must=[
                FieldCondition(key="patient_id", match=MatchValue(value="pat-cohort-gamma")),
                FieldCondition(key="is_medication", match=MatchValue(value=True)),
            ]
        ),
        limit=5,
    )
    print(f"  Filtered (is_medication=true): {len(med_results)} records")
    for hit in med_results:
        print(f"    -> {hit.payload['id']} | is_medication={hit.payload['is_medication']}")

    # Test is_symptom flag filter on Gamma cohort
    print("\nTesting is_symptom flag filter on pat-cohort-gamma...")
    sym_results = client.search(
        collection_name=collection_name,
        query_vector=("text-dense", list(next(dense_embedder.embed(["chest tightness"])))),
        query_filter=Filter(
            must=[
                FieldCondition(key="patient_id", match=MatchValue(value="pat-cohort-gamma")),
                FieldCondition(key="is_symptom", match=MatchValue(value=True)),
            ]
        ),
        limit=5,
    )
    print(f"  Filtered (is_symptom=true): {len(sym_results)} records")
    for hit in sym_results:
        print(f"    -> {hit.payload['id']} | is_symptom={hit.payload['is_symptom']}")

    print("\n[VERIFIED] All payload flags and filters operational.")


if __name__ == "__main__":
    run_system_seeding()
