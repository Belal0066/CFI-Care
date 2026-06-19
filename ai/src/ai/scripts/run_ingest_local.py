import sys
import os
import json
import logging
from fhir.resources.encounter import Encounter

# Add src to path
sys.path.insert(0, os.getcwd())

# Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ManualIngest")

from src.ingestion.service import IngestionService
from src.shared.db_clients import qdrant_client

def run_manual_ingest():
    print("Running manual ingestion to verify Hybrid/TOON pipeline...")
    
    # 1. Verification Data (From User Prompt)
    raw_json = """
    {"resourceType": "Encounter", "id": "enc-00e4115f-c28a-4365-8b66-cbf24435bf38", "meta": {"versionId": "4", "lastUpdated": "2026-01-25T00:31:11.253+02:00"}, "text": {"status": "generated", "div": "<div xmlns=\\\"http://www.w3.org/1999/xhtml\\\">Encounter: Patient condition improved significantly</div>"}, "status": "completed", "class": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "IMP", "display": "inpatient encounter"}]}], "type": [{"coding": [{"system": "http://snomed.info/sct", "code": "390906007", "display": "Follow-up encounter"}]}], "serviceType": [{"concept": {"coding": [{"system": "http://snomed.info/sct", "code": "408443003", "display": "Follow-up service"}]}}], "subject": {"reference": "Patient/pat-001"}, "episodeOfCare": [{"reference": "EpisodeOfCare/eoc-4c6444dc-4b19-4467-84cf-71b67833987e"}], "actualPeriod": {"start": "2025-12-22T00:00:00.000Z", "end": "2025-12-22T00:00:00.000Z"}, "reason": [{"value": [{"concept": {"coding": [{"system": "http://snomed.info/sct", "code": "185349003", "display": "Patient condition improved significantly"}], "text": "Patient condition improved significantly"}}]}]}
    """
    
    try:
        data = json.loads(raw_json)
        enc = Encounter(**data)
        
        # 2. Ingest
        print(f"Ingesting Encounter {enc.id}...")
        success = IngestionService.ingest_resource(enc)
        
        if success:
            print("✓ Ingestion Successful!")
            
            # 3. Verify Retrieval (Hybrid)
            print("\nVerifying Retrieval...")
            client = qdrant_client.connect()
            # We can't use HybridRetriever easily without mocking/setup, but we can check the point directly
            points = client.retrieve(
                collection_name="clinical_embeddings",
                ids=[enc.id]
            )
            
            if points:
                p = points[0]
                print(f"✓ Point Found in Qdrant")
                print(f"  ID: {p.id}")
                print(f"  Content: {p.payload.get('toon_content')}")
                print(f"  Dense Vector: {'Yes' if 'text-dense' in p.vector else 'No'}")
                print(f"  Sparse Vector: {'Yes' if 'text-sparse' in p.vector else 'No'}")
            else:
                print("✗ Point NOT found in Qdrant after ingest.")
                
        else:
            print("✗ Ingestion Failed (Service returned False)")
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_manual_ingest()
