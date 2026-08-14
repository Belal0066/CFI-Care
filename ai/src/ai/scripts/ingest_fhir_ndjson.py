#!/usr/bin/env python3
"""
Bulk-ingest a FHIR NDJSON export (e.g. MIMIC-IV Clinical Database Demo on
FHIR, one gzip NDJSON file per resource profile) into Qdrant.

Each resource becomes points exactly as IngestionService.ingest_resource
would build them (same TOON text, chunking and payload), but embedded and
written in batches.

Loader-level normalisation, applied before indexing:
  * Reference resolution: MIMIC MedicationRequest/-Dispense/-Administration
    point at a shared Medication resource via medicationReference, so the
    drug name is not in the resource itself. The loader fills in the
    standard FHIR Reference.display with the medication's name, so the
    indexed text names the drug.
  * Shared resources with no patient (Medication, Location, Organization)
    are not indexed: every agent query is filtered to one patient, so they
    could never be retrieved.

Usage (inside the eval runner image, Qdrant reachable via QDRANT_HOST):
    python scripts/ingest_fhir_ndjson.py --fhir-dir /data/mimic/fhir \
        --recreate --batch-size 256 --parallel 0 --no-raw --resume
"""
import argparse
import glob
import gzip
import json
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.ingestion.service import IngestionService  # noqa: E402
from src.shared.db_clients import qdrant_client  # noqa: E402

logger = logging.getLogger("ingest_fhir_ndjson")

UNSCOPED_TYPES = {"Medication", "Location", "Organization"}
MEDICATION_NAME_SYSTEM = "mimic-medication-name"
MEDICATION_REF_TYPES = {"MedicationRequest", "MedicationDispense", "MedicationAdministration", "MedicationStatement"}


def iter_ndjson(path: str):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def medication_name(med: dict) -> str | None:
    for ident in med.get("identifier") or []:
        if (ident.get("system") or "").endswith(MEDICATION_NAME_SYSTEM) and ident.get("value"):
            return ident["value"]
    for coding in (med.get("code") or {}).get("coding") or []:
        if coding.get("display"):
            return coding["display"]
    text = (med.get("code") or {}).get("text")
    return text or None


def build_medication_names(files: list[str]) -> dict[str, str]:
    """Medication id -> name, resolving mixes through their ingredients."""
    meds: dict[str, dict] = {}
    for path in files:
        for res in iter_ndjson(path):
            if res.get("resourceType") == "Medication":
                meds[res["id"]] = res
    names: dict[str, str] = {}
    for mid, med in meds.items():
        name = medication_name(med)
        if name:
            names[mid] = name
    for mid, med in meds.items():
        if mid in names:
            continue
        parts = []
        for ing in med.get("ingredient") or []:
            ref = ((ing.get("itemReference") or {}).get("reference") or "")
            ing_id = ref.split("/")[-1]
            if ing_id in names:
                parts.append(names[ing_id])
        if parts:
            names[mid] = " + ".join(parts)
    return names


