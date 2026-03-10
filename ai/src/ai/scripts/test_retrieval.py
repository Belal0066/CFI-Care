#!/usr/bin/env python3
"""
Ticket 2.1: Hybrid Retrieval Service Verification.
Tests dense+sparse vector search with reciprocal rank fusion.
"""
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.retrieval.service import HybridRetriever
from src.shared.db_clients import qdrant_client
from src.ingestion.service import IngestionService

# Import FHIR for test data
from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from fhir.resources.quantity import Quantity
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding

def setup_test_data():
    """
    Ingest test clinical data for retrieval testing.
    """
    print("\n--- Setting Up Test Data ---")
    
    # Create Patient
    patient_id = str(uuid.uuid4())
    patient = Patient(
        id=patient_id,
        active=True,
        name=[{"family": "RetrievalTest", "given": ["Query"]}],
        gender="male",
        birthDate="1975-03-15"
    )
    
    # Create Observations (Labs)
    obs_glucose = Observation(
        id=str(uuid.uuid4()),
        status="final",
        code=CodeableConcept(
            coding=[Coding(
                system="http://loinc.org",
                code="2345-7",
                display="Glucose [Mass/volume] in Serum or Plasma"
            )],
            text="Glucose"
        ),
        subject={"reference": f"Patient/{patient_id}"},
        effectiveDateTime="2024-01-15T09:00:00Z",
        valueQuantity=Quantity(value=145, unit="mg/dL", system="http://unitsofmeasure.org", code="mg/dL")
    )
    
    obs_bp = Observation(
        id=str(uuid.uuid4()),
        status="final",
        code=CodeableConcept(
            coding=[Coding(
                system="http://loinc.org",
                code="85354-9",
                display="Blood pressure panel"
            )],
            text="Blood Pressure"
        ),
        subject={"reference": f"Patient/{patient_id}"},
        effectiveDateTime="2024-01-15T09:30:00Z"
    )
    
    # Ingest via IngestionService
    resources = [patient, obs_glucose, obs_bp]
    for res in resources:
        try:
            success = IngestionService.ingest_resource(res)
            if success:
                print(f"✓ Ingested {res.resource_type}/{res.id[:8]}...")
            else:
                print(f"✗ Failed to ingest {res.resource_type}")
                return None
        except Exception as e:
            print(f"✗ Ingestion error: {e}")
            return None
    
    return patient_id

def test_vector_search(retriever, patient_id):
    """Test dense+sparse vector search."""
    print("\n--- Test 1: Vector Search ---")

    query = "elevated glucose levels"
    print(f"Query: '{query}'")

    try:
        results = retriever.search(patient_id, query, limit=2)
        
        if results:
            print(f"✓ Retrieved {len(results)} results")
            for i, ctx in enumerate(results, 1):
                print(f"  Result {i}:")
                print(f"    - Anchor ID: {ctx.anchor_id[:8]}...")
                print(f"    - Score: {ctx.score:.4f}")
                print(f"    - Content Preview: {ctx.anchor_content[:80]}...")
            return True
        else:
            print("✗ No results returned")
            return False
            
    except Exception as e:
        print(f"✗ Vector search failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_hybrid_search(retriever, patient_id):
    """Test hybrid search (dense + sparse fusion) on a different query."""
    print("\n--- Test 2: Hybrid Search (Dense + Sparse Fusion) ---")

    query = "patient vitals and labs"
    print(f"Query: '{query}'")

    try:
        results = retriever.search(patient_id, query, limit=2)

        if results:
            print(f"✓ Retrieved {len(results)} results")
            for i, ctx in enumerate(results, 1):
                print(f"  Result {i}:")
                print(f"    - Anchor ID: {ctx.anchor_id[:8]}...")
                print(f"    - Score: {ctx.score:.4f}")
            return True
        else:
            print("✗ No results returned")
            return False
            
    except Exception as e:
        print(f"✗ Hybrid search failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_patient_isolation(retriever):
    """Test that patient_id filtering prevents cross-patient data leakage."""
    print("\n--- Test 3: Patient Isolation (Security) ---")
    
    fake_patient_id = str(uuid.uuid4())
    query = "glucose"
    
    try:
        results = retriever.search(fake_patient_id, query, limit=5)
        
        if len(results) == 0:
            print("✓ Patient isolation working: No results for non-existent patient")
            return True
        else:
            print(f"✗ SECURITY ISSUE: Retrieved {len(results)} results for non-existent patient!")
            return False
            
    except Exception as e:
        print(f"✗ Patient isolation test failed: {e}")
        return False

def main():
    print("="*60)
    print("Hybrid Retrieval Service Verification (Ticket 2.1)")
    print("="*60)
    
    # Initialize Retriever
    print("\nInitializing HybridRetriever...")
    try:
        retriever = HybridRetriever()
        print("✓ HybridRetriever initialized")
    except Exception as e:
        print(f"✗ Failed to initialize retriever: {e}")
        return 1
    
    # Setup Test Data
    patient_id = setup_test_data()
    if not patient_id:
        print("\n✗ Test data setup failed. Cannot proceed.")
        return 1
    
    print(f"\nTest Patient ID: {patient_id}")
    
    # Run Tests
    test_results = []
    test_results.append(test_vector_search(retriever, patient_id))
    test_results.append(test_hybrid_search(retriever, patient_id))
    test_results.append(test_patient_isolation(retriever))
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    passed = sum(test_results)
    total = len(test_results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("\n✓ All tests passed! Hybrid Retrieval Service is operational.")
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
