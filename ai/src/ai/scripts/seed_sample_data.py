#!/usr/bin/env python3
"""
Seed Sample Clinical Data into Qdrant
Creates test data for MedGemma RAG testing.
"""
import sys
from pathlib import Path
import logging
from datetime import datetime, timezone

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fhir.resources.patient import Patient
from fhir.resources.observation import Observation
from fhir.resources.condition import Condition
from fhir.resources.medicationrequest import MedicationRequest
from src.ingestion.service import IngestionService
from src.shared.db_clients import qdrant_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def ensure_collection_exists():
    """Ensure Qdrant collection exists."""
    from qdrant_client.models import Distance, VectorParams
    
    client = qdrant_client.connect()
    collection_name = qdrant_client.collection_name
    
    collections = client.get_collections().collections
    if not any(c.name == collection_name for c in collections):
        logger.info(f"Creating collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=768,  # ModernPubMedBERT dimension
                distance=Distance.COSINE
            )
        )
        logger.info(f" Collection created: {collection_name}")
    else:
        logger.info(f" Collection exists: {collection_name}")


def create_sample_patients():
    """Create sample patients."""
    patients = []
    
    # Patient 1: Diabetes patient
    patients.append(Patient(**{
        "id": "patient-001",
        "name": [{
            "use": "official",
            "family": "Johnson",
            "given": ["Sarah"]
        }],
        "gender": "female",
        "birthDate": "1965-03-15",
        "identifier": [{
            "system": "http://hospital.example.org/patient-id",
            "value": "P001"
        }]
    }))
    
    # Patient 2: Hypertension patient
    patients.append(Patient(**{
        "id": "patient-002",
        "name": [{
            "use": "official",
            "family": "Williams",
            "given": ["Michael"]
        }],
        "gender": "male",
        "birthDate": "1958-07-22",
        "identifier": [{
            "system": "http://hospital.example.org/patient-id",
            "value": "P002"
        }]
    }))
    
    # Patient 3: General checkup
    patients.append(Patient(**{
        "id": "patient-003",
        "name": [{
            "use": "official",
            "family": "Davis",
            "given": ["Emily"]
        }],
        "gender": "female",
        "birthDate": "1990-11-08",
        "identifier": [{
            "system": "http://hospital.example.org/patient-id",
            "value": "P003"
        }]
    }))
    
    return patients


def create_sample_observations():
    """Create sample observations."""
    observations = []
    
    # Patient 1 - Glucose test (high)
    observations.append(Observation(**{
        "id": "obs-001",
        "status": "final",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "2339-0",
                "display": "Glucose [Mass/volume] in Blood"
            }],
            "text": "Blood Glucose"
        },
        "subject": {"reference": "Patient/patient-001"},
        "effectiveDateTime": "2026-01-15T10:30:00Z",
        "valueQuantity": {
            "value": 180,
            "unit": "mg/dL",
            "system": "http://unitsofmeasure.org",
            "code": "mg/dL"
        }
    }))
    
    # Patient 1 - HbA1c (elevated)
    observations.append(Observation(**{
        "id": "obs-002",
        "status": "final",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "4548-4",
                "display": "Hemoglobin A1c/Hemoglobin.total in Blood"
            }],
            "text": "HbA1c"
        },
        "subject": {"reference": "Patient/patient-001"},
        "effectiveDateTime": "2026-01-15T10:30:00Z",
        "valueQuantity": {
            "value": 7.2,
            "unit": "%",
            "system": "http://unitsofmeasure.org",
            "code": "%"
        }
    }))
    
    # Patient 2 - Blood pressure (high)
    observations.append(Observation(**{
        "id": "obs-003",
        "status": "final",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "85354-9",
                "display": "Blood pressure panel"
            }],
            "text": "Blood Pressure"
        },
        "subject": {"reference": "Patient/patient-002"},
        "effectiveDateTime": "2026-01-20T14:00:00Z",
        "component": [
            {
                "code": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "8480-6",
                        "display": "Systolic blood pressure"
                    }]
                },
                "valueQuantity": {
                    "value": 150,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]"
                }
            },
            {
                "code": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "8462-4",
                        "display": "Diastolic blood pressure"
                    }]
                },
                "valueQuantity": {
                    "value": 95,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]"
                }
            }
        ]
    }))
    
    # Patient 3 - Normal vitals
    observations.append(Observation(**{
        "id": "obs-004",
        "status": "final",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "8867-4",
                "display": "Heart rate"
            }],
            "text": "Heart Rate"
        },
        "subject": {"reference": "Patient/patient-003"},
        "effectiveDateTime": "2026-01-22T09:00:00Z",
        "valueQuantity": {
            "value": 72,
            "unit": "beats/minute",
            "system": "http://unitsofmeasure.org",
            "code": "/min"
        }
    }))
    
    return observations


