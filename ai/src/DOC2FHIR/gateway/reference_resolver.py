from __future__ import annotations

from typing import Any


def _ref(resource_id: str) -> str:
    return f"urn:uuid:{resource_id}"


class ReferenceResolver:
    def __init__(self, patient_id: str | None, encounter_id: str | None, external_patient_id: str | None = None):
        self.patient_id = patient_id
        self.encounter_id = encounter_id
        self.external_patient_id = external_patient_id

    def apply(self, resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for res in resources:
            if not isinstance(res, dict):
                continue
            rtype = res.get("resourceType")
            if not rtype:
                continue

            if not self.patient_id:
                continue

            if rtype not in {
                "Observation",
                "Condition",
                "MedicationRequest",
                "AllergyIntolerance",
                "Procedure",
                "DiagnosticReport",
                "DocumentReference",
                "Encounter",
                "Composition",
            }:
                continue

            if self.external_patient_id:
                if rtype == "AllergyIntolerance":
                    res["patient"] = {"reference": f"Patient/{self.external_patient_id}"}
                elif rtype == "Composition":
                    ref = {"reference": f"Patient/{self.external_patient_id}"}
                    res["subject"] = [ref]
                    res["author"] = [ref]
                else:
                    res["subject"] = {"reference": f"Patient/{self.external_patient_id}"}
            else:
                if rtype == "AllergyIntolerance":
                    if not isinstance(res.get("patient"), dict):
                        res["patient"] = {"reference": _ref(self.patient_id)}
                elif rtype == "Composition":
                    pass
                else:
                    subject = res.get("subject")
                    if subject is None or (isinstance(subject, list) and not subject):
                        res["subject"] = {"reference": _ref(self.patient_id)}

            if self.encounter_id and rtype in {"Observation", "Condition", "Procedure"}:
                if not isinstance(res.get("encounter"), dict):
                    res["encounter"] = {"reference": _ref(self.encounter_id)}

        return resources

    @staticmethod
    def to_bundle(resources: list[dict[str, Any]], should_skip_patient: bool = False) -> dict[str, Any]:
        entries = []
        for res in resources:
            if not isinstance(res, dict):
                continue
            rtype = res.get("resourceType")
            if should_skip_patient and rtype == "Patient":
                continue
            entry: dict[str, Any] = {"resource": res}
            rid = res.get("id")
            if rid:
                entry["fullUrl"] = f"urn:uuid:{rid}"
            if rtype:
                entry["request"] = {"method": "POST", "url": rtype}
            entries.append(entry)
        return {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": entries,
        }
