#!/usr/bin/env python3
"""
Seeds Andrew Mark's FHIR data (patient 04abfecc-c9c9-46fa-8b92-0429a9e910cc)
from the HAPI FHIR server into Qdrant for the clinical demo.

Usage:
    python scripts/seed_andrew_mark.py
    python scripts/seed_andrew_mark.py --fhir-url http://localhost:8080/fhir
"""
import sys
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

import requests
from src.ingestion.service import IngestionService
from src.shared.db_clients import qdrant_client

PATIENT_ID = "04abfecc-c9c9-46fa-8b92-0429a9e910cc"


def fetch(base: str, path: str) -> dict:
    url = f"{base}/{path.lstrip('/')}"
    r = requests.get(url, headers={"Accept": "application/fhir+json"}, timeout=20)
    r.raise_for_status()
    return r.json()


def ingest_bundle(bundle: dict, label: str) -> int:
    count = 0
    entries = bundle.get("entry", [])
    for entry in entries:
        resource = entry.get("resource")
        if not resource:
            continue
        rt = resource.get("resourceType", "Unknown")
        rid = resource.get("id", "?")
        try:
            ok = IngestionService.ingest_resource(resource)
            if ok:
                count += 1
                logger.info(f"  [OK] {rt}/{rid}")
            else:
                logger.warning(f"  [SKIP] {rt}/{rid}")
        except Exception as e:
            logger.error(f"  [ERR] {rt}/{rid} — {e}")
    logger.info(f"{label}: {count}/{len(entries)} seeded")
    return count


def main(fhir_base: str) -> int:
    logger.info(f"FHIR base: {fhir_base}")
    logger.info(f"Patient:   {PATIENT_ID}")

    total = 0

    # 1. Patient resource
    logger.info("\n--- Patient ---")
    patient = fetch(fhir_base, f"Patient/{PATIENT_ID}")
    ok = IngestionService.ingest_resource(patient)
    total += 1 if ok else 0
    logger.info(f"  [{'OK' if ok else 'SKIP'}] Patient/{PATIENT_ID}")

    # 2. Conditions
    logger.info("\n--- Conditions ---")
    conditions = fetch(fhir_base, f"Condition?subject=Patient/{PATIENT_ID}")
    total += ingest_bundle(conditions, "Conditions")

    # 3. DiagnosticReports (labs + imaging — not in the Redis ingest filter, but
    #    IngestionService itself handles any FHIR resource type)
    logger.info("\n--- DiagnosticReports ---")
    reports = fetch(fhir_base, f"DiagnosticReport?patient=Patient/{PATIENT_ID}")
    total += ingest_bundle(reports, "DiagnosticReports")

    # 4. Encounters — skip auto-generated linker nodes (no clinical content)
    logger.info("\n--- Encounters ---")
    enc_bundle = fetch(fhir_base, f"Encounter?patient={PATIENT_ID}&_count=100")
    clinical = {
        "entry": [
            e for e in enc_bundle.get("entry", [])
            if not e.get("resource", {}).get("id", "").startswith("linker-")
        ]
    }
    total += ingest_bundle(clinical, "Encounters")

    # 5. MedicationRequests
    logger.info("\n--- MedicationRequests ---")
    meds = fetch(fhir_base, f"MedicationRequest?subject=Patient/{PATIENT_ID}")
    total += ingest_bundle(meds, "MedicationRequests")

    # 6. AllergyIntolerance
    logger.info("\n--- AllergyIntolerances ---")
    allergies = fetch(fhir_base, f"AllergyIntolerance?patient=Patient/{PATIENT_ID}")
    total += ingest_bundle(allergies, "AllergyIntolerances")

    # 7. Observations (linked to DiagnosticReports)
    logger.info("\n--- Observations ---")
    obs = fetch(fhir_base, f"Observation?patient=Patient/{PATIENT_ID}&_count=100")
    total += ingest_bundle(obs, "Observations")

    # Verify — do a patient-filtered search in Qdrant to confirm data landed
    logger.info("\n--- Verification ---")
    q_client = qdrant_client.connect()
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    dummy_vec = IngestionService.get_embedding("patient history diagnosis medication")
    hits = q_client.search(
        collection_name=qdrant_client.collection_name,
        query_vector=("text-dense", dummy_vec),
        query_filter=Filter(
            must=[FieldCondition(key="patient_id", match=MatchValue(value=PATIENT_ID))]
        ),
        limit=5,
    )
    logger.info(f"Total resources seeded: {total}")
    logger.info(f"Qdrant sample ({len(hits)} hits):")
    for h in hits:
        snippet = h.payload.get("toon_content", "")[:80].replace("\n", " ")
        logger.info(f"  [{h.score:.3f}] {h.payload.get('resource_type')} — {snippet}")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Andrew Mark FHIR data into Qdrant")
    parser.add_argument(
        "--fhir-url",
        default="http://localhost:8080/fhir",
        help="HAPI FHIR base URL (default: http://localhost:8080/fhir)",
    )
    args = parser.parse_args()
    sys.exit(main(args.fhir_url))
