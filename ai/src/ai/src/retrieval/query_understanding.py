"""
Ticket 7: Query Understanding Layer
Intent classification and query rewriting for clinical RAG.

Responsibilities:
1. Classify user query intent
2. Augment queries with patient state context
3. Route to appropriate retrieval strategy
4. NO external assumptions - bounded by patient data
"""
import logging
import re
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field
from enum import Enum

from src.ingestion.patient_state import PatientState

logger = logging.getLogger(__name__)


class QueryIntent(str, Enum):
    """
    Clinical query intent categories.
    Each maps to a specific retrieval and reasoning strategy.
    """
    SUMMARY = "summary"                    # "Summarize this patient's case"
    DIAGNOSIS = "diagnosis"                # "What diagnoses were considered?"
    DIFFERENTIAL = "differential"          # "Why was X diagnosed over Y?"
    MEDICATION = "medication"              # "What medications were prescribed?"
    ALLERGY = "allergy"                    # "Does patient have allergies?"
    CHANGE_TRACKING = "change_tracking"    # "How did symptoms change over time?"
    VISUALIZATION = "visualization"        # "Show chart/plot/graph of X trend"
    TREND_ANALYSIS = "trend_analysis"      # "What pattern do we see?"
    RATIONALE = "rationale"                # "Why was X done?"
    TIMELINE = "timeline"                  # "When did X happen?"
    OUTCOME = "outcome"                    # "What was the clinical outcome?"
    UNKNOWN = "unknown"                    # Fallback


class QueryContext(BaseModel):
    """
    Enriched query representation with patient state context.
    """
    original_query: str
    intent: QueryIntent
    rewritten_query: str
    query_normalized: str = ""
    
    # Retrieval hints
    requires_diagnosis_filter: bool = False
    requires_temporal_ordering: bool = False
    requires_graph_expansion: bool = False
    date_range: Optional[Tuple[str, str]] = None
    
    # Patient context injected
    patient_state_summary: str = ""
    
    # Configurable retrieval threshold (per-query)
    retrieval_threshold: float = Field(
        default=0.15,
        description="Minimum encounter score to include (configurable per query intent)"
    )
    
    # Metadata
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class IntentClassifier:
    """
    Rule-based intent classifier for clinical queries.
    Uses keyword matching and patterns.
    """
    
    # Intent patterns (keyword -> intent)
    INTENT_PATTERNS = {
        QueryIntent.SUMMARY: [
            r"summarize",
            r"summary",
            r"overview",
            r"brief",
            r"case",
            r"what happened",
            r"clinical history",
            r"patient history",
            r"risk factor",
            r"unresolved",
            r"current diagnos",
        ],
        QueryIntent.DIAGNOSIS: [
            r"diagnos(is|es)",
            r"condition",
            r"what (was|is) (the )?diagnos",
            r"final diagnos",
            r"initial diagnos",
        ],
        QueryIntent.DIFFERENTIAL: [
            r"differential",
            r"why (was|did)",
            r"ruled out",
            r"considered",
            r"alternative",
            r"instead of",
            r"versus",
            r"vs\.",
        ],
        QueryIntent.MEDICATION: [
            r"medication",
            r"drug",
            r"prescri(bed|ption)",
            r"antibiotic",
            r"treatment",
            r"therapy",
        ],
        QueryIntent.ALLERGY: [
            r"allerg",
            r"adverse",
            r"reaction",
            r"intoleran",
            r"sensitive",
        ],
        QueryIntent.CHANGE_TRACKING: [
            r"change",
            r"evolv",
            r"progress",
            r"worsen",
            r"improv",
            r"how did .* change",
            r"symptom.* over time",
        ],
        QueryIntent.TREND_ANALYSIS: [
            r"trend",
            r"pattern",
            r"trajectory",
            r"course",
            r"progression",
        ],
        QueryIntent.RATIONALE: [
            r"why",
            r"reason",
            r"rationale",
            r"justif",
            r"explain",
            r"basis",
        ],
        QueryIntent.TIMELINE: [
            r"when",
            r"timeline",
            r"chronology",
            r"sequence",
            r"order",
            r"date",
        ],
        QueryIntent.OUTCOME: [
            r"outcome",
            r"result",
            r"resolved",
            r"recovery",
            r"current status",
            r"how is (the )?patient",
        ],
        QueryIntent.VISUALIZATION: [
            r"(show|generate|plot|render)\s+(me\s+)?(a\s+)?(chart|plot|graph|visual)",
            r"(create|make|build)\s+(a\s+)?(chart|plot|graph|visual)",
            r"visualize\s",
            r"why was.*(discontinued|stopped)",
            r"(renal|cardiac).*(chart|plot|graph)",
            r"(diagnostic|clinical|diagnosis).*(timeline|escalat|evolution|progress)",
            r"(timeline|evolution|escalation|evolv|progress)\s+(of|chart|graph)",
            r"(show|generate|plot).*(?:how|the).*(evolv|progress|timeline).*(?:over|time)",
            r"(evolv|progress).*(over\s+)?time",
        ],
    }
    
    @classmethod
    def classify(cls, query: str) -> Tuple[QueryIntent, float]:
        """
        Classify query intent using pattern matching.
        
        Returns: (intent, confidence)
        """
        query_lower = query.lower()
        
        # Score each intent
        scores: Dict[QueryIntent, int] = {intent: 0 for intent in QueryIntent}
        
        for intent, patterns in cls.INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query_lower):
                    scores[intent] += 1
        
        # Get highest scoring intent
        if max(scores.values()) == 0:
            return QueryIntent.UNKNOWN, 0.0
        
        max_score = max(scores.values())
        
        # Collect all intents with the top score
        top_intents = [i for i, s in scores.items() if s == max_score]
        
        # Tie-breaking: original enum order with VISUALIZATION promoted to top
        priority = [
            QueryIntent.VISUALIZATION,
            QueryIntent.SUMMARY,
            QueryIntent.DIAGNOSIS,
            QueryIntent.DIFFERENTIAL,
            QueryIntent.MEDICATION,
            QueryIntent.ALLERGY,
            QueryIntent.CHANGE_TRACKING,
            QueryIntent.TREND_ANALYSIS,
            QueryIntent.RATIONALE,
            QueryIntent.TIMELINE,
            QueryIntent.OUTCOME,
        ]
        
        best_intent = top_intents[0]
        for p in priority:
            if p in top_intents:
                best_intent = p
                break
        
        total_patterns = len(cls.INTENT_PATTERNS[best_intent])
        
        # Confidence: fraction of patterns matched
        confidence = min(max_score / total_patterns, 1.0)
        
        return best_intent, confidence


