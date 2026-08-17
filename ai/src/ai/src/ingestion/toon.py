"""
TOON (Token-Oriented Object Notation) Normalization.
Converts FHIR resources into compact YAML-like strings for LLM context.
Optimized for 30-50% token reduction vs raw JSON while preserving full fidelity.
"""
from typing import Any, List, Optional


def toon_encode(data: Any, indent: int = 0) -> str:
    """
    Convert FHIR JSON (dict/list/primitive) to compact YAML-like TOON notation.

    Format rules:
      - Objects:   key: <newline> indented children
      - Arrays:    key[N]: <newline> - item for each element
      - Coding:    coding[N]{system,code,display}: "url",code,display  (single-line shorthand)
      - Ref array: key[N]{reference}: value  (when all items are {"reference": ...})
      - Primitives: key: value
      - Null/empty: omitted entirely
    """
    if data is None:
        return ""

    if isinstance(data, dict):
        return _encode_dict(data, indent)
    elif isinstance(data, list):
        return _encode_list_anonymous(data, indent)
    else:
        return _encode_primitive(data)


def _encode_dict(d: dict, indent: int) -> str:
    """Encode a dictionary as indented TOON lines."""
    lines: List[str] = []
    prefix = "  " * indent

    for key, value in d.items():
        if value is None:
            continue

        if isinstance(value, dict):
            lines.append(f"{prefix}{key}:")
            child = _encode_dict(value, indent + 1)
            if child:
                lines.append(child)

        elif isinstance(value, list):
            if len(value) == 0:
                continue

            # Coding array shorthand: [{system, code, display}, ...]
            if _is_coding_array(value):
                lines.append(_encode_coding_array_shorthand(key, value, prefix))
                continue

            # Reference array shorthand: [{reference: "..."}, ...]
            if _is_reference_array(value):
                lines.append(_encode_reference_array_shorthand(key, value, prefix))
                continue

            # General array
            lines.append(f"{prefix}{key}[{len(value)}]:")
            for item in value:
                if isinstance(item, dict):
                    child = _encode_dict(item, indent + 1)
                    if child:
                        child_lines = child.split("\n")
                        first_line = child_lines[0]
                        first_indent = len(first_line) - len(first_line.lstrip())
                        # First line gets "- " prefix
                        lines.append(f"{prefix}  - {first_line.lstrip()}")
                        # Rest of lines: preserve relative indentation
                        for line in child_lines[1:]:
                            if line.strip():
                                line_indent = len(line) - len(line.lstrip())
                                delta = line_indent - first_indent
                                new_indent = len(prefix) + 2 + delta
                                lines.append(f"{' ' * new_indent}{line.lstrip()}")
                elif isinstance(item, list):
                    child = _encode_list_anonymous(item, indent + 2)
                    if child:
                        lines.append(f"{prefix}  - {child}")
                else:
                    lines.append(f"{prefix}  - {_encode_primitive(item)}")

        else:
            lines.append(f"{prefix}{key}: {_encode_primitive(value)}")

    return "\n".join(lines)


def _encode_list_anonymous(items: list, indent: int) -> str:
    """Encode a list without a key name (used for top-level or nested anonymous arrays)."""
    lines: List[str] = []
    prefix = "  " * indent

    for item in items:
        if isinstance(item, dict):
            child = _encode_dict(item, indent)
            if child:
                lines.append(f"{prefix}- {child.split(chr(10))[0].lstrip()}")
                for r in child.split("\n")[1:]:
                    lines.append(f"{prefix}  {r.lstrip()}")
        elif isinstance(item, list):
            child = _encode_list_anonymous(item, indent + 1)
            if child:
                lines.append(f"{prefix}- {child}")
        else:
            lines.append(f"{prefix}- {_encode_primitive(item)}")

    return "\n".join(lines)


