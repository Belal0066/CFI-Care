"""Shared helpers for the evaluation harness: paths, JSONL I/O, answer cleaning."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Iterable, Iterator

EVAL_DIR = Path(__file__).resolve().parent
AI_ROOT = EVAL_DIR.parent
DATA_DIR = EVAL_DIR / "data"
QUESTION_SET = DATA_DIR / "clinical-eval-v1.jsonl"
SPLITS_FILE = DATA_DIR / "splits.json"

# External inputs (mounted in the container; override with env vars locally).
FHIR_DIR = Path(os.getenv("EVAL_FHIR_DIR", "/data/mimic/fhir"))
AGENTBENCH_CSV = Path(os.getenv(
    "EVAL_AGENTBENCH_CSV", "/data/FHIR-AgentBench/final_dataset/questions_answers_sql_fhir.csv"
))
RESULTS_DIR = Path(os.getenv("EVAL_RESULTS_DIR", str(AI_ROOT / "results" / "eval-v1")))

# Resource types with no patient: never indexed (every query is patient-
# filtered), so their gold ids are excluded from retrieval scoring and counted.
UNSCOPED_TYPES = {"Medication", "Location", "Organization"}

CONFIDENCE_MARKER = "\n\n---\n*Confidence Assessment:*"


def read_jsonl(path: Path | str) -> list[dict]:
    path = Path(path)
    if not path.exists():
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def iter_jsonl(path: Path | str) -> Iterator[dict]:
    with open(path) as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def append_jsonl(path: Path | str, row: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as f:
        f.write(json.dumps(row, default=str) + "\n")
        f.flush()
        os.fsync(f.fileno())


def write_jsonl(path: Path | str, rows: Iterable[dict]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for row in rows:
            f.write(json.dumps(row, default=str) + "\n")


def strip_confidence_block(answer: str) -> str:
    """The graph appends a confidence block to every answer; scoring uses the answer only."""
    if not answer:
        return ""
    return answer.split(CONFIDENCE_MARKER, 1)[0].strip()


_PATIENT_REF = re.compile(r"\b(?:the\s+)?patient\s+(\d{6,9})('s)?\b", re.IGNORECASE)
_BARE_ID = re.compile(r"\b1\d{7}\b")


def strip_patient_identifiers(question: str) -> str:
    """
    FHIR-AgentBench questions name the MIMIC subject id ("patient 10018081").
    Retrieval is already scoped by the patient_id filter, and an 8-digit id
    in the query text only adds noise to the embedding, so it is replaced by
    "the patient" before the question reaches the system.
    """
    def repl(m: re.Match) -> str:
        possessive = m.group(2) or ""
        return f"the patient{possessive}"

    text = _PATIENT_REF.sub(repl, question)
    text = _BARE_ID.sub("the patient", text)
    text = re.sub(r"\bthe the patient\b", "the patient", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text[:1].upper() + text[1:] if text else text


def resource_ids_from_groups(encounter_groups) -> list[str]:
    """Distinct source resource ids in the generator context, in rank order."""
    seen: list[str] = []
    for eg in encounter_groups or []:
        gid = getattr(eg, "encounter_id", None) or (eg.get("encounter_id") if isinstance(eg, dict) else None)
        if gid and gid not in seen:
            seen.append(gid)
    return seen