def resolve_references(res: dict, med_names: dict[str, str]) -> dict:
    if res.get("resourceType") in MEDICATION_REF_TYPES:
        ref = res.get("medicationReference")
        if isinstance(ref, dict) and not ref.get("display"):
            mid = (ref.get("reference") or "").split("/")[-1]
            if mid in med_names:
                ref["display"] = med_names[mid]
    return res


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fhir-dir", required=True, help="Directory of *.ndjson(.gz) files")
    ap.add_argument("--patients", help="Comma-separated Patient ids, or a file with one id per line; default all")
    ap.add_argument("--only-files", help="Comma-separated file-name substrings to include (debug/subsets)")
    ap.add_argument("--batch-size", type=int, default=256, help="Resources per embed+upsert batch")
    ap.add_argument("--embed-batch-size", type=int, default=64)
    ap.add_argument("--parallel", type=int, default=None, help="fastembed data-parallel workers (0 = all cores)")
    ap.add_argument("--no-raw", action="store_true", help="Do not store fhir_raw in the payload (smaller index)")
    ap.add_argument("--recreate", action="store_true", help="Delete and recreate the collection first")
    ap.add_argument("--resume", action="store_true", help="Skip resources already counted in the progress file")
    ap.add_argument("--progress-file", default=None, help="Default: <fhir-dir>/.ingest_progress.json")
    ap.add_argument("--limit", type=int, default=None, help="Stop after this many resources (smoke tests)")
    ap.add_argument("--snapshot", action="store_true", help="Create a Qdrant snapshot when done")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("src.shared.db_clients").setLevel(logging.WARNING)

    files = sorted(glob.glob(os.path.join(args.fhir_dir, "*.ndjson")) + glob.glob(os.path.join(args.fhir_dir, "*.ndjson.gz")))
    if not files:
        logger.error(f"No NDJSON files in {args.fhir_dir}")
        return 1
    if args.only_files:
        wanted = [w.strip() for w in args.only_files.split(",") if w.strip()]
        files = [f for f in files if any(w in os.path.basename(f) for w in wanted)]

    patients = None
    if args.patients:
        if os.path.exists(args.patients):
            patients = {line.strip() for line in open(args.patients) if line.strip()}
        else:
            patients = {p.strip() for p in args.patients.split(",") if p.strip()}

    all_files = sorted(glob.glob(os.path.join(args.fhir_dir, "*.ndjson*")))
    med_names = build_medication_names(all_files)
    logger.info(f"Resolved {len(med_names)} medication names")

    client = qdrant_client.connect()
    if args.recreate:
        client.delete_collection(qdrant_client.collection_name)
        qdrant_client._ensure_collection()
    qdrant_client.ensure_payload_indexes()

    progress_path = args.progress_file or os.path.join(args.fhir_dir, ".ingest_progress.json")
    progress = {}
    if args.resume and os.path.exists(progress_path) and not args.recreate:
        progress = json.load(open(progress_path))

    from src.ingestion.service import _fhir_patient_id

    started = time.time()
    total_resources = 0
    total_points = 0
    skipped_unscoped = 0
    for path in files:
        name = os.path.basename(path)
        done = progress.get(name, 0)
        seen = 0
        batch: list[dict] = []

        def flush():
            nonlocal total_points, batch
            if batch:
                total_points += IngestionService.ingest_fhir_batch(
                    batch, batch_size=args.embed_batch_size, parallel=args.parallel, store_raw=not args.no_raw
                )
                batch = []

        for res in iter_ndjson(path):
            seen += 1
            if seen <= done:
                continue
            if res.get("resourceType") in UNSCOPED_TYPES:
                skipped_unscoped += 1
                continue
            if patients is not None and _fhir_patient_id(res) not in patients:
                continue
            batch.append(resolve_references(res, med_names))
            total_resources += 1
            if len(batch) >= args.batch_size:
                flush()
                progress[name] = seen
                json.dump(progress, open(progress_path, "w"))
                rate = total_resources / max(time.time() - started, 1e-6)
                logger.info(f"{name}: {seen} read, {total_resources} indexed total ({rate:.0f} resources/s)")
            if args.limit and total_resources >= args.limit:
                break
        flush()
        progress[name] = seen
        json.dump(progress, open(progress_path, "w"))
        if args.limit and total_resources >= args.limit:
            break

    elapsed = time.time() - started
    info = client.get_collection(qdrant_client.collection_name)
    logger.info(
        f"Done: {total_resources} resources -> {total_points} points in {elapsed:.0f}s; "
        f"skipped {skipped_unscoped} shared resources; collection has {info.points_count} points"
    )
    if args.snapshot:
        snap = client.create_snapshot(collection_name=qdrant_client.collection_name)
        logger.info(f"Snapshot created: {snap.name if snap else snap}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
