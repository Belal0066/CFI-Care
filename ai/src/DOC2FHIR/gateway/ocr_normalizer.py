from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class NormalizedOcr:
    raw_text: str
    clean_text: str
    layout_blocks: list[dict[str, Any]]


def _fix_hyphenation(text: str) -> str:
    return re.sub(r"(\w)-\n(\w)", r"\1\2", text)


def _normalize_units(text: str) -> str:
    unit_map = {
        r"\b(mg|m g)\b": "mg",
        r"\b(g|g )\b": "g",
        r"\b(ml|m l)\b": "mL",
        r"\b(l|l )\b": "L",
        r"\b(mc g|mcg)\b": "mcg",
        r"\b(mm hg|mmhg)\b": "mmHg",
    }
    for pattern, replacement in unit_map.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def _normalize_spacing(text: str) -> str:
    text = re.sub(r"[\t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_ocr_text(raw_text: str) -> str:
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    text = _fix_hyphenation(text)
    text = _normalize_units(text)
    text = _normalize_spacing(text)
    return text


def normalize_ocr_output(raw_text: str, layout_blocks: list[dict[str, Any]]) -> NormalizedOcr:
    clean_text = normalize_ocr_text(raw_text)
    enriched_blocks = _enrich_layout_blocks(layout_blocks, clean_text)
    return NormalizedOcr(
        raw_text=raw_text,
        clean_text=clean_text,
        layout_blocks=enriched_blocks,
    )


def _normalize_bbox(bbox: Any) -> dict[str, float] | None:
    if not bbox:
        return None
    # accept dicts or lists like [x,y,w,h] or [x0,y0,x1,y1]
    if isinstance(bbox, dict):
        x = float(bbox.get("x", 0))
        y = float(bbox.get("y", 0))
        w = float(bbox.get("w", bbox.get("width", 0)))
        h = float(bbox.get("h", bbox.get("height", 0)))
        return {"x": x, "y": y, "w": w, "h": h}
    if isinstance(bbox, (list, tuple)):
        vals = [float(v) for v in bbox]
        if len(vals) == 4:
            # assume [x,y,w,h]
            return {"x": vals[0], "y": vals[1], "w": vals[2], "h": vals[3]}
    return None


def _find_next_substring(hay: str, needle: str, start: int = 0) -> int:
    # naive, robust substring finder that tolerates minor whitespace differences
    if not needle:
        return -1
    idx = hay.find(needle, start)
    if idx != -1:
        return idx
    # try condensed whitespace match
    condensed_hay = re.sub(r"\s+", " ", hay)
    condensed_needle = re.sub(r"\s+", " ", needle)
    return condensed_hay.find(condensed_needle)


def _enrich_layout_blocks(blocks: list[dict[str, Any]], clean_text: str) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    cursor = 0
    for blk in blocks:
        text = (blk.get("text") or blk.get("content") or "")
        text = str(text).strip()
        page = int(blk.get("page", blk.get("page_num", 1) or 1))
        bbox = _normalize_bbox(blk.get("bbox") or blk.get("box") or blk.get("bounds"))

        start = _find_next_substring(clean_text, text, cursor)
        if start == -1:
            # fallback: try searching from beginning
            start = _find_next_substring(clean_text, text, 0)
        end = start + len(text) if start >= 0 else -1

        enriched.append({
            "text": text,
            "page": page,
            "bbox": bbox,
            "start": start,
            "end": end,
        })

        if end > cursor:
            cursor = end

    return enriched


def ground_evidence_span(
    evidence_text: str,
    layout_blocks: list[dict[str, Any]],
    clean_text: str,
) -> dict[str, Any] | None:
    """
    Deterministically locates an extracted evidence text within the real,
    OCR-derived layout blocks (already positioned against clean_text by
    _enrich_layout_blocks above), and returns the grounded
    {start, end, page, bbox} — or None if the text can't be matched to
    anything.

    Why this exists, not just an LLM-reported offset: the structured
    extractor's LLM is asked to report which text span supports each
    claim, which it can do reasonably well, but it has no way to know real
    character offsets or page coordinates — those require actually
    searching the OCR output, which only this deterministic step can do.
    This is intentionally the same substring-matching approach
    _enrich_layout_blocks already uses, applied to one entity's text
    instead of one block's text, so both stay consistent with each other.
    """
    text = (evidence_text or "").strip()
    if not text:
        return None

    start = _find_next_substring(clean_text, text)
    if start == -1:
        return None
    end = start + len(text)

    # The block whose own span contains where this evidence text starts.
    match = next(
        (b for b in layout_blocks if b["start"] != -1 and b["start"] <= start < b["end"]),
        None,
    )

    bbox_list = None
    if match and match.get("bbox"):
        b = match["bbox"]
        bbox_list = [b["x"], b["y"], b["w"], b["h"]]

    return {
        "start": start,
        "end": end,
        "page": match["page"] if match else None,
        "bbox": bbox_list,
    }
