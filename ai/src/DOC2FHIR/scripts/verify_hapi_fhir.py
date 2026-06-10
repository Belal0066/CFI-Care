#!/usr/bin/env python3
"""Verify HAPI FHIR integration by pushing a test bundle and retrieving results.

Usage:
    python verify_hapi_fhir.py                          # Uses default http://127.0.0.1:8080/fhir
    python verify_hapi_fhir.py --base-url http://...    # Custom HAPI FHIR URL
    python verify_hapi_fhir.py --bundle path/to/b.json  # Custom bundle file

Requires:
    - HAPI FHIR JPA Server running locally (see docker command below)
    - httpx installed (already in gateway venv)

Docker command to start HAPI FHIR:
    docker run -d --name hapi-fhir -p 8090:8080 \
      -e hapi.fhir.tester_enabled=false \
      -e hapi.fhir.server_address=http://localhost:8080/fhir \
      hapiproject/hapi:latest
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Allow running from anywhere under DOC2FHIR
_SCRIPT_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _SCRIPT_DIR.parent
sys.path.insert(0, str(_ROOT_DIR))

from gateway.adapters.hapi_fhir import (
    HapiFhirDownstreamAdapter,
    HapiFhirDownstreamError,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Verify HAPI FHIR integration")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8090/fhir",
        help="HAPI FHIR base URL (default: http://127.0.0.1:8090/fhir)",
    )
    parser.add_argument(
        "--bundle",
        default=str(_SCRIPT_DIR / "test_bundle.json"),
        help="Path to FHIR Transaction Bundle JSON file",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP timeout in seconds (default: 60)",
    )
    args = parser.parse_args()

    base_url: str = args.base_url
    bundle_path: str = args.bundle
    timeout: int = args.timeout

    print(f"HAPI FHIR base URL: {base_url}")
    print(f"Bundle file:        {bundle_path}")
    print(f"Timeout:            {timeout}s")
    print()

    # Load bundle
    bundle_file = Path(bundle_path)
    if not bundle_file.exists():
        print(f"ERROR: Bundle file not found: {bundle_path}")
        sys.exit(1)

    with open(bundle_file, "r") as f:
        bundle_data = json.load(f)

    bundle_type = bundle_data.get("type", "unknown")
    entry_count = len(bundle_data.get("entry", []))
    print(f"Bundle type:   {bundle_type}")
    print(f"Entry count:   {entry_count}")
    print()

    # List resources
    print("Resources in bundle:")
    for entry in bundle_data.get("entry", []):
        res = entry.get("resource", {})
        res_type = res.get("resourceType", "?")
        res_id = res.get("id", "?")
        display = res.get("name", [{}])[0].get("given", [""])[0] if res_type == "Patient" else res.get("code", {}).get("text", "")
        print(f"  - {res_type}/{res_id}  {display}")
    print()

    # Instantiate adapter
    adapter = HapiFhirDownstreamAdapter(
        base_url=base_url,
        timeout_sec=timeout,
        max_retries=2,
    )

    # Deliver bundle
    print("=" * 60)
    print("STEP 1: Delivering FHIR Transaction Bundle to HAPI FHIR")
    print("=" * 60)
    print()

    try:
        result = await adapter.deliver_fhir_bundle(
            job_id="verify-test",
            fhir_bundle=bundle_data,
        )
    except HapiFhirDownstreamError as exc:
        print(f"FAILED: {exc.message}")
        if exc.original_error:
            print(f"  Original error: {exc.original_error}")
        sys.exit(1)

    print(f"Status code:       {result.status_code}")
    print(f"Delivery time:     {result.delivery_time_sec:.2f}s")
    print(f"Success:           {result.success}")
    print(f"Created resources: {len(result.created_resources)}")
    print()

    if result.created_resources:
        print("Created resource locations:")
        for loc in result.created_resources:
            print(f"  - {loc}")
        print()

    # Show response bundle summary
    resp_bundle = result.response_body
    resp_type = resp_bundle.get("resourceType", "?")
    resp_id = resp_bundle.get("id", "?")
    print(f"Response bundle: {resp_type}/{resp_id}")
    resp_entries = resp_bundle.get("entry", [])
    print(f"Response entries: {len(resp_entries)}")
    for entry in resp_entries:
        resp_info = entry.get("response", {})
        status = resp_info.get("status", "?")
        location = resp_info.get("location", "?")
        print(f"  [{status}] {location}")
    print()

    # Verify first created resource
    if result.created_resources:
        first_resource = result.created_resources[0]
        print("=" * 60)
        print(f"STEP 2: Retrieving created resource: {first_resource}")
        print("=" * 60)
        print()

        try:
            resource = await adapter.verify_resource(first_resource)
        except HapiFhirDownstreamError as exc:
            print(f"FAILED to retrieve resource: {exc.message}")
            sys.exit(1)

        res_type = resource.get("resourceType", "?")
        res_id = resource.get("id", "?")
        print(f"Retrieved: {res_type}/{res_id}")
        print()
        print(json.dumps(resource, indent=2))
        print()

    print("=" * 60)
    print("VERIFICATION COMPLETE — HAPI FHIR integration is working")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
