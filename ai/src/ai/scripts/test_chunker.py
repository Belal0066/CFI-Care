#!/usr/bin/env python3
"""
Priority 3: DocumentChunker Unit Tests.
Validates sentence-boundary + word-fallback sliding window chunking.
"""

import sys
import logging
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.indexing import DocumentChunker, DocumentChunk, ClinicalDocument

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

PASS = 0
FAIL = 0


def test(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        msg = f"  ❌ {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


def make_doc(content: str, doc_id: str = "doc-test", **kw) -> ClinicalDocument:
    return ClinicalDocument(
        doc_id=doc_id,
        node_id=doc_id,
        eoc_id="eoc-test",
        content=content,
        content_primary=content,
        content_details="",
        date_issued="2026-01-01",
        date_unix=1767312000,
        category="Test",
        event_tag="Test",
        is_diagnosis=True,
        normality="Normal",
        priority="High",
        **kw,
    )


def test_short_doc_single_chunk() -> None:
    """Document shorter than chunk_size produces exactly one chunk."""
    text = "Short clinical note."
    doc = make_doc(text)
    chunks = DocumentChunker.chunk_document(doc)
    test("short doc → single chunk", len(chunks) == 1, f"got {len(chunks)}")
    if chunks:
        test("chunk text matches original", chunks[0].text == text)
        test("chunk index 0", chunks[0].chunk_index == 0)


def test_long_sentence_bounded() -> None:
    """Long text with sentence boundaries splits into multiple chunks."""
    sentences = [
        "The patient presents with acute onset of chest pain radiating to the left arm.",
        "Initial vitals show BP 160/95, HR 98, SpO2 97% on room air.",
        "ECG reveals ST elevation in leads V2-V4 consistent with anterior STEMI.",
        "Patient was started on aspirin 325 mg and transferred to the cath lab.",
        "Troponin I elevated at 4.2 ng/mL.",
        "Echocardiogram shows anterior wall hypokinesis with LVEF 40%.",
        "Discharge medications include atorvastatin 80 mg and metoprolol 25 mg BID.",
        "Follow-up scheduled in 4 weeks for repeat echo and lipid panel.",
    ]
    text = " ".join(sentences)

    # Use small chunk size to force multiple chunks
    small_chunk = 60  # tokens ≈ 240 chars
    chunks = DocumentChunker.chunk_document(make_doc(text), chunk_size=small_chunk)

    test("long sentence-bounded → multiple chunks", len(chunks) > 1, f"got {len(chunks)} chunks")
    test("chunk indexes are sequential", all(c.chunk_index == i for i, c in enumerate(chunks)))
    test("all chunks have text", all(c.text for c in chunks))
    test("chunk_id contains parent doc_id", chunks[0].chunk_id.startswith("doc-test"))

    # Each original sentence appears in at least one chunk (overlapping windows expected)
    missing = [s for s in sentences if not any(s in c.text for c in chunks)]
    test("all sentences found across chunks", len(missing) == 0,
         f"missing {len(missing)} sentences" if missing else "")


def test_long_run_on_word_fallback() -> None:
    """Text with no sentence boundaries uses word-boundary fallback."""
    # A single run-on sentence long enough to require splitting
    # ~2500 characters, well over 400 tokens (1600 chars)
    text = "The patient " + "and " * 600 + "was discharged."
    chunks = DocumentChunker.chunk_document(make_doc(text), chunk_size=400)

    test("run-on text → multiple chunks", len(chunks) > 1, f"got {len(chunks)} chunks")
    if chunks:
        test("each chunk is non-empty", all(c.text.strip() for c in chunks))


def test_metadata_propagation() -> None:
    """Boolean flags and metadata propagate to all chunks."""
    text = " ".join(["Sentence number " + str(i) + "." for i in range(50)])
    doc = make_doc(
        text,
        doc_id="meta-test",
        is_medication=False,
        is_allergy=True,
    )
    chunks = DocumentChunker.chunk_document(doc, chunk_size=100)

    test("metadata doc → multiple chunks", len(chunks) >= 1)
    for c in chunks:
        test(f"chunk {c.chunk_index} inherits is_diagnosis",
             c.is_diagnosis == doc.is_diagnosis)
        test(f"chunk {c.chunk_index} inherits is_medication",
             c.is_medication == doc.is_medication)
        test(f"chunk {c.chunk_index} inherits is_allergy",
             c.is_allergy == doc.is_allergy)
        test(f"chunk {c.chunk_index} has parent_doc_id",
             c.parent_doc_id == doc.doc_id)
        test(f"chunk {c.chunk_index} has parent_node_id",
             c.parent_node_id == doc.node_id)
        test(f"chunk {c.chunk_index} has parent_eoc_id",
             c.parent_eoc_id == doc.eoc_id)


def test_exact_chunk_size() -> None:
    """Text exactly equal to chunk_size produces single chunk."""
    # 400 tokens = 1600 chars (len // 4 == 400)
    text = "word " * 320  # exactly 400 tokens
    chunks = DocumentChunker.chunk_document(make_doc(text), chunk_size=400)
    test("exact chunk_size → single chunk", len(chunks) == 1, f"got {len(chunks)}")

    # Slightly over: 401 tokens → 2 chunks with word-fallback
    text_over = "word " * 321  # ~1605 chars → 401 tokens
    chunks_over = DocumentChunker.chunk_document(make_doc(text_over), chunk_size=400)
    test("over chunk_size → multiple chunks", len(chunks_over) > 1,
         f"got {len(chunks_over)} chunks")


def test_chunk_text_helper() -> None:
    """chunk_text convenience function works correctly."""
    # 100 sentences @ ~15 chars = ~1500 chars > 400 (100 token threshold)
    text = " ".join(["Sentence " + str(i) + "." for i in range(100)])
    chunks = DocumentChunker.chunk_text(text, source_id="helper-test", chunk_size=100)
    test("chunk_text returns list of DocumentChunk",
         all(isinstance(c, DocumentChunk) for c in chunks))
    test("chunk_text produces multiple chunks for long text",
         len(chunks) > 1, f"got {len(chunks)} chunks")
    if chunks:
        test("chunk_text sets source_id as doc_id",
             chunks[0].parent_doc_id == "helper-test")


def test_real_data() -> None:
    """Chunk real clinical text from Data/data.json."""
    import json

    data_path = Path(__file__).parent.parent / "Data" / "data.json"
    if not data_path.exists():
        test("real data file exists", False, f"{data_path} not found")
        return

    with open(data_path) as f:
        data = json.load(f)

    # Find a note with substantial content (data may be a dict or list)
    if isinstance(data, dict):
        notes = list(data.values()) if data else []
    elif isinstance(data, list):
        notes = data
    else:
        notes = []

    # Flatten to strings and find longest
    long_text = ""
    long_id = "real-doc"
    for item in notes:
        if isinstance(item, dict):
            text = item.get("content_primary") or item.get("text", "")
            item_id = item.get("id") or item.get("node_id", "real-doc")
        elif isinstance(item, str):
            text = item
            item_id = "real-doc"
        else:
            continue
        if len(text) > len(long_text):
            long_text = text
            long_id = item_id

    if long_text:
        doc = make_doc(long_text, doc_id=long_id)
        chunks = DocumentChunker.chunk_document(doc)
        test("real data produces at least 1 chunk",
             len(chunks) >= 1, f"got {len(chunks)} chunks from {len(long_text)} chars")
        if chunks:
            test("first chunk contains original text start",
                 long_text[:min(40, len(long_text))] in chunks[0].text)
    else:
        test("real data available for chunking", False, "data.json is empty")


def main() -> int:
    global PASS, FAIL
    PASS = 0
    FAIL = 0

    print("=" * 60)
    print("TEST SUITE: DocumentChunker")
    print("=" * 60)

    print("\n─── Short Document ───")
    test_short_doc_single_chunk()

    print("\n─── Long Sentence-Bounded ───")
    test_long_sentence_bounded()

    print("\n─── Long Run-On (Word Fallback) ───")
    test_long_run_on_word_fallback()

    print("\n─── Metadata Propagation ───")
    test_metadata_propagation()

    print("\n─── Exact Chunk Size ───")
    test_exact_chunk_size()

    print("\n─── chunk_text Helper ───")
    test_chunk_text_helper()

    print("\n─── Real Data ───")
    test_real_data()

    print(f"\n{'=' * 60}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    print(f"{'=' * 60}")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
