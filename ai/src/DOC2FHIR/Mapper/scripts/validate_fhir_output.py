#!/usr/bin/env python3
"""
Validate FHIR JSON output from Gemma 4 medical prompt.
Uses the sample OCR markdown and reference FHIR bundle to test the prompt behavior.
"""

import json
import sys
import subprocess
from pathlib import Path


def validate_fhir_bundle(bundle_path: str) -> dict:
    """
    Validate a FHIR Bundle JSON file using fhir-validator.
    Returns dict with validation result and any errors.
    """
    # Find fhir-validator in the virtual environment
    root_dir = Path(__file__).parent.parent
    venv_validator = root_dir / "mapper" / "bin" / "fhir-validator"
    
    if not venv_validator.exists():
        return {
            "valid": False,
            "message": "fhir-validator not found",
            "error": f"Ensure fhir-validator is installed. Expected: {venv_validator}",
        }
    
    try:
        result = subprocess.run(
            [str(venv_validator), "--path", bundle_path, "--action", "identify"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if result.returncode == 0:
            return {
                "valid": True,
                "message": f"FHIR Bundle {bundle_path} is valid",
                "output": result.stdout,
            }
        else:
            return {
                "valid": False,
                "message": f"FHIR Bundle validation failed for {bundle_path}",
                "error": result.stderr,
                "output": result.stdout,
            }
    except subprocess.TimeoutExpired:
        return {
            "valid": False,
            "message": "Validation timeout",
            "error": "fhir-validator timed out after 30 seconds",
        }


def validate_json_structure(bundle_data: dict) -> dict:
    """
    Perform structural checks on FHIR Bundle:
    - Has resourceType Bundle
    - Has type (collection or transaction)
    - Has entry array
    - All resources have required fields
    """
    errors = []
    
    if bundle_data.get("resourceType") != "Bundle":
        errors.append("Missing or incorrect resourceType: should be 'Bundle'")
    
    if "type" not in bundle_data:
        errors.append("Missing Bundle type (should be 'collection' or 'transaction')")
    elif bundle_data["type"] not in ["collection", "transaction"]:
        errors.append(f"Invalid Bundle type: {bundle_data['type']}")
    
    if "entry" not in bundle_data:
        errors.append("Missing entry array in Bundle")
        return {"valid": False, "errors": errors}
    
    if not isinstance(bundle_data["entry"], list):
        errors.append("Bundle entry must be an array")
        return {"valid": False, "errors": errors}
    
    # Check each resource in the bundle
    for i, entry in enumerate(bundle_data["entry"]):
        if "resource" not in entry:
            errors.append(f"Entry {i} missing resource object")
            continue
        
        resource = entry["resource"]
        if "resourceType" not in resource:
            errors.append(f"Entry {i}: resource missing resourceType")
        
        if "id" not in resource:
            errors.append(f"Entry {i} ({resource.get('resourceType')}): missing id")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors if errors else [],
        "entry_count": len(bundle_data.get("entry", [])),
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: validate_fhir_output.py <bundle.json>")
        print(r"Example: validate_fhir_output.py data/FHIR/cfi\ care\ scanner-1.json")
        return 1
    
    bundle_path = sys.argv[1]
    
    # Check file exists
    if not Path(bundle_path).exists():
        print(f"Error: File not found: {bundle_path}", file=sys.stderr)
        return 1
    
    # Load JSON
    try:
        with open(bundle_path, "r", encoding="utf-8") as f:
            bundle_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {bundle_path}: {e}", file=sys.stderr)
        return 1
    
    # Run structural validation
    struct_result = validate_json_structure(bundle_data)
    print(json.dumps({"structural_validation": struct_result}, indent=2))
    
    if not struct_result["valid"]:
        print(f"\nStructural validation failed with {len(struct_result['errors'])} error(s).", file=sys.stderr)
        for error in struct_result["errors"]:
            print(f"  - {error}", file=sys.stderr)
        return 1
    
    # Run FHIR validator
    fhir_result = validate_fhir_bundle(bundle_path)
    print(json.dumps({"fhir_validation": fhir_result}, indent=2))
    
    if not fhir_result["valid"]:
        print(f"\nFHIR validation failed.", file=sys.stderr)
        return 1
    
    print("\n✓ All validations passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
