from __future__ import annotations

import uuid
from typing import Any

import pytest

from .conftest import (
    ALLERGY_ID,
    COMP_ID,
    DOCUMENT_HASH,
    DR_ID,
    NAMESPACE_PROVENANCE,
    OBS_QTY_ID,
    OBS_STR_ID,
    PATIENT_ID,
)

pytestmark = pytest.mark.standards


def _collect_references(obj: Any, refs: set[str] | None = None) -> set[str]:
    if refs is None:
        refs = set()
    if isinstance(obj, dict):
        ref = obj.get("reference")
        if isinstance(ref, str) and ref.startswith("urn:uuid:"):
            refs.add(ref)
        for v in obj.values():
            _collect_references(v, refs)
    elif isinstance(obj, list):
        for item in obj:
            _collect_references(item, refs)
    return refs


def _full_urls(entries: list[dict[str, Any]]) -> set[str]:
    return {e["fullUrl"] for e in entries if "fullUrl" in e}


class TestBundleStructure:
    def test_no_top_level_extension(self, fhir_bundle: dict[str, Any]) -> None:
        assert "extension" not in fhir_bundle

    def test_unmapped_sections_in_basic_resource(self, fhir_bundle: dict[str, Any]) -> None:
        entries = fhir_bundle.get("entry", [])
        basic_entries = [
            e for e in entries
            if e.get("resource", {}).get("resourceType") == "Basic"
        ]
        assert len(basic_entries) >= 1, "No Basic resource found in bundle"

        for entry in basic_entries:
            resource = entry["resource"]
            code = resource.get("code", {})
            coding = code.get("coding", [])
            codes = {c.get("code") for c in coding}
            assert "unmapped-sections" in codes, (
                f"Basic resource missing unmapped-sections code; got codes: {codes}"
            )
            exts = resource.get("extension", [])
            ext_urls = {e.get("url") for e in exts}
            assert any(
                "unmapped-sections" in url for url in ext_urls
            ), f"No unmapped-sections extension found; urls: {ext_urls}"


class TestAllergyIntoleranceLinting:
    def test_allergy_has_patient_not_subject(self, fhir_bundle: dict[str, Any]) -> None:
        entries = fhir_bundle.get("entry", [])
        allergy_resources = [
            e["resource"] for e in entries
            if e.get("resource", {}).get("resourceType") == "AllergyIntolerance"
        ]
        assert len(allergy_resources) >= 1, "No AllergyIntolerance resource found"

        for res in allergy_resources:
            assert "patient" in res, (
                f"AllergyIntolerance {res.get('id')} missing 'patient' field"
            )
            assert isinstance(res["patient"], dict), (
                f"AllergyIntolerance {res.get('id')} 'patient' must be a dict"
            )
            assert "subject" not in res, (
                f"AllergyIntolerance {res.get('id')} must NOT have 'subject' field (R5 rule)"
            )


class TestObservationCast:
    def test_valueString_is_string_primitive(self, fhir_bundle: dict[str, Any]) -> None:
        entries = fhir_bundle.get("entry", [])
        obs_with_string = [
            e["resource"] for e in entries
            if e.get("resource", {}).get("resourceType") == "Observation"
            and "valueString" in e.get("resource", {})
        ]
        assert len(obs_with_string) >= 1, "No Observation with valueString found"

        for res in obs_with_string:
            val = res["valueString"]
            assert isinstance(val, str), (
                f"Observation {res.get('id')} valueString must be a str, got {type(val).__name__}: {val!r}"
            )


class TestReferenceResolution:
    def test_all_references_resolve_to_entries(self, fhir_bundle: dict[str, Any]) -> None:
        entries = fhir_bundle.get("entry", [])
        urls = _full_urls(entries)
        refs = _collect_references(fhir_bundle)
        unresolved = refs - urls
        assert not unresolved, (
            f"Unresolved urn:uuid: references: {unresolved}"
        )

    def test_provenance_id_is_deterministic_uuid5(self, fhir_bundle: dict[str, Any]) -> None:
        entries = fhir_bundle.get("entry", [])
        provenance_entries = [
            e for e in entries
            if e.get("resource", {}).get("resourceType") == "Provenance"
        ]
        assert len(provenance_entries) >= 1, "No Provenance resource found"

        for entry in provenance_entries:
            prov = entry["resource"]
            prov_id = prov.get("id", "")
            targets = prov.get("target", [])
            entities = prov.get("entity", [])

            doc_hash: str | None = None
            for ent in entities:
                what = ent.get("what", {})
                ident = what.get("identifier", {})
                if ident.get("system") == "http://cfi-care.ai/document-hash":
                    doc_hash = ident.get("value")

            for target in targets:
                ref = target.get("reference", "")
                if ref.startswith("urn:uuid:"):
                    rid = ref[len("urn:uuid:"):]
                    matched_resource_type = None
                    for e in entries:
                        res = e.get("resource", {})
                        if res.get("id") == rid:
                            matched_resource_type = res.get("resourceType")
                            break

                    if matched_resource_type and doc_hash:
                        expected_id = str(uuid.uuid5(
                            NAMESPACE_PROVENANCE,
                            f"Provenance:{matched_resource_type}/{rid}:{doc_hash}",
                        ))
                        assert prov_id == expected_id, (
                            f"Provenance ID mismatch for target {ref}: "
                            f"got {prov_id}, expected {expected_id}"
                        )
