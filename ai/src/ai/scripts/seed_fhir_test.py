#!/usr/bin/env python3
"""
FHIR Test Data Seeding Script for Ticket 1.1.
Posts a sample FHIR Patient Bundle to verify ingestion.
"""
import sys
import requests
import json
from pathlib import Path
from datetime import datetime, timezone

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from shared.config import config


def create_test_patient_bundle():
    """
    Create a minimal FHIR R4 Patient Bundle for testing.
    Demonstrates HL7 FHIR R4 compliance.
    """
    bundle = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [
            {
                "fullUrl": "urn:uuid:test-patient-001",
                "resource": {
                    "resourceType": "Patient",
                    "id": "test-patient-001",
                    "identifier": [
                        {
                            "system": "http://clinical-copilot.example.org/patient-id",
                            "value": "TEST-001"
                        }
                    ],
                    "name": [
                        {
                            "use": "official",
                            "family": "TestPatient",
                            "given": ["Clinical", "Demo"]
                        }
                    ],
                    "gender": "other",
                    "birthDate": "1975-05-15",
                    "active": True
                },
                "request": {
                    "method": "PUT",
                    "url": "Patient/test-patient-001"
                }
            },
            {
                "fullUrl": "urn:uuid:test-observation-001",
                "resource": {
                    "resourceType": "Observation",
                    "id": "test-observation-001",
                    "status": "final",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "2339-0",
                                "display": "Glucose [Mass/volume] in Blood"
                            }
                        ]
                    },
                    "subject": {
                        "reference": "Patient/test-patient-001"
                    },
                    "effectiveDateTime": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "valueQuantity": {
                        "value": 140,
                        "unit": "mg/dL",
                        "system": "http://unitsofmeasure.org",
                        "code": "mg/dL"
                    }
                },
                "request": {
                    "method": "PUT",
                    "url": "Observation/test-observation-001"
                }
            }
        ]
    }
    return bundle


def post_bundle(bundle):
    """Post FHIR Bundle to HAPI FHIR server."""
    try:
        print(f"Posting Bundle to {config.fhir_base_url}")
        response = requests.post(
            config.fhir_base_url,
            json=bundle,
            headers={"Content-Type": "application/fhir+json"},
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            print("✓ FHIR Bundle posted successfully")
            print(f"  Response: {response.status_code}")
            
            # Pretty print response
            result = response.json()
            print("\nBundle Response:")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"✗ FHIR POST failed: {response.status_code}")
            print(f"  Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ FHIR POST exception: {e}")
        return False


def verify_patient():
    """Verify the test patient can be retrieved."""
    try:
        response = requests.get(
            f"{config.fhir_base_url}/Patient/test-patient-001",
            timeout=5
        )
        if response.status_code == 200:
            print("\n✓ Test patient retrieval successful")
            patient = response.json()
            print(f"  Patient ID: {patient.get('id')}")
            print(f"  Name: {patient.get('name', [{}])[0].get('given', [])} {patient.get('name', [{}])[0].get('family', '')}")
            return True
        else:
            print(f"\n✗ Patient retrieval failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"\n✗ Patient retrieval exception: {e}")
        return False


def main():
    """Run FHIR seeding test."""
    print("=" * 60)
    print("FHIR Test Data Seeding (Ticket 1.1 Verification)")
    print("=" * 60)
    
    # Create and post bundle
    bundle = create_test_patient_bundle()
    if not post_bundle(bundle):
        return 1
    
    # Verify patient
    if not verify_patient():
        return 1
    
    print("\n" + "=" * 60)
    print("✓ FHIR ingestion test completed successfully")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
