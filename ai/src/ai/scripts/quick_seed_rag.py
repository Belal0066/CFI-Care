#!/usr/bin/env python3
"""
Quick seed script that directly inserts into Qdrant
Bypasses the full 2PC ingestion (no FalkorDB required)
"""
import sys
from pathlib import Path
import logging
from datetime import datetime, timezone

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.shared.db_clients import qdrant_client
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def ensure_collection():
    """Ensure collection exists."""
    client = qdrant_client.connect()
    collection_name = qdrant_client.collection_name
    
    collections = client.get_collections().collections
    if not any(c.name == collection_name for c in collections):
        logger.info(f"Creating collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
        logger.info(f" Created: {collection_name}")
    else:
        logger.info(f" Collection exists: {collection_name}")


def create_sample_data():
    """Create sample clinical data directly."""
    data = [
        {
            "id": "patient-001",
            "patient_id": "patient-001",
            "resource_type": "Patient",
            "content": "Sarah Johnson, female, born March 15, 1965. Diagnosed with Type 2 Diabetes Mellitus in May 2020. Currently managing condition with lifestyle modifications and medication."
        },
        {
            "id": "patient-002",
            "patient_id": "patient-002",
            "resource_type": "Patient",
            "content": "Michael Williams, male, born July 22, 1958. Diagnosed with Essential Hypertension in March 2018. Blood pressure regularly monitored, on antihypertensive medication."
        },
        {
            "id": "patient-003",
            "patient_id": "patient-003",
            "resource_type": "Patient",
            "content": "Emily Davis, female, born November 8, 1990. Generally healthy, regular checkups. No chronic conditions reported."
        },
        {
            "id": "obs-001",
            "patient_id": "patient-001",
            "resource_type": "Observation",
            "content": "Blood Glucose measurement for Sarah Johnson on January 15, 2026: 180 mg/dL. Value is elevated, indicating suboptimal diabetes control. Patient advised to review diet and medication adherence."
        },
        {
            "id": "obs-002",
            "patient_id": "patient-001",
            "resource_type": "Observation",
            "content": "HbA1c test for Sarah Johnson on January 15, 2026: 7.2%. This indicates average blood sugar control over the past 3 months is above target. Treatment plan adjustment recommended."
        },
        {
            "id": "obs-003",
            "patient_id": "patient-002",
            "resource_type": "Observation",
            "content": "Blood Pressure reading for Michael Williams on January 20, 2026: 150/95 mmHg (systolic 150, diastolic 95). Elevated reading suggests hypertension not fully controlled. Medication review scheduled."
        },
        {
            "id": "obs-004",
            "patient_id": "patient-003",
            "resource_type": "Observation",
            "content": "Heart Rate measurement for Emily Davis on January 22, 2026: 72 beats per minute. Normal resting heart rate, within healthy range. No concerns noted."
        },
        {
            "id": "cond-001",
            "patient_id": "patient-001",
            "resource_type": "Condition",
            "content": "Type 2 Diabetes Mellitus diagnosed for Sarah Johnson in May 2020. Active condition requiring ongoing management. Symptoms include increased thirst, frequent urination, and fatigue. Common complications include neuropathy, retinopathy, and cardiovascular disease if poorly controlled."
        },
        {
            "id": "cond-002",
            "patient_id": "patient-002",
            "resource_type": "Condition",
            "content": "Essential Hypertension diagnosed for Michael Williams in March 2018. Active condition characterized by persistently elevated blood pressure (>130/80 mmHg). Risk factors include age, stress, and lifestyle. Can lead to stroke, heart disease, and kidney damage if untreated."
        },
        # Additional medical knowledge
        {
            "id": "knowledge-diabetes-symptoms",
            "patient_id": "general",
            "resource_type": "Knowledge",
            "content": "Common symptoms of diabetes include: increased thirst (polydipsia), frequent urination (polyuria), increased hunger, unexplained weight loss, fatigue, blurred vision, slow-healing sores, and frequent infections. Type 2 diabetes symptoms often develop gradually over years."
        },
        {
            "id": "knowledge-diabetes-treatment",
            "patient_id": "general",
            "resource_type": "Knowledge",
            "content": "Diabetes treatment typically includes: lifestyle modifications (diet and exercise), blood glucose monitoring, oral medications (metformin, sulfonylureas, DPP-4 inhibitors), injectable medications (GLP-1 agonists, insulin), and regular HbA1c testing. Target HbA1c is typically <7% for most patients."
        },
        {
            "id": "knowledge-hypertension-treatment",
            "patient_id": "general",
            "resource_type": "Knowledge",
            "content": "Hypertension management includes: lifestyle changes (reduced sodium intake, weight loss, regular exercise, stress management), first-line medications (ACE inhibitors, ARBs, calcium channel blockers, thiazide diuretics), regular blood pressure monitoring, and treatment of underlying causes."
        },
    ]
    
    return data


def main():
    print(" Quick Seed - MedGemma RAG Data")
    print("=" * 60)
    
    # Ensure collection
    print("\n[1/3] Setting up Qdrant collection...")
    try:
        ensure_collection()
    except Exception as e:
        print(f"\n Qdrant setup failed: {e}")
        print("Make sure Qdrant is running: docker-compose up -d qdrant")
        return 1
    
    # Load embedding model
    print("\n[2/3] Loading embedding model...")
    try:
        model = SentenceTransformer("lokeshch19/ModernPubMedBERT")
        print(" Model loaded")
    except Exception as e:
        print(f" Failed to load model: {e}")
        return 1
    
    # Create and insert data
    print("\n[3/3] Inserting data...")
    data = create_sample_data()
    client = qdrant_client.connect()
    collection_name = qdrant_client.collection_name
    
    points = []
    for item in data:
        # Generate embedding
        embedding = model.encode(item["content"]).tolist()
        
        # Create UUID from ID
        point_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, item["id"]))
        
        # Create point
        point = PointStruct(
            id=point_uuid,
            vector=embedding,
            payload={
                "id": item["id"],
                "patient_id": item["patient_id"],
                "resource_type": item["resource_type"],
                "toon_content": item["content"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        )
        points.append(point)
        print(f"   {item['id']} ({item['resource_type']})")
    
    # Batch upsert
    try:
        client.upsert(
            collection_name=collection_name,
            points=points
        )
        print(f"\n Inserted {len(points)} points into Qdrant")
    except Exception as e:
        print(f"\n Upsert failed: {e}")
        return 1
    
    # Summary
    print("\n" + "=" * 60)
    print(" Data seeded successfully!")
    print(f"   • {len(data)} clinical records")
    print(f"   • Collection: {collection_name}")
    print("\n Next steps:")
    print("   • Open http://localhost:8501 (if Streamlit is running)")
    print("   • Or run: python examples/medgemma_rag_example.py")
    print("   • Try: python scripts/test_medgemma_rag.py --interactive")
    print("\n Test queries:")
    print("   - 'What are the symptoms of diabetes?'")
    print("   - 'Show patient-001 glucose levels'")
    print("   - 'What conditions does patient-002 have?'")
    print("   - 'How to treat hypertension?'")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