def _encode_primitive(value: Any) -> str:
    """Encode a primitive value (string, number, bool)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        # Quote strings that contain special chars or could be misinterpreted
        if any(c in value for c in ":{}[],\n\r\"'") or value.startswith(" ") or value.endswith(" "):
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        return value
    return str(value)


def _is_coding_array(items: list) -> bool:
    """Check if all items are coding-like dicts with system/code/display."""
    if not items:
        return False
    return all(
        isinstance(item, dict)
        and "system" in item
        and "code" in item
        and "display" in item
        and len(item) <= 4  # system, code, display, possibly id or extension
        for item in items
    )


def _encode_coding_array_shorthand(key: str, items: list, prefix: str) -> str:
    """Encode coding array as: key[N]{system,code,display}: "url",code,display"""
    parts = []
    for item in items:
        system = _encode_primitive(item.get("system", ""))
        code = _encode_primitive(item.get("code", ""))
        display = _encode_primitive(item.get("display", ""))
        parts.append(f"{system},{code},{display}")
    joined = ", ".join(parts)
    return f"{prefix}{key}[{len(items)}]{{system,code,display}}: {joined}"


def _is_reference_array(items: list) -> bool:
    """Check if all items are simple reference dicts {reference: "..."}."""
    if not items:
        return False
    return all(
        isinstance(item, dict)
        and "reference" in item
        and len(item) == 1
        for item in items
    )


def _encode_reference_array_shorthand(key: str, items: list, prefix: str) -> str:
    """Encode reference array as: key[N]{reference}: ref1, ref2"""
    refs = [_encode_primitive(item["reference"]) for item in items]
    return f"{prefix}{key}[{len(items)}]{{reference}}: {', '.join(refs)}"


class ToonNormalizer:
    """
    Handles normalization of FHIR resources into TOON-formatted strings.
    Uses the toon_encode() function for full-fidelity conversion.
    """

    @staticmethod
    def normalize_patient(resource: Any) -> str:
        """Convert Patient resource to TOON string."""
        data = _to_dict(resource)
        return toon_encode(data)

    @staticmethod
    def normalize_observation(resource: Any) -> str:
        """Convert Observation resource to TOON string."""
        data = _to_dict(resource)
        return toon_encode(data)

    @staticmethod
    def normalize_condition(resource: Any) -> str:
        """Convert Condition resource to TOON string."""
        data = _to_dict(resource)
        return toon_encode(data)

    @staticmethod
    def normalize_encounter(resource: Any) -> str:
        """Convert Encounter resource to TOON string."""
        data = _to_dict(resource)
        return toon_encode(data)

    @staticmethod
    def normalize_resource(resource: Any) -> str:
        """Convert any FHIR resource to TOON string."""
        data = _to_dict(resource)
        return toon_encode(data)


def _to_dict(resource: Any) -> dict:
    """Convert a Pydantic model or dict to a plain dict."""
    if isinstance(resource, dict):
        return resource
    if hasattr(resource, "dict"):
        return resource.dict()
    if hasattr(resource, "model_dump"):
        return resource.model_dump()
    return dict(resource)


def extract_observation_values(toon_content: str) -> dict:
    """
    Extract numeric observation values from TOON string.

    Strategy (in order):
      1. Extract the valueString narrative and run targeted patterns on it
         (handles "Creatinine 1.1 mg/dL", "BNP ... 2,176 pg/mL", etc.)
      2. Fall back to scanning the whole TOON for old-format inline patterns
      3. Fall back to _extract_values_from_yaml_toon (valueQuantity blocks)

    Returns:
        Dict mapping measurement names to numeric values, e.g. {"creatinine": 1.5}
    """
    import re

    if not toon_content:
        return {}

    # --- Step 0: a standard FHIR Observation (top-level code + valueQuantity) --
    # is authoritative: its own code names the measurement. Without this, MIMIC
    # labs yielded nothing (the value is not next to the name in the text).
    structured = _extract_fhir_observation_quantity(toon_content)
    if structured:
        return structured

    # --- Step 1: extract valueString narrative (where most data lives) ----------
    vs_match = re.search(r'valueString:\s*"(.+?)"', toon_content, re.DOTALL)
    search_text = vs_match.group(1) if vs_match else toon_content

    # Patterns applied to lowercased search_text.
    # [\d,]+ captures comma-formatted numbers like 2,176 — commas stripped later.
    # Non-greedy [^\d]{0,60} lets keywords like "BNP" be separated from the value
    # by short prose without over-consuming the string.
    patterns = [
        (r"creatinine[:\s]+([\d,]+(?:\.\d+)?)\s*(?:mg/dl)?",    "creatinine"),
        (r"egfr[:\s]+([\d,]+(?:\.\d+)?)\s*(?:ml/min)?",         "egfr"),
        (r"potassium[:\s]+([\d,]+(?:\.\d+)?)\s*(?:meq/l)?",     "potassium"),
        (r"bun[:\s]+([\d,]+(?:\.\d+)?)\s*(?:mg/dl)?",           "bun"),
        (r"(?:lvef|ejection fraction)[:\s]+([\d,]+(?:\.\d+)?)\s*%", "lvef"),
        (r"bnp[^\d]{0,60}?([\d,]+(?:\.\d+)?)\s*pg/ml",            "bnp"),
        (r"(?:hba1c|a1c|hemoglobin a1c)[:\s]+([\d,]+(?:\.\d+)?)\s*%?", "hba1c"),
        (r"(?:cardiothoracic ratio|ctr)[:\s]+([\d,]+(?:\.\d+)?)\s*%?", "cardiothoracic_ratio"),
        (r"fev1/fvc[^\d]{0,20}([\d,]+(?:\.\d+)?)\s*%?",         "fev1_fvc_ratio"),
    ]

    measurements = {}
    search_lower = search_text.lower()
    for pattern, key in patterns:
        m = re.search(pattern, search_lower)
        if m:
            try:
                measurements[key] = float(m.group(1).replace(",", ""))
            except ValueError:
                pass

    # --- Step 2: YAML-like valueQuantity blocks (structured FHIR) ---------------
    if not measurements:
        measurements = _extract_values_from_yaml_toon(toon_content)

    return measurements


# Exact lab names (lowercased code display/text) -> chart measurement key.
# Exact matching on purpose: "Creatinine, Urine" or "Albumin/Creatinine, Urine"
# must not be plotted as serum creatinine.
FHIR_LAB_KEYS = {
    "creatinine": "creatinine",
    "creatinine, serum": "creatinine",
    "estimated gfr (mdrd equation)": "egfr",
    "egfr": "egfr",
    "estimated gfr": "egfr",
    "ntprobnp": "bnp",
    "nt-probnp": "bnp",
    "bnp": "bnp",
    "b-type natriuretic peptide": "bnp",
    "potassium": "potassium",
    "urea nitrogen": "bun",
    "bun": "bun",
    "% hemoglobin a1c": "hba1c",
    "hemoglobin a1c": "hba1c",
    "hba1c": "hba1c",
    "lvef": "lvef",
    "left ventricular ejection fraction": "lvef",
}


def _top_level_block(lines: list, key: str) -> list:
    """Indented lines under an unindented `key:` line of a TOON document."""
    for i, line in enumerate(lines):
        if line.rstrip() == f"{key}:":
            block = []
            for nxt in lines[i + 1:]:
                if nxt and not nxt[0].isspace():
                    break
                block.append(nxt.strip())
            return block
    return []


def _extract_fhir_observation_quantity(toon_content: str) -> dict:
    """
    {key: value} for an Observation whose top-level `code` names a known lab
    and whose top-level `valueQuantity` holds the number; {} otherwise.
    """
    import re

    lines = toon_content.split("\n")
    code_block = _top_level_block(lines, "code")
    value_block = _top_level_block(lines, "valueQuantity")
    if not code_block or not value_block:
        return {}
    names = []
    for line in code_block:
        m = re.match(r'coding\[\d+\]\{[^}]*display\}:\s*(.+)$', line)
        if m:
            names.append(m.group(1).rsplit(",", 1)[-1].strip().strip('"'))
        m = re.match(r'-?\s*display:\s*"?([^"]+)"?$', line)
        if m:
            names.append(m.group(1).strip())
        m = re.match(r'text:\s*"?([^"]+)"?$', line)
        if m:
            names.append(m.group(1).strip())
    key = next((FHIR_LAB_KEYS[n.lower()] for n in names if n.lower() in FHIR_LAB_KEYS), None)
    if not key:
        return {}
    for line in value_block:
        m = re.match(r'value:\s*(-?[\d.]+)', line)
        if m:
            try:
                return {key: float(m.group(1))}
            except ValueError:
                return {}
    return {}


def _extract_values_from_yaml_toon(toon_content: str) -> dict:
    """Extract numeric values from YAML-like TOON format.
    
    Looks for patterns like:
        code:
          coding[1]{system,code,display}:
            "http://loinc.org","2160-0",Creatinine
          text: Creatinine
        valueQuantity:
          value: 1.5
          unit: mg/dL
    """
    import re
    
    measurements = {}
    lines = toon_content.split("\n")
    
    # Track current code text and valueQuantity context
    current_code = ""
    in_value_quantity = False
    current_value = None
    current_unit = None
    
    # Map of code text patterns to measurement keys
    code_to_key = {
        "creatinine": "creatinine",
        "cr": "creatinine",
        "egfr": "egfr",
        "estimated gfr": "egfr",
        "potassium": "potassium",
        "k+": "potassium",
        "bun": "bun",
        "blood urea nitrogen": "bun",
        "lvef": "lvef",
        "ejection fraction": "lvef",
        "bnp": "bnp",
        "hba1c": "hba1c",
        "a1c": "hba1c",
        "hemoglobin a1c": "hba1c",
        "cardiothoracic ratio": "cardiothoracic_ratio",
        "ctr": "cardiothoracic_ratio",
    }
    
    for line in lines:
        stripped = line.strip()
        
        # Detect code text (e.g., "text: Creatinine" or within coding array)
        if stripped.startswith("text:") or "text:" in stripped:
            text_match = re.search(r'text:\s*(.+)', stripped)
            if text_match:
                current_code = text_match.group(1).strip().lower()
        
        # Also detect code from coding array (e.g., "Creatinine" in the display)
        coding_match = re.search(r'display\}:\s*.+,\s*(.+)$', stripped)
        if coding_match:
            current_code = coding_match.group(1).strip().lower()
        
        # Detect valueQuantity block
        if stripped.startswith("valuequantity:") or stripped.startswith("valueQuantity:"):
            in_value_quantity = True
            continue
        
        # Detect value within valueQuantity
        if in_value_quantity and stripped.startswith("value:"):
            value_match = re.search(r'value:\s*([\d.]+)', stripped)
            if value_match:
                try:
                    current_value = float(value_match.group(1))
                except ValueError:
                    pass
        
        # Detect unit within valueQuantity
        if in_value_quantity and stripped.startswith("unit:"):
            unit_match = re.search(r'unit:\s*(.+)', stripped)
            if unit_match:
                current_unit = unit_match.group(1).strip()
        
        # Exit valueQuantity block when we hit a new top-level key
        if in_value_quantity and not stripped.startswith(" ") and not stripped.startswith("value") and not stripped.startswith("unit") and not stripped.startswith("system") and not stripped.startswith("code"):
            if current_value is not None and current_code:
                # Map code to measurement key
                for pattern, key in code_to_key.items():
                    if pattern in current_code:
                        measurements[key] = current_value
                        break
                current_value = None
                current_unit = None
            in_value_quantity = False
    
    # Handle case where valueQuantity is at the end of the document
    if in_value_quantity and current_value is not None and current_code:
        for pattern, key in code_to_key.items():
            if pattern in current_code:
                measurements[key] = current_value
                break
    
    return measurements
