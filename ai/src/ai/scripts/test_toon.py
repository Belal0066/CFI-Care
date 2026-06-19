#!/usr/bin/env python3
"""
Ticket 1.2 Verification: TOON (Object Notation) Comparison.
Verifies the new token-efficient format.
"""
import sys
from pathlib import Path
from fhir.resources.observation import Observation
from fhir.resources.quantity import Quantity
from fhir.resources.coding import Coding
from fhir.resources.codeableconcept import CodeableConcept

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from ingestion.toon import ToonNormalizer, toon_encode

def create_mock_observation(val: float, date: str) -> Observation:
    return Observation(
        status="final",
        code=CodeableConcept(coding=[Coding(display="Glucose", code="2339-0", system="http://loinc.org")]),
        valueQuantity=Quantity(value=val, unit="mg/dL"),
        effectiveDateTime=date
    )

def test_toon_output():
    print("=" * 60)
    print("Testing TOON (Token-Oriented Object Notation) Output")
    print("=" * 60)
    
    obs = create_mock_observation(115.0, "2023-01-01T12:00:00Z")
    
    output = ToonNormalizer.normalize_observation(obs)
    print("\n[TOON Snapshot - Normalize Observation]")
    print(output)
    
    # Verify new YAML-like format markers
    checks = [
        ("resourceType: Observation" in output, "Has resourceType"),
        ("status: final" in output, "Has status"),
        ("Glucose" in output, "Has code display"),
        ("115" in output, "Has numeric value"),
        ("mg/dL" in output, "Has unit"),
    ]
    
    all_passed = all(check[0] for check in checks)
    for passed, desc in checks:
        print(f"{'✓' if passed else '✗'} {desc}")
    
    if all_passed:
        print("\n✓ TOON encoding successful")
    else:
        print("\n✗ TOON encoding failed or format mismatch")
    
    # Test toon_encode with a dict
    print("\n" + "=" * 60)
    print("Testing toon_encode with dict input")
    print("=" * 60)
    
    test_dict = {
        "resourceType": "Encounter",
        "id": "enc-001",
        "status": "completed",
        "class": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "EMER", "display": "emergency"}],
    }
    
    dict_output = toon_encode(test_dict)
    print("\n[TOON Snapshot - Dict Encoding]")
    print(dict_output)
    
    dict_checks = [
        ("resourceType: Encounter" in dict_output, "Has resourceType"),
        ("id: enc-001" in dict_output, "Has id"),
        ("status: completed" in dict_output, "Has status"),
        ("class[1]" in dict_output, "Has array notation"),
        ("system,code,display" in dict_output, "Has coding shorthand"),
    ]
    
    all_dict_passed = all(check[0] for check in dict_checks)
    for passed, desc in dict_checks:
        print(f"{'✓' if passed else '✗'} {desc}")
    
    if all_dict_passed:
        print("\n✓ toon_encode successful")
    else:
        print("\n✗ toon_encode failed or format mismatch")

if __name__ == "__main__":
    test_toon_output()
