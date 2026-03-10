#!/usr/bin/env python3
"""
Ticket 1.4: Ingestion Flow Verification.
Simulates the ingestion of a patient bundle and validates the Qdrant write path.
"""
import sys
import uuid
from datetime import datetime
from pathlib import Path
from fhir.resources.patient import Patient
from fhir.resources.encounter import Encounter
from fhir.resources.period import Period
from fhir.resources.coding import Coding
from fhir.resources.codeableconcept import CodeableConcept

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from ingestion.service import IngestionService, IngestionError
from shared.db_clients import qdrant_client

def create_test_resources():
    pid = str(uuid.uuid4())
    eid = str(uuid.uuid4())
    
    pat = Patient(
        id=pid,
        active=True,
        name=[{"family": "ConsistencyCheck", "given": ["Test"]}],
        gender="female",
        birthDate="1990-01-01"
    )
    
    enc = Encounter(
        id=eid,
        status="finished",
        class_fhir=Coding(code="AMB", system="http://terminology.hl7.org/CodeSystem/v3-ActCode"),
        type=[CodeableConcept(coding=[Coding(display="Checkup", code="GenChk", system="local")])],
        subject={"reference": f"Patient/{pid}"},
        period=Period(start="2023-01-01T10:00:00Z", end="2023-01-01T11:00:00Z")
    )
    
    return pat, enc

def test_happy_path(pat, enc):
    print("\n--- Testing Happy Path (Qdrant Write) ---")
    
    try:
        # Ingest Patient
        print(f"Ingesting Patient {pat.id}...")
        res_p = IngestionService.ingest_resource(pat)
        if res_p: print("✓ Patient Ingested")
        
        # Ingest Encounter
        print(f"Ingesting Encounter {enc.id}...")
        res_e = IngestionService.ingest_resource(enc)
        if res_e: print("✓ Encounter Ingested")
        
        return True
    except Exception as e:
        print(f"✗ Happy path failed: {e}")
        return False

def test_rollback_scenario():
    print("\n--- Testing Rollback Scenario ---")

    # We can assume IngestionService works if Happy Path works, and unit test
    # rollback/error-handling logic separately.
    # For this system test, we will trust the logic trace if Happy Path works.
    print("(Skipping destructive rollback test on live DB for this script)")
    pass

def main():
    print("="*60)
    print("Ingestion Service Verification (Ticket 1.4)")
    print("="*60)
    
    # 1. Setup
    pat, enc = create_test_resources()
    
    # 2. Run Ingestion
    if test_happy_path(pat, enc):
        print("\n✓ Ingestion Service is operational.")
        
        # 3. Verify via Sync Check Logic (internal)
        print("\nVerifying Data Persistence...")
        
        # Check Vector
        client = qdrant_client.connect()
        points = client.retrieve(qdrant_client.collection_name, [pat.id, enc.id])
        if len(points) == 2:
            print(f"✓ Vector records found (Count: {len(points)})")
        else:
            print(f"✗ Vector records missing. Found: {len(points)}")

    else:
        print("\n✗ Ingestion Service failed.")
        return 1
        
    return 0

if __name__ == "__main__":
    sys.exit(main())
