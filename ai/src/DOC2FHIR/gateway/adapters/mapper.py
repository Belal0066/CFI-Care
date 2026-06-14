"""Mapper adapter for llama.cpp OpenAI-compatible service."""

from __future__ import annotations

import time
import re
from typing import Any, Optional

import httpx


class MapperError(Exception):
    """Base Mapper adapter exception."""

    def __init__(
        self,
        message: str,
        retry_allowed: bool = True,
        original_error: Exception | None = None,
    ):
        self.message = message
        self.retry_allowed = retry_allowed
        self.original_error = original_error
        super().__init__(message)


class MapperValidationError(MapperError):
    """FHIR validation error."""

    pass


class MapperOutput:
    """Normalized Mapper output."""

    def __init__(
        self,
        fhir_bundle: dict[str, Any],
        raw_response: str,
        processing_time_sec: float,
        model_name: str | None = None,
    ):
        self.fhir_bundle = fhir_bundle
        self.raw_response = raw_response
        self.processing_time_sec = processing_time_sec
        self.model_name = model_name or "unknown"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "fhir_bundle": self.fhir_bundle,
            "raw_response": self.raw_response,
            "processing_time_sec": self.processing_time_sec,
            "model_name": self.model_name,
        }


class MapperAdapter:
    """Client for llama.cpp OpenAI-compatible inference service."""

    def __init__(
        self,
        base_url: str,
        model_name: str = "default",
        timeout_sec: int = 600,
        max_retries: int = 2,
    ):
        """Initialize Mapper adapter.

        Args:
            base_url: Base URL for Mapper service (e.g., http://127.0.0.1:8080)
            model_name: Model identifier for logging
            timeout_sec: Request timeout in seconds
            max_retries: Maximum retries for transient failures
        """
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_sec = timeout_sec
        self.max_retries = max_retries

    def map_to_fhir(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> MapperOutput:
        """Map OCR output to FHIR bundle.

        Args:
            ocr_text: Extracted text from OCR stage
            metadata: Optional job metadata for context

        Returns:
            MapperOutput with FHIR bundle

        Raises:
            MapperError: If mapping fails after retries
            MapperValidationError: If FHIR bundle is invalid
        """
        if not ocr_text or not ocr_text.strip():
            raise MapperError(
                "OCR text is empty",
                retry_allowed=False,
            )

        attempt = 0
        last_error = None

        while attempt <= self.max_retries:
            try:
                return self._call_mapper_service(ocr_text, metadata)
            except MapperError as exc:
                last_error = exc
                if not exc.retry_allowed or attempt >= self.max_retries:
                    raise
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1
            except Exception as exc:
                mapper_error = MapperError(
                    f"Mapper service error: {str(exc)}",
                    retry_allowed=attempt < self.max_retries,
                    original_error=exc,
                )
                last_error = mapper_error
                if not mapper_error.retry_allowed:
                    raise mapper_error
                time.sleep(1.0 * (2 ** attempt))
                attempt += 1

        if last_error:
            raise last_error
        raise MapperError("Mapper processing failed")

    def _call_mapper_service(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> MapperOutput:
        """Make the actual call to the Mapper service.

        Args:
            ocr_text: Extracted text from OCR
            metadata: Optional context

        Returns:
            MapperOutput with FHIR bundle

        Raises:
            MapperError: On service or validation errors
        """
        start_time = time.time()
        url = f"{self.base_url}/v1/chat/completions"

        # Build the prompt for FHIR mapping
        prompt = self._build_fhir_prompt(ocr_text, metadata)

        try:
            payload = {
                "model": self.model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a healthcare data mapping expert. Convert the provided medical document text into a valid FHIR R5 JSON bundle. Return only valid JSON, no markdown. DO NOT output any reasoning, thinking process or explanations. Start immediately with {. The Bundle MUST be of type 'collection'. Do not use non-standard resource types like ClinicalNote. Use valid FHIR R5 resources like DocumentReference, DiagnosticReport, Patient, Observation, Condition, Medication, Encounter, Procedure, AllergyIntolerance, or CarePlan.\n\nCRITICAL R5 STRUCTURAL RULES:\n1. DiagnosticReport and Observation MUST include a code CodeableConcept with at least one coding.\n2. Every DomainResource MUST include text.div narrative with exactly one root <div xmlns=\"http://www.w3.org/1999/xhtml\"> element.\n3. DocumentReference.status MUST be 'current'.\n4. Patient.telecom entries MUST NOT have null values. Omit telecom entries where value is unknown.\n5. Patient.telecom.use must be one of: home, work, temp, old, mobile.\n6. Observation MUST have at least one of: valueQuantity, valueCodeableConcept, valueString, valueBoolean, valueInteger, valueRange, or valueRatio. Do NOT create Observations with only a code and no value.\n7. Observation.valueQuantity.unit must use valid UCUM codes (e.g., 'mg/dL', 'mm[Hg]', 'kg', 'cm', 'Cel', '%').\n8. Any dateTime field with a time component (like effectiveDateTime, issued, birthDate) MUST include a timezone offset (e.g., '2024-01-15T10:30:00+02:00').\n9. DocumentReference MUST have a 'content' array with at least one entry containing an 'attachment' object.\n10. Encounter.class MUST be an array of CodeableConcept objects, NOT a single object.\n11. Encounter.status must use R5 values: 'planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'on-hold', or 'completed'. Do NOT use 'finished'.\n12. Do NOT place 'reference', 'display', 'system', 'code', or 'period' properties directly on a resource. They must be nested inside their proper parent objects (e.g., subject.reference).\n13. DiagnosticReport.effectiveDateTime and issued must include timezone.\n14. For Condition, include 'clinicalStatus' and 'verificationStatus'.\n15. DocumentReference.type should use doc-typecodes (e.g., LOINC 11502-2 for laboratory reports).\n\nIf generating a 'text.div' narrative, it MUST be wrapped in exactly ONE root <div xmlns=\"http://www.w3.org/1999/xhtml\"> element, with no multiple xml roots.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                "temperature": 0.1,  # Low temperature for deterministic output
                "max_tokens": 8000,
            }

            with httpx.Client(timeout=self.timeout_sec) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()

            result = response.json()
            processing_time = time.time() - start_time

            # Extract response content
            if "choices" not in result or not result["choices"]:
                raise MapperError(
                    "Mapper returned empty response",
                    retry_allowed=False,
                )

            # Gemma might put the answer in reasoning_content if it was cut off or confused.
            msg = result["choices"][0].get("message", {})
            raw_content = msg.get("content", "")
            reasoning_content = msg.get("reasoning_content", "")
            
            raw_response = raw_content if raw_content.strip() else reasoning_content

            if not raw_response:
                raise MapperError(
                    "No content in Mapper response",
                    retry_allowed=False,
                )

            # Parse and validate FHIR bundle
            fhir_bundle = self._extract_and_validate_fhir(raw_response)

            return MapperOutput(
                fhir_bundle=fhir_bundle,
                raw_response=raw_response,
                processing_time_sec=processing_time,
                model_name=result.get("model", self.model_name),
            )

        except httpx.TimeoutException as exc:
            raise MapperError(
                f"Mapper service timeout after {self.timeout_sec}s",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except (httpx.NetworkError, httpx.ConnectError) as exc:
            raise MapperError(
                f"Cannot reach Mapper service at {url}",
                retry_allowed=True,
                original_error=exc,
            ) from exc
        except httpx.HTTPStatusError as exc:
            retry_allowed = 500 <= exc.response.status_code < 600
            raise MapperError(
                f"Mapper service returned {exc.response.status_code}",
                retry_allowed=retry_allowed,
                original_error=exc,
            ) from exc

    def _build_fhir_prompt(self, ocr_text: str, metadata: dict[str, Any] | None = None) -> str:
        """Build a prompt for FHIR mapping.

        Args:
            ocr_text: Extracted text
            metadata: Optional context

        Returns:
            Formatted prompt string
        """
        lines = [
            "Convert the following medical document text into a FHIR R5 JSON bundle.",
            "Output a Bundle of type 'collection'.",
            "Include appropriate resources (Patient, Observation, Condition, Medication, DocumentReference, DiagnosticReport, Encounter, Procedure, AllergyIntolerance, etc.).",
            "Ensure all resources have valid identifiers and required fields.",
            "DiagnosticReport and Observation must include code.coding with at least one coding.",
            "Include text.div narratives for every DomainResource.",
            "DocumentReference.status must be 'current'.",
            "Patient.telecom.use must be one of: home, work, temp, old, mobile.",
            "Observation.valueQuantity.unit must use UCUM codes (e.g., mg/dL, mmol/L, Cel).",
            "For Condition, include 'clinicalStatus' and 'verificationStatus' as required by R5.",
            "Never use hallucinated resource types like 'ClinicalNote'.",
            "Return ONLY valid JSON.",
            "",
            "Medical Document Text:",
            "---",
            ocr_text[:5000],  # Limit context to prevent huge prompts
            "---",
        ]

        if metadata:
            if "patient_id" in metadata:
                lines.append(f"Patient ID: {metadata['patient_id']}")
            if "source" in metadata:
                lines.append(f"Document Source: {metadata['source']}")

        return "\n".join(lines)

    def _extract_and_validate_fhir(self, response_text: str) -> dict[str, Any]:
        """Extract and validate FHIR bundle from response."""
        import json
        import uuid
        import re

        text = response_text.strip()
        
        # Try to extract JSON from markdown code block first
        match = re.search(r'```(?:json)?\s*(\{.*\}|\[.*\])\s*```', text, re.DOTALL)
        if match:
            text = match.group(1).strip()
        else:
            # Fallback: find the outermost JSON object in case there's leading/trailing text
            start_idx = text.find('{')
            end_idx = text.rfind('}')
            list_start_idx = text.find('[')
            list_end_idx = text.rfind(']')
            
            # Use whichever bounds look like they enclose the outer structure
            if start_idx != -1 and end_idx != -1 and (list_start_idx == -1 or start_idx < list_start_idx):
                text = text[start_idx:end_idx+1]
            elif list_start_idx != -1 and list_end_idx != -1:
                text = text[list_start_idx:list_end_idx+1]

        # Sanitize non-standard JSON tokens the LLM may produce
        text = re.sub(r'\bNULL\b', 'null', text)
        text = re.sub(r'\bTRUE\b', 'true', text)
        text = re.sub(r'\bFALSE\b', 'false', text)

        try:
            bundle = json.loads(text)
        except json.JSONDecodeError as exc:
            raise MapperValidationError(
                f"Failed to parse FHIR response as JSON: {str(exc)}\nSnippet: {text[:100]}...",
                original_error=exc,
            ) from exc

        if not isinstance(bundle, dict) or "resourceType" not in bundle:
            raise MapperValidationError("FHIR bundle must be a JSON object with resourceType")

        if bundle.get("resourceType") == "Bundle":
            bundle["type"] = "transaction"
            entries = bundle.get("entry", [])
            if isinstance(entries, list):
                # Pre-processing: fix common LLM structural errors before URN assignment
                entries = self._fix_r5_common_errors(entries)

                ref_map = {}
                valid_entries = []
                
                # 1. Assign URN UUIDs
                for entry in entries:
                    res = entry.get("resource")
                    if not isinstance(res, dict): continue
                    
                    res_type = res.get("resourceType")
                    if not res_type: continue
                        
                    new_uuid = str(uuid.uuid4())
                    urn = f"urn:uuid:{new_uuid}"
                    
                    old_id = str(res.get("id", ""))
                    old_full_url = str(entry.get("fullUrl", ""))
                    if old_id:
                        ref_map[old_id] = urn
                        ref_map[f"{res_type}/{old_id}"] = urn
                        ref_map[f"#{old_id}"] = urn
                    if old_full_url:
                        ref_map[old_full_url] = urn
                        
                    res["id"] = new_uuid
                    entry["fullUrl"] = urn
                    entry["request"] = {"method": "POST", "url": res_type}
                    valid_entries.append(entry)
                    
                bundle["entry"] = valid_entries
                
                # 2. Re-map references and remove dangling ones
                def sanitize_refs(node):
                    if isinstance(node, dict):
                        to_delete = []
                        for k, v in list(node.items()):
                            if k == "reference" and isinstance(v, str):
                                if v in ref_map:
                                    node[k] = ref_map[v]
                                elif not v.startswith("urn:uuid:") and not v.startswith("http"):
                                    to_delete.append(k)
                            elif isinstance(v, (dict, list)):
                                sanitize_refs(v)
                        for k in to_delete:
                            del node[k]
                    elif isinstance(node, list):
                        for item in node:
                            sanitize_refs(item)
                
                sanitize_refs(bundle)

                # 3. Ensure XHTML narrative strings are well-formed for HAPI parsing
                def normalize_xhtml(html: str) -> str:
                    def self_close_void(match: re.Match) -> str:
                        raw = match.group(0)
                        if raw.endswith("/>"):
                            return raw
                        return raw[:-1] + "/>"

                    fixed = re.sub(r"<\s*br\s*/?>", "<br/>", html, flags=re.IGNORECASE)
                    for tag in ("hr", "img", "input", "meta", "link", "base", "area", "col", "param", "source", "track", "wbr"):
                        fixed = re.sub(rf"<\s*{tag}(\s[^>]*)?>", self_close_void, fixed, flags=re.IGNORECASE)
                    return fixed

                def sanitize_xhtml(node):
                    if isinstance(node, dict):
                        for k, v in list(node.items()):
                            if k == "div" and isinstance(v, str) and "<div" in v:
                                node[k] = normalize_xhtml(v)
                            elif isinstance(v, (dict, list)):
                                sanitize_xhtml(v)
                    elif isinstance(node, list):
                        for item in node:
                            sanitize_xhtml(item)

                sanitize_xhtml(bundle)

                # 4. Sanitize attachments (strip whitespace, remove invalid base64)
                def sanitize_attachments(node):
                    import base64

                    if isinstance(node, dict):
                        attachment = node.get("attachment")
                        if isinstance(attachment, dict):
                            data = attachment.get("data")
                            if isinstance(data, str):
                                data = "".join(data.split())
                                attachment["data"] = data
                                try:
                                    base64.b64decode(data, validate=True)
                                except Exception:
                                    attachment.pop("data", None)
                        for v in node.values():
                            sanitize_attachments(v)
                    elif isinstance(node, list):
                        for item in node:
                            sanitize_attachments(item)

                sanitize_attachments(bundle)

        return bundle

    @staticmethod
    def _fix_r5_common_errors(entries: list[dict]) -> list[dict]:
        """Fix common R5 structural errors the LLM produces.

        Fixes:
        - Patient.telecom entries with null values
        - Patient.telecom.use normalization to allowed values
        - Encounter.class as Object → Array
        - Encounter.status 'finished' → 'completed'
        - Observations without values (obs-3 constraint)
        - Observation and DiagnosticReport missing code
        - Observation units normalized to UCUM
        - DocumentReference.status enforced to current
        - Ensure text.div narratives for DomainResource
        - effectiveDateTime without timezone
        - DocumentReference without content
        - Orphan properties on resource root (reference, display, system, code, period)
        """
        def ensure_codeable_concept(resource: dict[str, Any], default_text: str) -> None:
            code = resource.get("code")
            if not isinstance(code, dict):
                code = {"text": default_text}
                resource["code"] = code

            has_coding = isinstance(code.get("coding"), list) and len(code.get("coding")) > 0
            has_inline_coding = any(key in code for key in ("system", "code", "display"))
            if not has_coding and has_inline_coding:
                inline = {k: code.get(k) for k in ("system", "code", "display") if code.get(k) is not None}
                code["coding"] = [inline]
                for k in ("system", "code", "display"):
                    code.pop(k, None)

            coding = code.get("coding")
            if not isinstance(coding, list) or not coding:
                code["coding"] = [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-NullFlavor",
                        "code": "UNK",
                        "display": "Unknown",
                    }
                ]

            if not code.get("text"):
                code["text"] = default_text

        def ensure_codeable_concept_field(resource: dict[str, Any], field: str) -> None:
            value = resource.get(field)
            if not isinstance(value, dict):
                return
            if "coding" in value:
                return
            if any(k in value for k in ("system", "code", "display")):
                text = value.get("text")
                coding = {k: value.get(k) for k in ("system", "code", "display") if value.get(k) is not None}
                resource[field] = {"coding": [coding]}
                if text:
                    resource[field]["text"] = text

        def normalize_codeable_concept_list(resource: dict[str, Any], field: str) -> None:
            value = resource.get(field)
            if not isinstance(value, list):
                return
            normalized = []
            for item in value:
                if isinstance(item, dict):
                    if "coding" not in item and any(k in item for k in ("system", "code", "display")):
                        text = item.get("text")
                        coding = {k: item.get(k) for k in ("system", "code", "display") if item.get(k) is not None}
                        wrapper = {"coding": [coding]}
                        if text:
                            wrapper["text"] = text
                        normalized.append(wrapper)
                        continue
                    if "coding" not in item and "text" not in item and any(k in item for k in ("reference", "display")):
                        display = item.get("display") or item.get("reference")
                        normalized.append({"text": display})
                        continue
                    if "coding" not in item and "text" not in item and "display" in item:
                        normalized.append({"text": item.get("display")})
                        continue
                normalized.append(item)
            resource[field] = normalized

        def ensure_narrative(resource: dict[str, Any], res_type: str) -> None:
            text = resource.get("text")
            if not isinstance(text, dict) or not isinstance(text.get("div"), str):
                resource["text"] = {
                    "status": "generated",
                    "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">{res_type}</div>",
                }

        def normalize_telecom_use(raw_use: str | None) -> str:
            if not raw_use:
                return "home"
            val = str(raw_use).strip().lower()
            if val in {"home", "work", "temp", "old", "mobile"}:
                return val
            if val in {"cell", "cellular", "phone", "tel", "telephone"}:
                return "mobile"
            if val in {"office", "workplace"}:
                return "work"
            if val in {"temporary", "temp"}:
                return "temp"
            if val in {"former", "previous", "old"}:
                return "old"
            return "home"

        def normalize_ucum_unit(raw_unit: str | None) -> tuple[str | None, str | None]:
            if not raw_unit:
                return None, None

            unit = str(raw_unit).strip()
            unit_norm = unit.lower().replace(" ", "")

            unit_map = {
                "mg/dl": "mg/dL",
                "g/dl": "g/dL",
                "mmol/l": "mmol/L",
                "umol/l": "umol/L",
                "mmhg": "mm[Hg]",
                "kg": "kg",
                "g": "g",
                "cm": "cm",
                "mm": "mm",
                "%": "%",
                "fl": "fL",
                "pg": "pg",
                "u/l": "U/L",
                "iu/l": "IU/L",
                "cel": "Cel",
                "c": "Cel",
                "°c": "Cel",
                "10^3/ul": "10*3/uL",
                "x10^3/ul": "10*3/uL",
                "10^6/ul": "10*6/uL",
                "10^9/l": "10*9/L",
                "cells/ul": "10*6/uL",
                "cells/µl": "10*6/uL",
                "cells/mcl": "10*6/uL",
                "cells/ul": "10*6/uL",
            }

            mapped = unit_map.get(unit_norm)
            if mapped:
                return mapped, mapped

            return None, None

        def normalize_value_quantity(value_quantity: dict[str, Any]) -> None:
            if not isinstance(value_quantity, dict):
                return

            raw_unit = value_quantity.get("unit") or value_quantity.get("code")
            unit, code = normalize_ucum_unit(raw_unit)
            if unit and code:
                value_quantity["unit"] = unit
                value_quantity["system"] = "http://unitsofmeasure.org"
                value_quantity["code"] = code

        def normalize_datetime_field(resource: dict[str, Any], field: str) -> None:
            value = resource.get(field)
            if not isinstance(value, str):
                return
            if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
                resource[field] = value + "T00:00:00+00:00"
            elif "T" in value and "+" not in value and "Z" not in value:
                resource[field] = value + "+00:00"

        orphan_keys = {"reference", "display", "system", "code", "period"}
        cleaned = []

        patient_ref: str | None = None
        for entry in entries:
            res = entry.get("resource") if isinstance(entry, dict) else None
            if not isinstance(res, dict):
                continue
            if res.get("resourceType") == "Patient":
                full_url = entry.get("fullUrl")
                if isinstance(full_url, str) and full_url:
                    patient_ref = full_url
                else:
                    patient_id = res.get("id")
                    if isinstance(patient_id, str) and patient_id:
                        patient_ref = f"Patient/{patient_id}"
                if patient_ref:
                    break

        for entry in entries:
            res = entry.get("resource") if isinstance(entry, dict) else None
            if not isinstance(res, dict):
                cleaned.append(entry)
                continue

            res_type = res.get("resourceType", "")

            # Remove orphan properties from resource root
            for key in orphan_keys:
                if key in res:
                    del res[key]

            if res_type == "Patient":
                # Remove telecom entries with null/empty values
                telecom = res.get("telecom", [])
                if isinstance(telecom, list):
                    cleaned_telecom = []
                    for t in telecom:
                        if not isinstance(t, dict):
                            continue
                        if t.get("value") is None or t.get("value") == "":
                            continue
                        t["use"] = normalize_telecom_use(t.get("use"))
                        cleaned_telecom.append(t)
                    res["telecom"] = cleaned_telecom

            elif res_type == "Encounter":
                # Fix class: Object → Array
                cls = res.get("class")
                if isinstance(cls, dict):
                    res["class"] = [cls]
                elif isinstance(cls, list):
                    res["class"] = [c if isinstance(c, dict) else {"coding": [{"code": str(c)}]} for c in cls]

                normalize_codeable_concept_list(res, "class")
                normalize_codeable_concept_list(res, "type")
                ensure_codeable_concept_field(res, "serviceType")
                normalize_codeable_concept_list(res, "reasonCode")

                allowed_class_codes = {
                    "AMB", "EMER", "FLD", "HH", "IMP", "OBSENC", "PRENC", "SS",
                }
                classes = res.get("class")
                if isinstance(classes, list):
                    for cc in classes:
                        if not isinstance(cc, dict):
                            continue
                        coding = cc.get("coding")
                        if not isinstance(coding, list):
                            continue
                        for cod in coding:
                            if not isinstance(cod, dict):
                                continue
                            if cod.get("system") == "http://terminology.hl7.org/CodeSystem/v3-ActCode":
                                if cod.get("code") not in allowed_class_codes:
                                    cod["code"] = "AMB"
                                    cod["display"] = "Ambulatory"

                # Fix status: 'finished' → 'completed'
                if res.get("status") == "finished":
                    res["status"] = "completed"

                # Fix effectiveDateTime without timezone
                for dt_field in ("period",):
                    period = res.get(dt_field)
                    if isinstance(period, dict):
                        for k in ("start", "end"):
                            val = period.get(k)
                            if isinstance(val, str):
                                if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
                                    period[k] = val + "T00:00:00+00:00"
                                elif "T" in val and "+" not in val and "Z" not in val:
                                    period[k] = val + "+00:00"

            elif res_type == "Observation":
                # Remove Observations without any value field (obs-3 constraint)
                value_fields = [
                    "valueQuantity", "valueCodeableConcept", "valueString",
                    "valueBoolean", "valueInteger", "valueRange", "valueRatio",
                    "valueSampledData", "valueTime", "valueDateTime", "valuePeriod",
                    "valueAttachment", "valueReference",
                ]
                has_value = any(res.get(f) is not None for f in value_fields)
                if not has_value:
                    continue

                ensure_codeable_concept(res, "Unknown observation")
                normalize_codeable_concept_list(res, "category")
                ensure_codeable_concept_field(res, "method")
                ensure_codeable_concept_field(res, "bodySite")
                normalize_codeable_concept_list(res, "interpretation")

                if not res.get("status"):
                    res["status"] = "final"
                # Normalize invalid referenceRange items
                ref_ranges = res.get("referenceRange")
                if isinstance(ref_ranges, list):
                    cleaned_ranges = []
                    for rr in ref_ranges:
                        if not isinstance(rr, dict):
                            continue
                        if "reference" in rr or "display" in rr:
                            text = rr.get("display") or rr.get("reference") or "Reference range"
                            rr = {"text": text}
                        if any(rr.get(k) for k in ("low", "high", "text")):
                            cleaned_ranges.append(rr)
                    if cleaned_ranges:
                        res["referenceRange"] = cleaned_ranges
                    else:
                        res.pop("referenceRange", None)

                if isinstance(res.get("valueQuantity"), dict):
                    normalize_value_quantity(res["valueQuantity"])
                components = res.get("component")
                if isinstance(components, list):
                    for component in components:
                        if isinstance(component, dict) and isinstance(component.get("valueQuantity"), dict):
                            normalize_value_quantity(component["valueQuantity"])

                # Fix effectiveDateTime without timezone
                for dt_field in ("effectiveDateTime", "issued"):
                    normalize_datetime_field(res, dt_field)
                period = res.get("effectivePeriod")
                if isinstance(period, dict):
                    for k in ("start", "end"):
                        inner = period.get(k)
                        if isinstance(inner, str):
                            if re.match(r"^\d{4}-\d{2}-\d{2}$", inner):
                                period[k] = inner + "T00:00:00+00:00"
                            elif "T" in inner and "+" not in inner and "Z" not in inner:
                                period[k] = inner + "+00:00"

            elif res_type == "DiagnosticReport":
                ensure_codeable_concept(res, "Unknown report")
                if not res.get("status"):
                    res["status"] = "final"
                res.pop("diagnosis", None)
                res.pop("clinicalStatus", None)
                res.pop("interpretation", None)
                res.pop("valueCodeableConcept", None)
                res.pop("content", None)
                normalize_codeable_concept_list(res, "category")
                # Fix effectiveDateTime without timezone
                for dt_field in ("effectiveDateTime", "issued"):
                    normalize_datetime_field(res, dt_field)

            elif res_type == "DocumentReference":
                if res.get("status") != "current":
                    res["status"] = "current"

                ensure_codeable_concept_field(res, "type")
                ensure_codeable_concept_field(res, "category")
                normalize_codeable_concept_list(res, "category")

                # Normalize DocumentReference.type to doc-typecodes (LOINC)
                type_cc = res.get("type")
                if isinstance(type_cc, dict):
                    coding = type_cc.get("coding")
                    if not isinstance(coding, list) or not coding:
                        type_cc["coding"] = [
                            {
                                "system": "http://loinc.org",
                                "code": "11502-2",
                                "display": "Laboratory report",
                            }
                        ]
                    else:
                        for idx, cod in enumerate(coding):
                            if not isinstance(cod, dict):
                                continue
                            if cod.get("system") == "http://terminology.hl7.org/CodeSystem/v3-ActCode":
                                coding[idx] = {
                                    "system": "http://loinc.org",
                                    "code": "11502-2",
                                    "display": "Laboratory report",
                                }

                # Map effectiveDateTime/issued -> date and remove invalid fields
                date_val = res.get("issued") or res.get("effectiveDateTime")
                if date_val and not res.get("date"):
                    res["date"] = date_val
                normalize_datetime_field(res, "date")
                res.pop("effectiveDateTime", None)
                res.pop("issued", None)

                # Remove DocumentReferences without content (will be populated by _attach_pdf_to_bundle)
                content = res.get("content")
                if not isinstance(content, list) or len(content) == 0:
                    # Keep it — _attach_pdf_to_bundle will add content
                    pass
                else:
                    cleaned_content = []
                    for item in content:
                        if not isinstance(item, dict):
                            continue
                        item.pop("format", None)
                        attachment = item.get("attachment")
                        if isinstance(attachment, dict):
                            data = attachment.get("data")
                            if isinstance(data, str):
                                data = "".join(data.split())
                                attachment["data"] = data
                                try:
                                    import base64

                                    base64.b64decode(data, validate=True)
                                except Exception:
                                    attachment.pop("data", None)
                        cleaned_content.append(item)
                    res["content"] = cleaned_content

            elif res_type == "Condition":
                ensure_codeable_concept_field(res, "clinicalStatus")
                ensure_codeable_concept_field(res, "verificationStatus")
                ensure_codeable_concept_field(res, "severity")
                normalize_codeable_concept_list(res, "category")
                normalize_codeable_concept_list(res, "bodySite")

                if not isinstance(res.get("subject"), dict) and patient_ref:
                    res["subject"] = {"reference": patient_ref}

                verification = res.get("verificationStatus")
                if isinstance(verification, dict):
                    coding = verification.get("coding")
                    if isinstance(coding, list) and coding:
                        allowed = {"unconfirmed", "provisional", "differential", "confirmed", "refuted", "entered-in-error"}
                        for item in coding:
                            if not isinstance(item, dict):
                                continue
                            if item.get("system") == "http://terminology.hl7.org/CodeSystem/condition-ver-status":
                                if item.get("code") not in allowed:
                                    item["code"] = "unconfirmed"
                                    item["display"] = "Unconfirmed"

                # Fix effectiveDateTime without timezone
                for dt_field in ("onsetDateTime", "abatementDateTime", "recordedDate"):
                    normalize_datetime_field(res, dt_field)

            if res_type and res_type != "Bundle":
                ensure_narrative(res, res_type)

            cleaned.append(entry)

        return cleaned
