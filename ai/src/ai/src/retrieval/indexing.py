"""
Ticket 6: RAG Indexing Layer
Document construction and indexing strategy for clinical retrieval.

Responsibilities:
1. Convert normalized nodes into retrievable documents
2. Build rich metadata for filtered retrieval
3. Support query-scoped retrieval (not global search)
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from src.ingestion.preprocessor import NormalizedNode
from src.ingestion.patient_state import PatientState

logger = logging.getLogger(__name__)


class ClinicalDocument(BaseModel):
    """
    Retrievable document representation of a clinical event.
    Optimized for RAG indexing with rich metadata.
    """
    # Core identifiers
    doc_id: str  # Same as node_id
    node_id: str
    eoc_id: str
    
    # Content for embedding
    content: str = Field(
        ...,
        description="Combined text_1 + details for semantic search"
    )
    content_primary: str = Field(
        ...,
        description="text_1 only (for display)"
    )
    content_details: str = Field(
        ...,
        description="details only (for context)"
    )
    
    # Temporal metadata
    date_issued: str  # ISO-8601
    date_unix: int  # Unix timestamp for range queries
    
    # Clinical metadata (for filtering)
    category: str
    event_tag: str
    is_diagnosis: bool
    diagnosis_type: Optional[str] = None
    normality: str
    priority: str
    
    # Graph metadata
    father_id: Optional[str] = None
    relationship_type: Optional[str] = None
    is_root: bool = Field(default=False, description="True if father_id is None")
    
    # Search optimization
    is_allergy: bool = Field(default=False)
    is_medication: bool = Field(default=False)
    is_symptom: bool = Field(default=False)
    is_outcome: bool = Field(default=False)
    is_investigation: bool = Field(default=False)
    
    # Embedding placeholder
    embedding: Optional[List[float]] = None
    sparse_embedding: Optional[Dict[str, List]] = None


class DocumentBuilder:
    """
    Constructs ClinicalDocument objects from NormalizedNode instances.
    """
    
    @staticmethod
    def build_content(node: NormalizedNode) -> str:
        """
        Combine text_1 and details into a single content string.
        Format optimized for LLM context and embedding.
        """
        # Format: [Date] Primary Text\nDetails
        content_parts = [
            f"[{node.date_normalized[:10]}]",
            node.text_primary
        ]
        
        if node.details and node.details.strip():
            content_parts.append(f"\n{node.details}")
        
        return " ".join(content_parts)
    
    @staticmethod
    def extract_search_flags(node: NormalizedNode) -> Dict[str, bool]:
        """
        Extract boolean flags for fast filtering.
        """
        return {
            "is_allergy": node.event_tag == "Allergy/Adverse",
            "is_medication": node.event_tag == "Medication",
            "is_symptom": node.event_tag == "Symptom",
            "is_outcome": node.event_tag == "FollowUp/Outcome",
            "is_investigation": node.event_tag == "Investigation",
        }
    
    @classmethod
    def build_document(cls, node: NormalizedNode) -> ClinicalDocument:
        """
        Convert a NormalizedNode into a ClinicalDocument.
        """
        content = cls.build_content(node)
        search_flags = cls.extract_search_flags(node)
        
        # Convert datetime to unix timestamp
        date_unix = int(node.date_issued.timestamp())
        
        return ClinicalDocument(
            doc_id=node.id,
            node_id=node.id,
            eoc_id=node.eoc_id,
            content=content,
            content_primary=node.text_primary,
            content_details=node.details,
            date_issued=node.date_normalized,
            date_unix=date_unix,
            category=node.category,
            event_tag=node.event_tag,
            is_diagnosis=node.is_diagnosis,
            diagnosis_type=node.diagnosis_type if node.is_diagnosis else None,
            normality=node.normality,
            priority=node.priority,
            father_id=node.father_id,
            relationship_type=node.relationship_type,
            is_root=(node.father_id is None),
            **search_flags
        )
    
    @classmethod
    def build_document_collection(
        cls,
        timeline: List[NormalizedNode]
    ) -> List[ClinicalDocument]:
        """
        Build a complete document collection from timeline.
        """
        documents = []
        for node in timeline:
            doc = cls.build_document(node)
            documents.append(doc)
        
        logger.info(f"Built {len(documents)} clinical documents")
        return documents


class IndexStrategy:
    """
    Defines the indexing and retrieval strategy for clinical documents.
    """
    
    @staticmethod
    def get_metadata_schema() -> Dict[str, str]:
        """
        Return the metadata schema for Qdrant/vector DB configuration.
        This defines what fields can be filtered on.
        """
        return {
            # Identifiers
            "node_id": "string",
            "eoc_id": "string",
            
            # Temporal
            "date_issued": "string",
            "date_unix": "integer",
            
            # Clinical classification
            "category": "string",
            "event_tag": "string",
            "is_diagnosis": "boolean",
            "diagnosis_type": "string",
            "normality": "string",
            "priority": "string",
            
            # Graph
            "father_id": "string",
            "is_root": "boolean",
            
            # Search flags
            "is_allergy": "boolean",
            "is_medication": "boolean",
            "is_symptom": "boolean",
            "is_outcome": "boolean",
            "is_investigation": "boolean",
        }
    
    @staticmethod
    def build_filter_diagnosis_only() -> Dict[str, Any]:
        """
        Qdrant filter: retrieve only diagnosis events.
        """
        return {
            "must": [
                {"key": "is_diagnosis", "match": {"value": True}}
            ]
        }
    
    @staticmethod
    def build_filter_date_range(start_date: str, end_date: str) -> Dict[str, Any]:
        """
        Qdrant filter: retrieve events within date range.
        Dates should be ISO-8601 strings.
        """
        from datetime import datetime
        start_unix = int(datetime.fromisoformat(start_date).timestamp())
        end_unix = int(datetime.fromisoformat(end_date).timestamp())
        
        return {
            "must": [
                {"key": "date_unix", "range": {"gte": start_unix, "lte": end_unix}}
            ]
        }
    
    @staticmethod
    def build_filter_allergy() -> Dict[str, Any]:
        """
        Qdrant filter: retrieve allergy/adverse events only.
        """
        return {
            "must": [
                {"key": "is_allergy", "match": {"value": True}}
            ]
        }
    
    @staticmethod
    def build_filter_medication() -> Dict[str, Any]:
        """
        Qdrant filter: retrieve medication events only.
        """
        return {
            "must": [
                {"key": "is_medication", "match": {"value": True}}
            ]
        }
    
    @staticmethod
    def build_filter_by_event_tag(event_tag: str) -> Dict[str, Any]:
        """
        Qdrant filter: retrieve events by specific tag.
        """
        return {
            "must": [
                {"key": "event_tag", "match": {"value": event_tag}}
            ]
        }
    
    @staticmethod
    def build_filter_abnormal_only() -> Dict[str, Any]:
        """
        Qdrant filter: retrieve only abnormal findings.
        """
        return {
            "must": [
                {"key": "normality", "match": {"value": "Abnormal"}}
            ]
        }
    
    @staticmethod
    def build_compound_filter(
        is_diagnosis: Optional[bool] = None,
        event_tags: Optional[List[str]] = None,
        date_start: Optional[str] = None,
        date_end: Optional[str] = None,
        normality: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Build a compound filter with multiple conditions.
        """
        must_conditions = []
        
        if is_diagnosis is not None:
            must_conditions.append({
                "key": "is_diagnosis",
                "match": {"value": is_diagnosis}
            })
        
        if event_tags:
            # OR condition for multiple tags
            must_conditions.append({
                "key": "event_tag",
                "match": {"any": event_tags}
            })
        
        if date_start and date_end:
            from datetime import datetime
            start_unix = int(datetime.fromisoformat(date_start).timestamp())
            end_unix = int(datetime.fromisoformat(date_end).timestamp())
            must_conditions.append({
                "key": "date_unix",
                "range": {"gte": start_unix, "lte": end_unix}
            })
        
        if normality:
            must_conditions.append({
                "key": "normality",
                "match": {"value": normality}
            })
        
        return {"must": must_conditions} if must_conditions else {}


