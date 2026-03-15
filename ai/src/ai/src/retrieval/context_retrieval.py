"""
Ticket 8: Context Retrieval (RAG Core)
Intent-based retrieval strategies for clinical reasoning.

Key Principles:
1. Patient-specific (bounded by EOC)
2. Time-bounded (no future speculation)
3. Explicitly cited (all contexts include node IDs)
4. Intent-driven (different strategies for different query types)
"""
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime, timedelta

from src.retrieval.indexing import ClinicalDocument, ContextualRetriever
from src.retrieval.query_understanding import QueryContext, QueryIntent
from src.ingestion.patient_state import PatientState

logger = logging.getLogger(__name__)


def _sort_by_type_priority(docs: List[ClinicalDocument], priority_order: List[str]) -> List[ClinicalDocument]:
    """Sort documents by event_tag priority, then reverse-chronologically within each group.
    Reverse chronology puts most recent (typically most relevant) events first."""
    priority = {tag: i for i, tag in enumerate(priority_order)}
    return sorted(docs, key=lambda d: (priority.get(d.event_tag, 99), -d.date_unix))


class RetrievalStrategy:
    """
    Intent-specific retrieval strategies.
    Each intent has different requirements for context selection.
    """
    
    @staticmethod
    def retrieve_for_summary(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Summary Intent: Return ALL nodes for complete picture.
        Sorted chronologically.
        """
        logger.info("Retrieval Strategy: SUMMARY (all nodes, reverse chronological)")
        # Reverse chronological so most recent events are in top K
        return sorted(documents, key=lambda d: d.date_unix, reverse=True)
    
    @staticmethod
    def retrieve_for_diagnosis(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Diagnosis Intent: Return only isDiagnosis=true nodes.
        Include chronological context.
        """
        logger.info("Retrieval Strategy: DIAGNOSIS (diagnosis nodes only)")
        
        diag_docs = [d for d in documents if d.is_diagnosis]
        
        # Sort chronologically
        return sorted(diag_docs, key=lambda d: d.date_unix)
    
    @staticmethod
    def retrieve_for_differential(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Differential Intent: Diagnosis + Supporting Evidence.
        Includes symptoms, investigations, and outcomes that led to diagnosis.
        """
        logger.info("Retrieval Strategy: DIFFERENTIAL (diagnosis + evidence)")
        
        # Get all diagnosis nodes
        diag_docs = [d for d in documents if d.is_diagnosis]
        
        # Get supporting evidence: symptoms, investigations, allergies, medications
        evidence_docs = [
            d for d in documents 
            if d.event_tag in ["Symptom", "Investigation", "Allergy/Adverse", "Medication"]
        ]
        
        # Combine and deduplicate by node_id
        seen = set()
        combined = []
        for doc in diag_docs + evidence_docs:
            if doc.node_id not in seen:
                seen.add(doc.node_id)
                combined.append(doc)
        
        # Priority: diagnoses first, then evidence by clinical relevance
        return _sort_by_type_priority(combined, ["Diagnosis", "Symptom", "Investigation", "Allergy/Adverse", "Medication"])
    
    @staticmethod
    def retrieve_for_medication(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Medication Intent: Medications + Diagnoses + Allergies + Symptoms + Outcomes.
        Context: Why was medication prescribed? What side effects occurred? What was the outcome?
        """
        logger.info("Retrieval Strategy: MEDICATION (meds + diagnoses + allergies + symptoms + outcomes)")
        
        # Get medications
        med_docs = [d for d in documents if d.is_medication]
        
        # Get diagnoses (reason for medication)
        diag_docs = [d for d in documents if d.is_diagnosis]
        
        # Get allergies (contraindications)
        allergy_docs = [d for d in documents if d.is_allergy]
        
        # Get symptoms (side effects, adverse reactions)
        symptom_docs = [d for d in documents if d.is_symptom]
        
        # Get outcomes (treatment effectiveness)
        outcome_docs = [d for d in documents if d.is_outcome]
        
        # Combine and deduplicate
        seen = set()
        combined = []
        for doc in med_docs + diag_docs + allergy_docs + symptom_docs + outcome_docs:
            if doc.node_id not in seen:
                seen.add(doc.node_id)
                combined.append(doc)
        # Priority: medications first, then diagnoses, allergies, symptoms, outcomes
        return _sort_by_type_priority(combined, ["Medication", "Diagnosis", "Allergy/Adverse", "Symptom", "FollowUp/Outcome"])
    
    @staticmethod
    def retrieve_for_change_tracking(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Change Tracking Intent: Temporally adjacent nodes.
        Focus on symptoms, diagnoses, and outcomes to show progression.
        """
        logger.info("Retrieval Strategy: CHANGE_TRACKING (temporal sequence)")
        
        # Get symptoms and outcomes to show change
        symptom_docs = [d for d in documents if d.is_symptom or d.is_outcome]
        
        # Get diagnoses to provide context
        diag_docs = [d for d in documents if d.is_diagnosis]
        
        # Combine and deduplicate
        seen = set()
        combined = []
        for doc in symptom_docs + diag_docs:
            if doc.node_id not in seen:
                seen.add(doc.node_id)
                combined.append(doc)
        return _sort_by_type_priority(combined, ["Diagnosis", "Symptom", "FollowUp/Outcome"])
    
    @staticmethod
    def retrieve_for_trend_analysis(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Trend Analysis Intent: Intervention + Outcome pairs.
        Match medications/procedures with their outcomes.
        """
        logger.info("Retrieval Strategy: TREND_ANALYSIS (intervention + outcome)")
        
        # Get interventions (medications, procedures)
        intervention_docs = [d for d in documents if d.is_medication]
        
        # Get outcomes
        outcome_docs = [d for d in documents if d.is_outcome]
        
        # Get diagnoses for context
        diag_docs = [d for d in documents if d.is_diagnosis]
        
        # Combine and deduplicate
        seen = set()
        combined = []
        for doc in intervention_docs + outcome_docs + diag_docs:
            if doc.node_id not in seen:
                seen.add(doc.node_id)
                combined.append(doc)
        return _sort_by_type_priority(combined, ["Diagnosis", "Medication", "FollowUp/Outcome"])
    
    @staticmethod
    def retrieve_for_rationale(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Rationale Intent: Diagnosis + Medication + Allergy.
        Explain WHY clinical decisions were made.
        """
        logger.info("Retrieval Strategy: RATIONALE (diagnosis + meds + allergies)")
        
        # Get all clinically relevant nodes
        rationale_docs = [
            d for d in documents
            if d.is_diagnosis or d.is_medication or d.is_allergy
        ]
        
        return sorted(rationale_docs, key=lambda d: d.date_unix)
    
    @staticmethod
    def retrieve_for_timeline(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Timeline Intent: All nodes in strict chronological order.
        """
        logger.info("Retrieval Strategy: TIMELINE (chronological all)")
        return sorted(documents, key=lambda d: d.date_unix)
    
    @staticmethod
    def retrieve_for_outcome(
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ) -> List[ClinicalDocument]:
        """
        Outcome Intent: Recent outcomes + final diagnosis + last medication.
        """
        logger.info("Retrieval Strategy: OUTCOME (recent outcomes)")
        
        # Get outcome events
        outcome_docs = [d for d in documents if d.is_outcome]
        
        # Get final diagnosis
        diag_docs = [d for d in documents if d.is_diagnosis]
        final_diag = sorted(diag_docs, key=lambda d: d.date_unix)[-1:] if diag_docs else []
        
        # Get recent medications
        med_docs = [d for d in documents if d.is_medication]
        recent_med = sorted(med_docs, key=lambda d: d.date_unix)[-1:] if med_docs else []
        
        # Combine and deduplicate
        seen = set()
        combined = []
        for doc in outcome_docs + final_diag + recent_med:
            if doc.node_id not in seen:
                seen.add(doc.node_id)
                combined.append(doc)
        return _sort_by_type_priority(combined, ["FollowUp/Outcome", "Diagnosis", "Medication"])


class ContextRetriever:
    """
    Main RAG retrieval engine.
    Routes queries to appropriate retrieval strategies.
    """
    
    def __init__(
        self,
        documents: List[ClinicalDocument],
        patient_state: PatientState
    ):
        """
        Initialize retriever with indexed documents and patient state.
        """
        self.documents = documents
        self.patient_state = patient_state
        self.strategy = RetrievalStrategy()
        
        logger.info(f"ContextRetriever initialized with {len(documents)} documents")
        logger.info(f"Patient: EOC {patient_state.eoc_id[:8]}...")
    
    def retrieve(
        self,
        query_context: QueryContext,
        max_docs: Optional[int] = None
    ) -> List[ClinicalDocument]:
        """
        Retrieve relevant documents based on query intent.
        
        Args:
            query_context: Processed query with intent classification
            max_docs: Optional limit on number of documents (for token management)
            
        Returns:
            List of relevant ClinicalDocument objects with citations
        """
        intent = query_context.intent
        
        # Route to appropriate strategy
        if intent == QueryIntent.SUMMARY:
            docs = self.strategy.retrieve_for_summary(self.documents, self.patient_state)
        
        elif intent == QueryIntent.DIAGNOSIS:
            docs = self.strategy.retrieve_for_diagnosis(self.documents, self.patient_state)
        
        elif intent == QueryIntent.DIFFERENTIAL:
            docs = self.strategy.retrieve_for_differential(self.documents, self.patient_state)
        
        elif intent == QueryIntent.MEDICATION:
            docs = self.strategy.retrieve_for_medication(self.documents, self.patient_state)
        
        elif intent == QueryIntent.ALLERGY:
            # Allergy is similar to medication strategy
            docs = self.strategy.retrieve_for_medication(self.documents, self.patient_state)
        
        elif intent == QueryIntent.CHANGE_TRACKING:
            docs = self.strategy.retrieve_for_change_tracking(self.documents, self.patient_state)
        
        elif intent == QueryIntent.TREND_ANALYSIS:
            docs = self.strategy.retrieve_for_trend_analysis(self.documents, self.patient_state)
        
        elif intent == QueryIntent.RATIONALE:
            docs = self.strategy.retrieve_for_rationale(self.documents, self.patient_state)
        
        elif intent == QueryIntent.TIMELINE:
            docs = self.strategy.retrieve_for_timeline(self.documents, self.patient_state)
        
        elif intent == QueryIntent.OUTCOME:
            docs = self.strategy.retrieve_for_outcome(self.documents, self.patient_state)
        
        else:
            # Unknown intent: return all documents
            logger.warning(f"Unknown intent {intent}, returning all documents")
            docs = sorted(self.documents, key=lambda d: d.date_unix)
        
        # Apply max_docs limit if specified
        if max_docs and len(docs) > max_docs:
            logger.info(f"Limiting results to {max_docs} documents (from {len(docs)})")
            docs = docs[:max_docs]
        
        logger.info(f"Retrieved {len(docs)} documents for intent: {intent.value}")
        
        return docs
    
    def get_temporal_context(
        self,
        target_doc: ClinicalDocument,
        window_days: int = 7
    ) -> List[ClinicalDocument]:
        """
        Get temporally adjacent documents around a target document.
        Useful for understanding context of a specific event.
        
        Args:
            target_doc: The document to get context for
            window_days: Number of days before/after to include
            
        Returns:
            List of documents within the time window
        """
        target_date = datetime.fromtimestamp(target_doc.date_unix)
        start_date = target_date - timedelta(days=window_days)
        end_date = target_date + timedelta(days=window_days)
        
        start_unix = int(start_date.timestamp())
        end_unix = int(end_date.timestamp())
        
        context_docs = [
            d for d in self.documents
            if start_unix <= d.date_unix <= end_unix
        ]
        
        return sorted(context_docs, key=lambda d: d.date_unix)
    
    def get_graph_neighborhood(
        self,
        target_doc: ClinicalDocument,
        depth: int = 1
    ) -> List[ClinicalDocument]:
        """
        Get graph neighborhood (parent + children) of a document.
        Uses father_id relationships.
        
        Args:
            target_doc: The document to get neighborhood for
            depth: How many hops to traverse
            
        Returns:
            List of related documents
        """
        visited = {target_doc.node_id}
        to_visit = [target_doc]
        neighborhood = [target_doc]
        
        doc_map = {d.node_id: d for d in self.documents}
        
        for _ in range(depth):
            current_batch = to_visit.copy()
            to_visit = []
            
            for doc in current_batch:
                # Get parent
                if doc.father_id and doc.father_id in doc_map:
                    parent = doc_map[doc.father_id]
                    if parent.node_id not in visited:
                        visited.add(parent.node_id)
                        neighborhood.append(parent)
                        to_visit.append(parent)
                
                # Get children
                children = [d for d in self.documents if d.father_id == doc.node_id]
                for child in children:
                    if child.node_id not in visited:
                        visited.add(child.node_id)
                        neighborhood.append(child)
                        to_visit.append(child)
        
        return sorted(neighborhood, key=lambda d: d.date_unix)


class RetrievalContext:
    """
    Container for retrieved context with metadata.
    Used as input to reasoning layer.
    """
    
    def __init__(
        self,
        query_context: QueryContext,
        retrieved_documents: List[ClinicalDocument],
        patient_state: PatientState
    ):
        self.query_context = query_context
        self.retrieved_documents = retrieved_documents
        self.patient_state = patient_state
        
        # Pre-compute useful metadata
        self.doc_ids = [d.node_id for d in retrieved_documents]
        self.date_range = self._compute_date_range()
        self.event_counts = self._compute_event_counts()
    
    def _compute_date_range(self) -> Tuple[str, str]:
        """Compute date range of retrieved documents."""
        if not self.retrieved_documents:
            return ("N/A", "N/A")
        
        dates = [d.date_issued for d in self.retrieved_documents]
        return (min(dates), max(dates))
    
    def _compute_event_counts(self) -> Dict[str, int]:
        """Count events by type."""
        counts = {}
        for doc in self.retrieved_documents:
            tag = doc.event_tag
            counts[tag] = counts.get(tag, 0) + 1
        return counts
    
    def to_dict(self) -> Dict[str, Any]:
        """Export to dictionary for serialization."""
        return {
            "query": {
                "original": self.query_context.original_query,
                "rewritten": self.query_context.rewritten_query,
                "intent": self.query_context.intent.value
            },
            "patient_state": {
                "eoc_id": self.patient_state.eoc_id,
                "active_diagnosis": self.patient_state.active_diagnosis,
                "allergies": self.patient_state.allergies,
                "medications": self.patient_state.recent_medications,
                "status": self.patient_state.clinical_status
            },
            "retrieved_context": {
                "document_count": len(self.retrieved_documents),
                "date_range": {
                    "start": self.date_range[0],
                    "end": self.date_range[1]
                },
                "event_counts": self.event_counts,
                "documents": [
                    {
                        "node_id": d.node_id,
                        "date": d.date_issued,
                        "event_tag": d.event_tag,
                        "content": d.content_primary,
                        "details": d.content_details
                    }
                    for d in self.retrieved_documents
                ]
            }
        }


if __name__ == "__main__":
    # Test context retrieval
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    
    from src.ingestion.preprocessor import preprocess_json_file
    from src.ingestion.patient_state import PatientStateCompiler
    from src.retrieval.indexing import DocumentBuilder
    from src.retrieval.query_understanding import QueryUnderstanding
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load data
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    patient_state = PatientStateCompiler.compile_state(result["timeline"], result["eoc_id"])
    documents = DocumentBuilder.build_document_collection(result["timeline"])
    
    # Initialize retriever
    retriever = ContextRetriever(documents, patient_state)
    query_processor = QueryUnderstanding(patient_state)
    
    # Test queries
    test_queries = [
        "What diagnoses were considered?",
        "Why was Mycoplasma diagnosed over Bronchitis?",
        "What medications were prescribed and why?",
        "How did symptoms change over time?",
        "What was the final outcome?",
    ]
    
    print("\n" + "=" * 70)
    print("CONTEXT RETRIEVAL TESTS")
    print("=" * 70)
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n[Query {i}] {query}")
        print("-" * 70)
        
        # Process query
        query_context = query_processor.process_query(query)
        
        # Retrieve context
        retrieved_docs = retriever.retrieve(query_context)
        
        print(f"Intent: {query_context.intent.value}")
        print(f"Retrieved: {len(retrieved_docs)} documents")
        
        # Show documents
        for j, doc in enumerate(retrieved_docs, 1):
            print(f"  {j}. [{doc.date_issued[:10]}] {doc.event_tag:20s} | {doc.content_primary[:50]}...")
        
        # Create retrieval context
        context = RetrievalContext(query_context, retrieved_docs, patient_state)
        print(f"\nDate range: {context.date_range[0][:10]} to {context.date_range[1][:10]}")
        print(f"Event counts: {context.event_counts}")
    
    print("\n" + "=" * 70)
    print("✓ CONTEXT RETRIEVAL TESTS COMPLETE")
    print("=" * 70)
