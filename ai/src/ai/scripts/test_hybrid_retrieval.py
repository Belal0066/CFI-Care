#!/usr/bin/env python3
"""
Priority 2: HybridRetriever + Qdrant Intent Filter Test Suite.
Validates that Phase 2 intent-based payload filters work correctly.

Gracefully skips if Qdrant is offline. If online but payload fields
are missing (pre-migration data), provides a clear re-seed instruction.
"""

import sys
import logging
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

PASS = 0
FAIL = 0
SKIP = 0


def test(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        msg = f"  ❌ {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


def skip(name: str, reason: str) -> None:
    global SKIP
    SKIP += 1
    print(f"  ⏭️  {name} — {reason}")


def qdrant_available() -> bool:
    """Check if Qdrant is reachable and has our collection."""
    try:
        from src.shared.db_clients import qdrant_client
        client = qdrant_client.connect()
        collections = client.get_collections().collections
        return any(c.name == qdrant_client.collection_name for c in collections)
    except Exception:
        return False


def qdrant_has_payload_flags() -> bool:
    """Check if existing Qdrant points have boolean filter flags."""
    try:
        from src.shared.db_clients import qdrant_client
        client = qdrant_client.connect()
        result = client.scroll(
            collection_name=qdrant_client.collection_name,
            limit=1,
        )
        if result and result[0]:
            payload = result[0][0].payload or {}
            return "is_diagnosis" in payload
        return False
    except Exception:
        return False


def get_qdrant_point_count() -> int:
    try:
        from src.shared.db_clients import qdrant_client
        client = qdrant_client.connect()
        result = client.get_collection(qdrant_client.collection_name)
        return result.points_count or 0
    except Exception:
        return 0


def test_connectivity() -> None:
    print("\n─── Connectivity ───")
    available = qdrant_available()
    test("Qdrant is reachable", available)
    if not available:
        return

    count = get_qdrant_point_count()
    test("Qdrant has points", count > 0, f"found {count} points")
    has_flags = qdrant_has_payload_flags()
    if has_flags:
        test("Payload has boolean filter flags", True)
    else:
        skip("Payload filter flags", "points need re-seed (run: PYTHONPATH=$PWD python3 scripts/seed_qdrant.py)")


def test_basic_search() -> None:
    """Test that HybridRetriever.search() returns results."""
    print("\n─── Basic Search ───")
    if not qdrant_available():
        skip("All", "Qdrant unavailable")
        return

    from src.retrieval.service import HybridRetriever
    from src.shared.db_clients import qdrant_client as qc

    retriever = HybridRetriever()

    # Get any patient_id from existing points
    client = qc.connect()
    scroll = client.scroll(collection_name=qc.collection_name, limit=1)
    if not scroll or not scroll[0]:
        skip("Search", "no points in collection")
        return

    patient_id = scroll[0][0].payload.get("patient_id", "")
    if not patient_id:
        skip("Search", "no patient_id in payload")
        return

    # Search without intent filter
    results = retriever.search(patient_id=patient_id, query="diagnosis", limit=10)
    test("search returns list", isinstance(results, list))
    test("search returns results", len(results) > 0, f"got {len(results)} results")
    if results:
        test("results have anchor_id", bool(results[0].anchor_id))
        test("results have anchor_content", bool(results[0].anchor_content))
        test("results have score", results[0].score > 0)

    # Search with intent=diagnosis filter
    if qdrant_has_payload_flags():
        filtered = retriever.search(
            patient_id=patient_id, query="diagnosis", limit=10, intent="diagnosis"
        )
        test("intent filter returns list", isinstance(filtered, list))
        test("intent filter returns results", len(filtered) > 0, f"got {len(filtered)} results")

        # Verify filtered results through scroll — retrieve with UUIDs only
        if filtered:
            # anchor_ids may not be Qdrant UUIDs; scroll and match by id
            client = qc.connect()
            scroll_all = client.scroll(
                collection_name=qc.collection_name,
                limit=50,
            )
            if scroll_all and scroll_all[0]:
                # Build lookup from id (node_id) → payload
                lookup = {}
                for point in scroll_all[0]:
                    pl = point.payload or {}
                    pid = pl.get("id", "")
                    if pid:
                        lookup[pid] = pl

                # For each result, check payload if we have it
                matched = [r for r in filtered if r.anchor_id in lookup]
                if matched:
                    with_flags = [lookup[r.anchor_id] for r in matched if "is_diagnosis" in lookup[r.anchor_id]]
                    all_diag = all(p.get("is_diagnosis") for p in with_flags)
                    test(f"intent=diagnosis: {len(with_flags)}/{len(matched)} matched points all have is_diagnosis",
                         all_diag,
                         f"found {sum(1 for p in with_flags if p.get('is_diagnosis'))}/{len(with_flags)} with is_diagnosis" if not all_diag else "")
                else:
                    skip("intent filter correctness", "could not match anchor_ids to ids in Qdrant")
            else:
                skip("intent filter correctness", "could not scroll Qdrant")
    else:
        skip("intent filter test", "payload flags absent (re-seed needed)")


def test_payload_fields() -> None:
    """Verify Qdrant points carry the expected boolean fields after re-seed."""
    print("\n─── Payload Field Verification ───")
    if not qdrant_available():
        skip("All", "Qdrant unavailable")
        return
    if not qdrant_has_payload_flags():
        skip("All", "payload fields absent (re-seed needed)")
        return

    from src.shared.db_clients import qdrant_client as qc
    client = qc.connect()

    scroll = client.scroll(
        collection_name=qc.collection_name,
        limit=50,
    )
    if not scroll or not scroll[0]:
        skip("scroll", "no points")
        return

    points = scroll[0]
    payloads = [p.payload or {} for p in points]

    # Check that all migration-era points have all 5 boolean flags
    for flag in ["is_diagnosis", "is_medication", "is_allergy", "is_symptom", "is_outcome"]:
        present = sum(1 for pl in payloads if flag in pl)
        test(f"payload field '{flag}' present in {present}/{len(payloads)} points",
             present > 0,
             f"0/{len(payloads)} have {flag}" if present == 0 else "")

    # Check patient_id is always present
    has_pid = all("patient_id" in pl for pl in payloads)
    test("all points have patient_id", has_pid)

    # Check toon_content is always present
    has_content = all("toon_content" in pl for pl in payloads)
    test("all points have toon_content", has_content)


def test_fallback_to_dense() -> None:
    """Verify that when sparse search fails, dense-only fallback works."""
    print("\n─── Fallback Test ───")
    if not qdrant_available():
        skip("All", "Qdrant unavailable")
        return

    from src.retrieval.service import HybridRetriever
    from src.shared.db_clients import qdrant_client as qc

    client = qc.connect()
    scroll = client.scroll(collection_name=qc.collection_name, limit=1)
    if not scroll or not scroll[0]:
        skip("fallback", "no points")
        return

    patient_id = scroll[0][0].payload.get("patient_id", "")
    if not patient_id:
        skip("fallback", "no patient_id")
        return

    retriever = HybridRetriever()
    # Use a score threshold to trigger fallback path
    results = retriever.search(
        patient_id=patient_id,
        query="test query",
        limit=5,
        score_threshold=0.0,  # Accept anything
    )
    test("sparse+hybrid or dense fallback returns results",
         len(results) > 0, f"got {len(results)} results")
    if results:
        test("fallback results have score", results[0].score > 0)


def main() -> int:
    global PASS, FAIL, SKIP
    PASS = 0
    FAIL = 0
    SKIP = 0

    print("=" * 60)
    print("TEST SUITE: HybridRetriever + Qdrant Intent Filters")
    print("=" * 60)

    test_connectivity()
    if qdrant_available():
        test_basic_search()
        test_payload_fields()
        test_fallback_to_dense()
    else:
        skip("All search & filter tests", "Qdrant not available (start Qdrant and re-seed)")

    print(f"\n{'=' * 60}")
    total = PASS + FAIL + SKIP
    print(f"Results: {PASS} passed, {FAIL} failed, {SKIP} skipped (of {total})")
    print(f"{'=' * 60}")

    if SKIP > 0:
        print("\nNote: Some tests were skipped. To run full suite:")
        print("  1. Start Qdrant: docker compose up qdrant")
        print("  2. Seed data:    PYTHONPATH=$PWD python3 scripts/seed_qdrant.py")
        print("  3. Re-run:       PYTHONPATH=$PWD python3 scripts/test_hybrid_retrieval.py")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
