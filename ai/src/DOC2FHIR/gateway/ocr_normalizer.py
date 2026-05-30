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
