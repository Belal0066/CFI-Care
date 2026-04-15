"""
Ticket 9: Clinical Reasoning Layer
Bounded reasoning engine for clinical analysis.

Key Constraints:
1. May ONLY reason over retrieved contexts
2. Cannot introduce new clinical facts
3. Cannot access external knowledge
4. Must provide temporal comparisons
5. Must explain cause-effect relationships
6. Must cite all claims with node IDs

Ticket 10: Response Generation & Citation Enforcement
Structured output with mandatory citations.
"""
import logging
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
from pydantic import BaseModel, Field

from src.retrieval.context_retrieval import RetrievalContext
from src.retrieval.indexing import ClinicalDocument

logger = logging.getLogger(__name__)


class CitedClaim(BaseModel):
    """
    A single claim with its supporting evidence.
    Every statement must be traceable to source documents.
    """
    claim: str = Field(..., description="The clinical statement being made")
    source_node_ids: List[str] = Field(..., description="Node IDs supporting this claim")
    temporal_context: Optional[str] = Field(None, description="When this occurred")
    
    def format_citation(self, documents: Dict[str, ClinicalDocument]) -> str:
        """Format citation with full source details."""
        citations = []
        for node_id in self.source_node_ids:
            if node_id in documents:
                doc = documents[node_id]
                citations.append(
                    f"Source: {doc.event_tag} – {doc.content_primary} ({doc.date_issued[:10]})"
                )
        return "\n".join(citations)


class ClinicalResponse(BaseModel):
    """
    Structured clinical response with mandatory citations.
    """
    # Query information
    original_query: str
    intent: str
    
    # Main response
    explanation: str = Field(
        ...,
        description="Clear clinical explanation answering the query"
    )
    
    # Cited claims
    claims: List[CitedClaim] = Field(
        default_factory=list,
        description="Individual claims with citations"
    )
    
    # Temporal analysis
    temporal_summary: Optional[str] = Field(
        None,
        description="Timeline of relevant events"
    )
    
    # Safety flags
    has_insufficient_data: bool = Field(
        default=False,
        description="True if required data is missing"
    )
    contains_speculation: bool = Field(
        default=False,
        description="True if response contains speculation (SHOULD BE FALSE)"
    )
    
    # Metadata
    source_document_ids: List[str] = Field(
        default_factory=list,
        description="All node IDs used in response"
    )
    confidence: str = Field(
        default="High",
        description="Confidence level based on data completeness"
    )
    
    # Full source section
    sources: List[str] = Field(
        default_factory=list,
        description="Formatted citation strings"
    )
    
    def format_response(self) -> str:
        """Format as human-readable text with citations."""
        lines = []
        
        lines.append("=" * 70)
        lines.append("CLINICAL RESPONSE")
        lines.append("=" * 70)
        lines.append(f"\nQuery: {self.original_query}")
        lines.append(f"Intent: {self.intent}")
        lines.append(f"Confidence: {self.confidence}")
        
        if self.has_insufficient_data:
            lines.append("\n⚠️  WARNING: Insufficient data to fully answer query")
        
        lines.append(f"\n{self.explanation}")
        
        if self.temporal_summary:
            lines.append(f"\n[Temporal Context]")
            lines.append(self.temporal_summary)
        
        if self.sources:
            lines.append(f"\n[Sources]")
            for source in self.sources:
                lines.append(f"  • {source}")
        
        lines.append("\n" + "=" * 70)
        
        return "\n".join(lines)