def create_sample_conditions():
    """Create sample conditions."""
    conditions = []
    
    # Patient 1 - Type 2 Diabetes
    conditions.append(Condition(**{
        "id": "cond-001",
        "clinicalStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active"
            }]
        },
        "verificationStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                "code": "confirmed"
            }]
        },
        "code": {
            "coding": [{
                "system": "http://snomed.info/sct",
                "code": "44054006",
                "display": "Type 2 diabetes mellitus"
            }],
            "text": "Type 2 Diabetes Mellitus"
        },
        "subject": {"reference": "Patient/patient-001"},
        "onsetDateTime": "2020-05-10T00:00:00Z"
    }))
    
    # Patient 2 - Essential Hypertension
    conditions.append(Condition(**{
        "id": "cond-002",
        "clinicalStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active"
            }]
        },
        "verificationStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                "code": "confirmed"
            }]
        },
        "code": {
            "coding": [{
                "system": "http://snomed.info/sct",
                "code": "59621000",
                "display": "Essential hypertension"
            }],
            "text": "Essential Hypertension"
        },
        "subject": {"reference": "Patient/patient-002"},
        "onsetDateTime": "2018-03-15T00:00:00Z"
    }))
    
    return conditions


def main():
    print(" Seeding Sample Clinical Data")
    print("=" * 60)
    
    # Ensure collection exists
    print("\n[1/4] Checking Qdrant collection...")
    try:
        ensure_collection_exists()
    except Exception as e:
        logger.error(f"Failed to setup collection: {e}")
        print("\n Make sure Qdrant is running: docker-compose up -d qdrant")
        return 1
    
    # Create and ingest patients
    print("\n[2/4] Creating patients...")
    patients = create_sample_patients()
    for patient in patients:
        try:
            IngestionService.ingest_resource(patient)
            print(f"   {patient.name[0].given[0]} {patient.name[0].family}")
        except Exception as e:
            logger.error(f"Failed to ingest patient {patient.id}: {e}")
    
    # Create and ingest observations
    print("\n[3/4] Creating observations...")
    observations = create_sample_observations()
    for obs in observations:
        try:
            IngestionService.ingest_resource(obs)
            display = obs.code.text or obs.code.coding[0].display
            print(f"   {display} ({obs.id})")
        except Exception as e:
            logger.error(f"Failed to ingest observation {obs.id}: {e}")
    
    # Create and ingest conditions
    print("\n[4/4] Creating conditions...")
    conditions = create_sample_conditions()
    for cond in conditions:
        try:
            IngestionService.ingest_resource(cond)
            print(f"   {cond.code.text} ({cond.id})")
        except Exception as e:
            logger.error(f"Failed to ingest condition {cond.id}: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print(" Sample data seeded successfully!")
    print(f"   • {len(patients)} patients")
    print(f"   • {len(observations)} observations")
    print(f"   • {len(conditions)} conditions")
    print("\n Next steps:")
    print("   • Run: ./scripts/launch_medgemma_rag.sh")
    print("   • Open: http://localhost:8501")
    print("   • Try queries like:")
    print("     - 'What are the symptoms of diabetes?'")
    print("     - 'Show me patient-001 glucose levels'")
    print("     - 'What conditions does patient-002 have?'")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
