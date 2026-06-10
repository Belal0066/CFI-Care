from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class FhirValidator:
    def __init__(self, schema_path: Path, validator_jar: Path | None = None, enable_jar: bool = False):
        self.schema_path = schema_path
        self.validator_jar = validator_jar
        self.enable_jar = enable_jar

    def validate_bundle(self, bundle: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []

        try:
            import jsonschema

            schema = json.loads(self.schema_path.read_text())
            jsonschema.validate(instance=bundle, schema=schema)
        except ImportError:
            warnings.append("jsonschema not installed; schema validation skipped")
        except Exception as exc:
            errors.append(f"Schema validation failed: {exc}")

        if self.enable_jar and self.validator_jar and self.validator_jar.exists():
            jar_errors = self._run_hl7_validator(bundle)
            errors.extend(jar_errors)

        return ValidationResult(ok=not errors, errors=errors, warnings=warnings)

    def _run_hl7_validator(self, bundle: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir) / "bundle.json"
            tmp_path.write_text(json.dumps(bundle))
            cmd = ["java", "-jar", str(self.validator_jar), str(tmp_path)]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    output = (result.stdout + "\n" + result.stderr).strip()
                    if output:
                        errors.append(output[:2000])
                    else:
                        errors.append("FHIR Validator failed with no output")
            except Exception as exc:
                errors.append(f"FHIR Validator error: {exc}")
        return errors