class DocumentChunk(BaseModel):
    """
    A semantic window chunk of a ClinicalDocument.
    Carries the parent document's metadata for traceability.
    """
    chunk_id: str
    text: str
    chunk_index: int
    parent_doc_id: str
    parent_node_id: str
    parent_eoc_id: str

    date_issued: str = ""
    date_unix: int = 0
    event_tag: str = ""
    is_diagnosis: bool = False
    is_medication: bool = False
    is_allergy: bool = False
    is_symptom: bool = False
    is_outcome: bool = False
    is_investigation: bool = False
    is_root: bool = False
    category: str = ""
    normality: str = ""
    priority: str = ""
    father_id: Optional[str] = None
    relationship_type: Optional[str] = None


class DocumentChunker:
    """
    Splits ClinicalDocument content into semantic windows for embedding.
    Prevents the 512-token truncation of long clinical notes by BERT-based
    embedding models (bge-base-en-v1.5, etc.).

    Uses sentence-boundary-aware sliding windows with configurable overlap
    so each chunk preserves natural clinical phrases.
    """

    @staticmethod
    def estimate_token_count(text: str) -> int:
        return len(text) // 4

    @classmethod
    def chunk_document(
        cls,
        doc: ClinicalDocument,
        chunk_size: int = 400,
        overlap: int = 50,
    ) -> List[DocumentChunk]:
        if cls.estimate_token_count(doc.content) <= chunk_size:
            return [cls._single_chunk(doc, doc.content)]

        import re
        text = doc.content
        chunk_chars = chunk_size * 4
        overlap_chars = overlap * 4

        # Attempt sentence-boundary split first
        segments = re.split(r'(?<=[.!?])\s+', text)
        # If sentence splitting didn't break the text enough (single segment),
        # fall back to word-boundary split
        if len(segments) == 1:
            words = text.split()
            segments = []
            current = ""
            for w in words:
                candidate = (current + " " + w).strip() if current else w
                if len(candidate) > chunk_chars and current:
                    segments.append(current)
                    current = w
                else:
                    current = candidate
            if current:
                segments.append(current)

        chunks: List[DocumentChunk] = []
        current = ""
        idx = 0

        def _flush(segment: str) -> None:
            nonlocal idx
            chunks.append(cls._single_chunk(doc, segment.strip(), idx))
            idx += 1

        for segment in segments:
            candidate = (current + " " + segment).strip() if current else segment
            if len(candidate) > chunk_chars and current:
                _flush(current)
                tail = current[-overlap_chars:] if len(current) > overlap_chars else current
                current = (tail + " " + segment).strip()
            else:
                current = candidate

        if current:
            _flush(current)

        logger.info(f"Chunked document {doc.doc_id} into {len(chunks)} chunks "
                     f"({cls.estimate_token_count(doc.content)} est. tokens)")
        return chunks

    @classmethod
    def _single_chunk(
        cls,
        doc: ClinicalDocument,
        text: str,
        chunk_index: int = 0,
    ) -> DocumentChunk:
        return DocumentChunk(
            chunk_id=f"{doc.doc_id}_chunk_{chunk_index}" if chunk_index else doc.doc_id,
            text=text,
            chunk_index=chunk_index,
            parent_doc_id=doc.doc_id,
            parent_node_id=doc.node_id,
            parent_eoc_id=doc.eoc_id,
            date_issued=doc.date_issued,
            date_unix=doc.date_unix,
            event_tag=doc.event_tag,
            is_diagnosis=doc.is_diagnosis,
            is_medication=doc.is_medication,
            is_allergy=doc.is_allergy,
            is_symptom=doc.is_symptom,
            is_outcome=doc.is_outcome,
            is_root=doc.is_root,
            category=doc.category,
            normality=doc.normality,
            priority=doc.priority,
            father_id=doc.father_id,
            relationship_type=doc.relationship_type,
        )

    @classmethod
    def chunk_text(
        cls,
        text: str,
        source_id: str,
        chunk_size: int = 400,
        overlap: int = 50,
    ) -> List[DocumentChunk]:
        fake_doc = ClinicalDocument(
            doc_id=source_id,
            node_id=source_id,
            eoc_id="",
            content=text,
            content_primary=text,
            content_details="",
            date_issued="",
            date_unix=0,
            category="",
            event_tag="",
            is_diagnosis=False,
            normality="",
            priority="",
        )
        return cls.chunk_document(fake_doc, chunk_size, overlap)