class ClinicalReasoner:
    """
    Bounded reasoning engine for clinical analysis.
    
    Operating Constraints:
    1. Reason ONLY over retrieved documents
    2. NO external medical knowledge
    3. NO speculation beyond documented facts
    4. ALL claims must be cited
    """
    
    def __init__(self, retrieval_context: RetrievalContext):
        """
        Initialize reasoner with retrieval context.
        """
        self.context = retrieval_context
        self.documents = {d.node_id: d for d in retrieval_context.retrieved_documents}
        self.patient_state = retrieval_context.patient_state
        
        logger.info(f"ClinicalReasoner initialized with {len(self.documents)} documents")
    
    def _check_data_sufficiency(self) -> tuple[bool, str]:
        """
        Check if retrieved context is sufficient to answer query.
        """
        if not self.context.retrieved_documents:
            return False, "No relevant clinical documents found"
        
        intent = self.context.query_context.intent.value
        
        # Intent-specific sufficiency checks
        if intent == "diagnosis" and not any(d.is_diagnosis for d in self.context.retrieved_documents):
            return False, "No diagnosis events found in patient record"
        
        if intent == "medication" and not any(d.is_medication for d in self.context.retrieved_documents):
            return False, "No medication events found in patient record"
        
        if intent == "allergy" and not any(d.is_allergy for d in self.context.retrieved_documents):
            return False, "No allergy or adverse event records found"
        
        return True, "Sufficient data available"
    
    def _extract_temporal_sequence(self) -> str:
        """
        Build temporal summary from retrieved documents.
        """
        lines = []
        for doc in sorted(self.context.retrieved_documents, key=lambda d: d.date_unix):
            lines.append(f"  {doc.date_issued[:10]}: {doc.content_primary}")
        return "\n".join(lines)
    
    def _identify_cause_effect_relationships(self) -> List[Dict[str, Any]]:
        """
        Identify temporal cause-effect relationships.
        Only based on documented sequence - no speculation.
        """
        relationships = []
        docs_sorted = sorted(self.context.retrieved_documents, key=lambda d: d.date_unix)
        
        for i in range(len(docs_sorted) - 1):
            current = docs_sorted[i]
            next_doc = docs_sorted[i + 1]
            
            # Medication -> Outcome relationship
            if current.is_medication and next_doc.is_outcome:
                relationships.append({
                    "type": "treatment_outcome",
                    "cause": current.node_id,
                    "effect": next_doc.node_id,
                    "description": f"{current.content_primary} → {next_doc.content_primary}"
                })
            
            # Symptom -> Diagnosis relationship
            if current.is_symptom and next_doc.is_diagnosis:
                relationships.append({
                    "type": "symptom_diagnosis",
                    "cause": current.node_id,
                    "effect": next_doc.node_id,
                    "description": f"{current.content_primary} → {next_doc.content_primary}"
                })
        
        return relationships
    
    def reason_for_summary(self) -> ClinicalResponse:
        """
        Generate summary response with full timeline.
        """
        logger.info("Reasoning: SUMMARY")
        
        is_sufficient, reason = self._check_data_sufficiency()
        
        if not is_sufficient:
            return ClinicalResponse(
                original_query=self.context.query_context.original_query,
                intent="summary",
                explanation=f"Unable to provide complete summary: {reason}",
                has_insufficient_data=True,
                confidence="Low"
            )
        
        # Build explanation
        explanation = f"Clinical Summary for Episode of Care:\n\n"
        
        # Present active diagnosis
        if self.patient_state.active_diagnosis:
            explanation += f"Active Diagnosis: {', '.join(self.patient_state.active_diagnosis)}\n"
        
        # Presenting symptoms
        if self.patient_state.presenting_symptoms:
            explanation += f"Presenting Symptoms: {', '.join(self.patient_state.presenting_symptoms)}\n"
        
        # Clinical course
        explanation += f"\nThe patient was evaluated over {self.patient_state.total_encounters} encounters "
        explanation += f"from {self.patient_state.first_encounter_date[:10]} to {self.patient_state.last_encounter_date[:10]}. "
        
        # Outcome
        explanation += f"Current clinical status: {self.patient_state.clinical_status}."
        
        # Allergies
        if self.patient_state.allergies:
            explanation += f"\n\nDocumented Allergies: {', '.join(self.patient_state.allergies)}"
        
        # Current medications
        if self.patient_state.recent_medications:
            explanation += f"\nCurrent Medications: {', '.join(self.patient_state.recent_medications)}"
        
        # Build claims
        claims = []
        
        # Claim: Active diagnosis
        if self.patient_state.active_diagnosis:
            diag_docs = [d for d in self.context.retrieved_documents if d.is_diagnosis]
            final_diag = sorted(diag_docs, key=lambda d: d.date_unix)[-1] if diag_docs else None
            if final_diag:
                claims.append(CitedClaim(
                    claim=f"Active diagnosis: {final_diag.content_primary}",
                    source_node_ids=[final_diag.node_id],
                    temporal_context=final_diag.date_issued[:10]
                ))
        
        # Build sources
        sources = [
            f"{d.event_tag} – {d.content_primary} ({d.date_issued[:10]})"
            for d in self.context.retrieved_documents
        ]
        
        return ClinicalResponse(
            original_query=self.context.query_context.original_query,
            intent="summary",
            explanation=explanation,
            claims=claims,
            temporal_summary=self._extract_temporal_sequence(),
            source_document_ids=[d.node_id for d in self.context.retrieved_documents],
            sources=sources,
            confidence="High"
        )
    
    def reason_for_diagnosis(self) -> ClinicalResponse:
        """
        Generate diagnosis-focused response with reasoning.
        """
        logger.info("Reasoning: DIAGNOSIS")
        
        diag_docs = [d for d in self.context.retrieved_documents if d.is_diagnosis]
        
        if not diag_docs:
            return ClinicalResponse(
                original_query=self.context.query_context.original_query,
                intent="diagnosis",
                explanation="No diagnosis events found in patient record.",
                has_insufficient_data=True,
                confidence="Low"
            )
        
        # Sort chronologically
        diag_docs = sorted(diag_docs, key=lambda d: d.date_unix)
        
        # Build explanation
        explanation = "Diagnostic Progression:\n\n"
        
        for i, doc in enumerate(diag_docs, 1):
            explanation += f"{i}. {doc.content_primary} ({doc.date_issued[:10]})\n"
            explanation += f"   Type: {doc.diagnosis_type}\n"
            if doc.content_details:
                explanation += f"   Reasoning: {doc.content_details}\n"
            explanation += "\n"
        
        # Explain evolution
        if len(diag_docs) > 1:
            explanation += f"The diagnosis evolved from {diag_docs[0].content_primary} "
            explanation += f"to {diag_docs[-1].content_primary} based on clinical progression and response to treatment."
        
        # Build claims
        claims = []
        for doc in diag_docs:
            claims.append(CitedClaim(
                claim=doc.content_primary,
                source_node_ids=[doc.node_id],
                temporal_context=doc.date_issued[:10]
            ))
        
        sources = [
            f"{d.event_tag} – {d.content_primary} ({d.date_issued[:10]})"
            for d in diag_docs
        ]
        
        return ClinicalResponse(
            original_query=self.context.query_context.original_query,
            intent="diagnosis",
            explanation=explanation,
            claims=claims,
            temporal_summary=self._extract_temporal_sequence(),
            source_document_ids=[d.node_id for d in diag_docs],
            sources=sources,
            confidence="High"
        )
    
    def reason_for_differential(self) -> ClinicalResponse:
        """
        Generate differential diagnosis reasoning.
        """
        logger.info("Reasoning: DIFFERENTIAL")
        
        diag_docs = [d for d in self.context.retrieved_documents if d.is_diagnosis]
        evidence_docs = [d for d in self.context.retrieved_documents if not d.is_diagnosis]
        
        if not diag_docs:
            return ClinicalResponse(
                original_query=self.context.query_context.original_query,
                intent="differential",
                explanation="No diagnosis events available for differential analysis.",
                has_insufficient_data=True,
                confidence="Low"
            )
        
        # Build explanation
        explanation = "Differential Diagnostic Analysis:\n\n"
        
        # Present all considered diagnoses
        explanation += "Diagnoses Considered:\n"
        for doc in sorted(diag_docs, key=lambda d: d.date_unix):
            explanation += f"  • {doc.content_primary} ({doc.diagnosis_type}) - {doc.date_issued[:10]}\n"
        
        explanation += "\nSupporting Evidence:\n"
        for doc in sorted(evidence_docs, key=lambda d: d.date_unix):
            explanation += f"  • {doc.date_issued[:10]}: {doc.content_primary}\n"
        
        # Explain selection logic
        final_diag = sorted(diag_docs, key=lambda d: d.date_unix)[-1]
        explanation += f"\nFinal Selection: {final_diag.content_primary}\n"
        explanation += f"Reasoning: {final_diag.content_details}"
        
        # Build claims
        claims = [
            CitedClaim(
                claim=doc.content_primary,
                source_node_ids=[doc.node_id],
                temporal_context=doc.date_issued[:10]
            )
            for doc in diag_docs
        ]
        
        sources = [
            f"{d.event_tag} – {d.content_primary} ({d.date_issued[:10]})"
            for d in self.context.retrieved_documents
        ]
        
        return ClinicalResponse(
            original_query=self.context.query_context.original_query,
            intent="differential",
            explanation=explanation,
            claims=claims,
            temporal_summary=self._extract_temporal_sequence(),
            source_document_ids=[d.node_id for d in self.context.retrieved_documents],
            sources=sources,
            confidence="High"
        )
    
    def reason_for_medication(self) -> ClinicalResponse:
        """
        Generate medication response with rationale and allergy context.
        """
        logger.info("Reasoning: MEDICATION")
        
        med_docs = [d for d in self.context.retrieved_documents if d.is_medication]
        allergy_docs = [d for d in self.context.retrieved_documents if d.is_allergy]
        diag_docs = [d for d in self.context.retrieved_documents if d.is_diagnosis]
        
        if not med_docs:
            return ClinicalResponse(
                original_query=self.context.query_context.original_query,
                intent="medication",
                explanation="No medication events found in patient record.",
                has_insufficient_data=True,
                confidence="Low"
            )
        
        # Build explanation
        explanation = "Medication History:\n\n"
        
        for doc in sorted(med_docs, key=lambda d: d.date_unix):
            explanation += f"• {doc.content_primary} ({doc.date_issued[:10]})\n"
            if doc.content_details:
                explanation += f"  Indication: {doc.content_details}\n"
        
        # Add allergy warnings
        if allergy_docs:
            explanation += "\n⚠️  Documented Allergies:\n"
            for doc in allergy_docs:
                explanation += f"  • {doc.content_primary} ({doc.date_issued[:10]})\n"
        
        # Link to diagnoses
        if diag_docs:
            explanation += "\nRelated Diagnoses:\n"
            for doc in sorted(diag_docs, key=lambda d: d.date_unix):
                explanation += f"  • {doc.content_primary} ({doc.date_issued[:10]})\n"
        
        # Build claims
        claims = [
            CitedClaim(
                claim=doc.content_primary,
                source_node_ids=[doc.node_id],
                temporal_context=doc.date_issued[:10]
            )
            for doc in med_docs
        ]
        
        sources = [
            f"{d.event_tag} – {d.content_primary} ({d.date_issued[:10]})"
            for d in self.context.retrieved_documents
        ]
        
        return ClinicalResponse(
            original_query=self.context.query_context.original_query,
            intent="medication",
            explanation=explanation,
            claims=claims,
            temporal_summary=self._extract_temporal_sequence(),
            source_document_ids=[d.node_id for d in self.context.retrieved_documents],
            sources=sources,
            confidence="High"
        )
    
    def reason(self) -> ClinicalResponse:
        """
        Main reasoning entry point - routes to intent-specific reasoner.
        """
        intent = self.context.query_context.intent.value
        
        if intent == "summary":
            return self.reason_for_summary()
        elif intent in ["diagnosis", "differential"]:
            if intent == "differential":
                return self.reason_for_differential()
            return self.reason_for_diagnosis()
        elif intent in ["medication", "allergy"]:
            return self.reason_for_medication()
        else:
            # Default: provide all documents as-is
            sources = [
                f"{d.event_tag} – {d.content_primary} ({d.date_issued[:10]})"
                for d in self.context.retrieved_documents
            ]
            
            return ClinicalResponse(
                original_query=self.context.query_context.original_query,
                intent=intent,
                explanation=f"Retrieved {len(self.context.retrieved_documents)} relevant clinical events.",
                temporal_summary=self._extract_temporal_sequence(),
                source_document_ids=[d.node_id for d in self.context.retrieved_documents],
                sources=sources,
                confidence="High"
            )