class QueryRewriter:
    """
    Augments queries with patient state context.
    NO external assumptions - only uses data from patient state.
    """
    
    @staticmethod
    def build_patient_context_summary(patient_state: PatientState) -> str:
        """
        Build a concise summary of patient state for context injection.
        """
        parts = []
        
        if patient_state.active_diagnosis:
            parts.append(f"Active diagnosis: {', '.join(patient_state.active_diagnosis)}")
        
        if patient_state.allergies:
            parts.append(f"Known allergies: {', '.join(patient_state.allergies)}")
        
        if patient_state.recent_medications:
            parts.append(f"Current medications: {', '.join(patient_state.recent_medications)}")
        
        if patient_state.clinical_status:
            parts.append(f"Clinical status: {patient_state.clinical_status}")
        
        return ". ".join(parts)
    
    @classmethod
    def rewrite_for_intent(
        cls,
        query: str,
        intent: QueryIntent,
        patient_state: PatientState
    ) -> str:
        """
        Rewrite query by augmenting with patient-specific context.
        """
        eoc_context = f"during this patient's episode of care (EOC: {patient_state.eoc_id[:8]}...)"
        
        if intent == QueryIntent.SUMMARY:
            return (
                f"Provide a clinical summary {eoc_context}, "
                f"including presenting symptoms, diagnosis progression, and current status."
            )
        
        elif intent == QueryIntent.DIAGNOSIS:
            if "why" in query.lower() or "final" in query.lower():
                return (
                    f"{query} "
                    f"Explain the diagnostic reasoning {eoc_context}, "
                    f"and why the final diagnosis ({patient_state.active_diagnosis[0] if patient_state.active_diagnosis else 'N/A'}) "
                    f"was selected."
                )
            else:
                return (
                    f"What diagnoses were considered {eoc_context}? "
                    f"Include provisional, differential, and final diagnoses with dates and reasoning."
                )
        
        elif intent == QueryIntent.DIFFERENTIAL:
            return (
                f"{query} "
                f"Explain the differential diagnostic process {eoc_context}, "
                f"including what evidence supported or ruled out each diagnosis."
            )
        
        elif intent == QueryIntent.MEDICATION:
            allergy_note = ""
            if patient_state.allergies:
                allergy_note = f" (Note: Patient has documented allergies to: {', '.join(patient_state.allergies)})"
            
            return (
                f"What medications were prescribed {eoc_context}? "
                f"Include reasons for prescription, timing, and any changes.{allergy_note}"
            )
        
        elif intent == QueryIntent.ALLERGY:
            if patient_state.allergies:
                return (
                    f"Document all known allergies and adverse drug reactions {eoc_context}. "
                    f"Known allergies: {', '.join(patient_state.allergies)}. "
                    f"Provide context about when and how these were identified."
                )
            else:
                return f"Are there any documented allergies or adverse drug reactions {eoc_context}?"
        
        elif intent == QueryIntent.CHANGE_TRACKING:
            return (
                f"{query} "
                f"Track the longitudinal changes {eoc_context}, "
                f"from initial presentation through current status ({patient_state.clinical_status})."
            )
        
        elif intent == QueryIntent.TREND_ANALYSIS:
            return (
                f"{query} "
                f"Analyze the clinical trajectory {eoc_context}, "
                f"identifying key inflection points and their significance."
            )
        
        elif intent == QueryIntent.RATIONALE:
            return (
                f"{query} "
                f"Provide the clinical rationale based on documented evidence {eoc_context}. "
                f"Ground the explanation in temporal sequence and clinical reasoning."
            )
        
        elif intent == QueryIntent.TIMELINE:
            return (
                f"Provide a chronological timeline {eoc_context}, "
                f"spanning {patient_state.first_encounter_date[:10] if patient_state.first_encounter_date else 'N/A'} "
                f"to {patient_state.last_encounter_date[:10] if patient_state.last_encounter_date else 'N/A'}."
            )
        
        elif intent == QueryIntent.OUTCOME:
            return (
                f"What is the current clinical outcome {eoc_context}? "
                f"Status: {patient_state.clinical_status}. "
                f"Provide evidence from recent encounters."
            )
        
        else:
            # Unknown intent: minimal augmentation
            return f"{query} (Context: {eoc_context})"
    
    @classmethod
    def determine_retrieval_hints(cls, intent: QueryIntent) -> Dict[str, bool]:
        """
        Map intent to retrieval strategy hints.
        """
        return {
            "requires_diagnosis_filter": intent in [
                QueryIntent.DIAGNOSIS,
                QueryIntent.DIFFERENTIAL
            ],
            "requires_temporal_ordering": intent in [
                QueryIntent.CHANGE_TRACKING,
                QueryIntent.TIMELINE,
                QueryIntent.TREND_ANALYSIS
            ],
            "requires_graph_expansion": intent in [
                QueryIntent.DIFFERENTIAL,
                QueryIntent.RATIONALE
            ]
        }
    
    @classmethod
    def determine_retrieval_threshold(cls, intent: QueryIntent) -> float:
        """
        Map intent to retrieval threshold.
        Lower thresholds = more encounters included (broader context).
        Higher thresholds = fewer, more relevant encounters (stricter).
        """
        threshold_map = {
            QueryIntent.SUMMARY: 0.10,        # Broader, include more encounters
            QueryIntent.DIAGNOSIS: 0.20,      # Stricter, only high-confidence
            QueryIntent.DIFFERENTIAL: 0.15,   # Medium
            QueryIntent.MEDICATION: 0.18,     # Stricter for drug queries
            QueryIntent.ALLERGY: 0.18,        # Stricter for safety queries
            QueryIntent.CHANGE_TRACKING: 0.12, # Broader for longitudinal view
            QueryIntent.TREND_ANALYSIS: 0.12,  # Broader for pattern detection
            QueryIntent.RATIONALE: 0.15,       # Medium
            QueryIntent.TIMELINE: 0.10,        # Broader for full timeline
            QueryIntent.OUTCOME: 0.15,         # Medium
            QueryIntent.VISUALIZATION: 0.12,   # Broader for chart data
            QueryIntent.UNKNOWN: 0.15,         # Default
        }
        return threshold_map.get(intent, 0.15)