class ContextualRetriever:
    """
    Query-scoped retrieval engine using patient state.
    NOT a global search - retrieval is bounded by clinical context.
    """
    
    def __init__(self, patient_state: PatientState, documents: List[ClinicalDocument]):
        """
        Initialize retriever with patient state context.
        
        Args:
            patient_state: Compiled patient state for context
            documents: Indexed clinical documents
        """
        self.patient_state = patient_state
        self.documents = documents
        self.doc_index = {doc.doc_id: doc for doc in documents}
        
        logger.info(f"Initialized retriever with {len(documents)} documents")
        logger.info(f"Active diagnosis: {patient_state.active_diagnosis}")
    
    def filter_by_metadata(
        self,
        is_diagnosis: Optional[bool] = None,
        event_tag: Optional[str] = None,
        date_start: Optional[str] = None,
        date_end: Optional[str] = None
    ) -> List[ClinicalDocument]:
        """
        Filter documents by metadata (without semantic search).
        This is for exact/structured queries.
        """
        filtered = self.documents
        
        if is_diagnosis is not None:
            filtered = [d for d in filtered if d.is_diagnosis == is_diagnosis]
        
        if event_tag:
            filtered = [d for d in filtered if d.event_tag == event_tag]
        
        if date_start:
            filtered = [
                d for d in filtered 
                if d.date_issued >= date_start
            ]
        
        if date_end:
            filtered = [
                d for d in filtered 
                if d.date_issued <= date_end
            ]
        
        logger.info(f"Filtered to {len(filtered)} documents")
        return filtered
    
    def get_diagnosis_timeline(self) -> List[ClinicalDocument]:
        """Retrieve all diagnosis events in chronological order."""
        return self.filter_by_metadata(is_diagnosis=True)
    
    def get_medication_history(self) -> List[ClinicalDocument]:
        """Retrieve all medication events."""
        return self.filter_by_metadata(event_tag="Medication")
    
    def get_allergy_events(self) -> List[ClinicalDocument]:
        """Retrieve all allergy/adverse events."""
        return [d for d in self.documents if d.is_allergy]
    
    def get_recent_events(self, days: int = 7) -> List[ClinicalDocument]:
        """
        Get events from the last N days of the episode.
        """
        from datetime import datetime, timedelta
        
        if not self.patient_state.last_encounter_date:
            return []
        
        last_date = datetime.fromisoformat(self.patient_state.last_encounter_date)
        cutoff_date = last_date - timedelta(days=days)
        
        return [
            d for d in self.documents
            if datetime.fromisoformat(d.date_issued) >= cutoff_date
        ]
    
    def get_context_for_query(self, query_type: str) -> List[ClinicalDocument]:
        """
        Get relevant context based on query intent.
        
        Query types:
        - "diagnosis": All diagnosis events
        - "medication": Medication history + allergies
        - "summary": Recent events + active diagnosis
        - "change": Symptom evolution + diagnosis changes
        """
        if query_type == "diagnosis":
            return self.get_diagnosis_timeline()
        
        elif query_type == "medication":
            meds = self.get_medication_history()
            allergies = self.get_allergy_events()
            return meds + allergies
        
        elif query_type == "summary":
            recent = self.get_recent_events(days=30)
            return recent
        
        elif query_type == "change":
            symptoms = self.filter_by_metadata(event_tag="Symptom")
            diagnoses = self.get_diagnosis_timeline()
            return symptoms + diagnoses
        
        else:
            # Default: return all
            return self.documents