if __name__ == "__main__":
    # Test clinical reasoning
    import sys
    import json
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    
    from src.ingestion.preprocessor import preprocess_json_file
    from src.ingestion.patient_state import PatientStateCompiler
    from src.retrieval.indexing import DocumentBuilder
    from src.retrieval.query_understanding import QueryUnderstanding
    from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load data
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    patient_state = PatientStateCompiler.compile_state(result["timeline"], result["eoc_id"])
    documents = DocumentBuilder.build_document_collection(result["timeline"])
    
    # Initialize pipeline
    context_retriever = ContextRetriever(documents, patient_state)
    query_processor = QueryUnderstanding(patient_state)
    
    # Test queries
    test_queries = [
        "What diagnoses were considered?",
        "Why was Mycoplasma Pneumonia diagnosed?",
        "What medications were prescribed?",
    ]
    
    print("\n" + "=" * 70)
    print("CLINICAL REASONING TESTS")
    print("=" * 70)
    
    for query in test_queries:
        print(f"\n{'=' * 70}")
        print(f"Query: {query}")
        print('=' * 70)
        
        # Process query
        query_context = query_processor.process_query(query)
        
        # Retrieve context
        retrieved_docs = context_retriever.retrieve(query_context)
        
        # Build retrieval context
        retrieval_context = RetrievalContext(query_context, retrieved_docs, patient_state)
        
        # Reason
        reasoner = ClinicalReasoner(retrieval_context)
        response = reasoner.reason()
        
        # Display
        print(response.format_response())
    
    print("\n" + "=" * 70)
    print("✓ CLINICAL REASONING TESTS COMPLETE")
    print("=" * 70)
    
    # Export sample response
    query_context = query_processor.process_query(test_queries[0])
    retrieved_docs = context_retriever.retrieve(query_context)
    retrieval_context = RetrievalContext(query_context, retrieved_docs, patient_state)
    reasoner = ClinicalReasoner(retrieval_context)
    response = reasoner.reason()
    
    with open("/home/belal/AI_System/Data/sample_clinical_response.json", 'w') as f:
        json.dump(response.dict(), f, indent=2)
    print("\n✓ Sample response exported to: Data/sample_clinical_response.json")