class QueryUnderstanding:
    """
    Main query understanding orchestrator.
    Combines classification and rewriting.
    """
    
    def __init__(self, patient_state: PatientState):
        """
        Initialize with patient state for context-aware processing.
        """
        self.patient_state = patient_state
        self.classifier = IntentClassifier()
        self.rewriter = QueryRewriter()
        
        logger.info(f"Query understanding initialized for EOC {patient_state.eoc_id[:8]}...")
    
    def process_query(self, query: str) -> QueryContext:
        """
        Full pipeline: classify intent + rewrite query + add context.
        
        Args:
            query: Raw user query string
            
        Returns:
            QueryContext with enriched query and retrieval hints
        """
        logger.info(f"Processing query: '{query}'")
        
        # Step 1: Classify intent
        intent, confidence = self.classifier.classify(query)
        logger.info(f"  Intent: {intent.value} (confidence: {confidence:.2f})")
        
        # Step 2: Rewrite query with patient context
        rewritten = self.rewriter.rewrite_for_intent(query, intent, self.patient_state)
        logger.info(f"  Rewritten: '{rewritten[:100]}...'")
        
        # Step 3: Build patient context summary
        patient_context = self.rewriter.build_patient_context_summary(self.patient_state)
        
        # Step 4: Determine retrieval hints
        retrieval_hints = self.rewriter.determine_retrieval_hints(intent)
        
        # Step 5: Determine retrieval threshold based on intent
        retrieval_threshold = self.rewriter.determine_retrieval_threshold(intent)
        
        # Build QueryContext
        context = QueryContext(
            original_query=query,
            intent=intent,
            rewritten_query=rewritten,
            query_normalized=query.lower(),
            patient_state_summary=patient_context,
            confidence=confidence,
            retrieval_threshold=retrieval_threshold,
            **retrieval_hints
        )
        
        return context
    
    def batch_process(self, queries: List[str]) -> List[QueryContext]:
        """Process multiple queries in batch."""
        return [self.process_query(q) for q in queries]