if __name__ == "__main__":
    # Test document building and indexing
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    
    from src.ingestion.preprocessor import preprocess_json_file
    from src.ingestion.patient_state import PatientStateCompiler
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load data
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    timeline = result["timeline"]
    eoc_id = result["eoc_id"]
    
    # Compile patient state
    patient_state = PatientStateCompiler.compile_state(timeline, eoc_id)
    
    # Build documents
    documents = DocumentBuilder.build_document_collection(timeline)
    
    print("\n" + "=" * 60)
    print("RAG DOCUMENT COLLECTION")
    print("=" * 60)
    print(f"\nTotal Documents: {len(documents)}")
    
    print("\n[Sample Documents]")
    for i, doc in enumerate(documents[:3]):
        print(f"\nDocument {i+1}:")
        print(f"  ID: {doc.doc_id}")
        print(f"  Date: {doc.date_issued[:10]}")
        print(f"  Event Tag: {doc.event_tag}")
        print(f"  Content: {doc.content[:100]}...")
    
    # Test retriever
    print("\n" + "=" * 60)
    print("CONTEXTUAL RETRIEVAL TESTS")
    print("=" * 60)
    
    retriever = ContextualRetriever(patient_state, documents)
    
    print("\n[1] Diagnosis Timeline:")
    diag_docs = retriever.get_diagnosis_timeline()
    for doc in diag_docs:
        print(f"  {doc.date_issued[:10]}: {doc.content_primary}")
    
    print("\n[2] Medication History:")
    med_docs = retriever.get_medication_history()
    for doc in med_docs:
        print(f"  {doc.date_issued[:10]}: {doc.content_primary}")
    
    print("\n[3] Allergy Events:")
    allergy_docs = retriever.get_allergy_events()
    for doc in allergy_docs:
        print(f"  {doc.date_issued[:10]}: {doc.content_primary}")
    
    print("\n[4] Recent Events (Last 7 days):")
    recent_docs = retriever.get_recent_events(days=7)
    for doc in recent_docs:
        print(f"  {doc.date_issued[:10]}: {doc.content_primary}")
    
    print("\n" + "=" * 60)
    
    # Export sample document
    import json
    with open("/home/belal/AI_System/Data/sample_documents.json", 'w') as f:
        json.dump([doc.dict() for doc in documents], f, indent=2)
    print("\n✓ Documents exported to: Data/sample_documents.json")