if __name__ == "__main__":
    # Test query understanding
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    
    from src.ingestion.preprocessor import preprocess_json_file
    from src.ingestion.patient_state import PatientStateCompiler
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load data and compile state
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    patient_state = PatientStateCompiler.compile_state(result["timeline"], result["eoc_id"])
    
    # Initialize query understanding
    query_processor = QueryUnderstanding(patient_state)
    
    # Test queries
    test_queries = [
        "What diagnoses were considered?",
        "Why was Mycoplasma Pneumonia the final diagnosis?",
        "What medications were prescribed?",
        "Does the patient have any allergies?",
        "How did the patient's symptoms change over time?",
        "Summarize this case",
        "When did the rash appear?",
        "What was the clinical outcome?",
    ]
    
    print("\n" + "=" * 70)
    print("QUERY UNDERSTANDING TESTS")
    print("=" * 70)
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n[Query {i}] {query}")
        print("-" * 70)
        
        context = query_processor.process_query(query)
        
        print(f"Intent: {context.intent.value} (confidence: {context.confidence:.2f})")
        print(f"\nRewritten Query:")
        print(f"  {context.rewritten_query}")
        print(f"\nRetrieval Hints:")
        print(f"  Diagnosis Filter: {context.requires_diagnosis_filter}")
        print(f"  Temporal Ordering: {context.requires_temporal_ordering}")
        print(f"  Graph Expansion: {context.requires_graph_expansion}")
    
    print("\n" + "=" * 70)
    print("✓ QUERY UNDERSTANDING TESTS COMPLETE")
    print("=" * 70)
    
    # Export sample
    import json
    sample_contexts = [query_processor.process_query(q).dict() for q in test_queries[:3]]
    with open("/home/belal/AI_System/Data/sample_query_contexts.json", 'w') as f:
        json.dump(sample_contexts, f, indent=2)
    print("\n✓ Sample query contexts exported to: Data/sample_query_contexts.json")
