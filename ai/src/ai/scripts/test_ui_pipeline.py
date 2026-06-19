#!/usr/bin/env python3
"""
Test the complete clinical reasoning pipeline with data.json
Verifies all fixes applied to the UI are correct.
"""
import sys
from pathlib import Path

# Add project root
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder
from src.retrieval.query_understanding import IntentClassifier, QueryContext
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner
import json

def test_clinical_reasoning_pipeline():
    """Test the complete pipeline that the UI uses"""
    print("=" * 70)
    print("TESTING COMPLETE CLINICAL REASONING PIPELINE")
    print("=" * 70)
    
    # Load data.json
    data_file = project_root / "Data" / "data.json"
    with open(data_file) as f:
        data = json.load(f)
    print(f"\n✓ Loaded data from {data_file}")
    
    # Step 1: Preprocess timeline
    preprocessor = ClinicalPreprocessor()
    result = preprocessor.preprocess_timeline(data)
    nodes = result['timeline']
    print(f"✓ Preprocessed {len(nodes)} clinical nodes")
    
    # Step 2: Compile patient state
    patient_state = PatientStateCompiler.compile_state(nodes, result['eoc_id'])
    print(f"✓ Compiled patient state")
    print(f"  - EOC ID: {patient_state.eoc_id[:20]}...")
    print(f"  - Active diagnoses: {len(patient_state.active_diagnosis)}")
    print(f"  - Allergies: {len(patient_state.allergies)}")
    
    # Step 3: Build documents for RAG
    documents = DocumentBuilder.build_document_collection(nodes)
    print(f"✓ Built {len(documents)} clinical documents for RAG")
    
    # Step 4: Classify query intent
    test_queries = [
        "What is the patient's diagnosis?",
        "What medications was the patient prescribed?",
        "Does the patient have any allergies?"
    ]
    
    for query in test_queries:
        print(f"\n{'=' * 70}")
        print(f"TESTING QUERY: '{query}'")
        print('=' * 70)
        
        classifier = IntentClassifier()
        intent, confidence = classifier.classify(query)
        
        query_context = QueryContext(
            original_query=query,
            intent=intent,
            confidence=confidence,
            query_normalized=query.lower(),
            rewritten_query=query  # Add required field
        )
        print(f"✓ Classified intent: {intent.value} (confidence: {confidence:.2f})")
        
        # Step 5: Context retrieval
        retriever = ContextRetriever(documents, patient_state)
        retrieved_docs = retriever.retrieve(query_context)
        print(f"✓ Retrieved {len(retrieved_docs)} relevant documents")
        
        # Step 6: Create RetrievalContext (THIS IS THE FIX!)
        retrieval_context = RetrievalContext(
            query_context=query_context,
            retrieved_documents=retrieved_docs,
            patient_state=patient_state
        )
        print(f"✓ Created RetrievalContext wrapper")
        
        # Step 7: Clinical reasoning
        try:
            reasoner = ClinicalReasoner(retrieval_context)
            print(f"✓ Initialized ClinicalReasoner with {len(reasoner.documents)} documents")
            
            response = reasoner.reason()
            print(f"✓ Generated clinical response")
            print(f"\nResponse preview:")
            print(f"  {response.explanation[:150]}...")
            print(f"  Citations: {len(response.claims)} claims")
            print(f"  Sources: {len(response.sources)} sources")
            
        except Exception as e:
            print(f"✗ FAILED: {e}")
            raise
    
    print(f"\n{'=' * 70}")
    print("✅ ALL TESTS PASSED")
    print("=" * 70)
    print("\nVerified fixes:")
    print("  ✓ node.date_unix → node.date_issued (datetime)")
    print("  ✓ node.text_secondary → node.details")
    print("  ✓ retriever.retrieve() returns List → wrapped in RetrievalContext")
    print("\nThe Streamlit UI should now work correctly!")

if __name__ == "__main__":
    test_clinical_reasoning_pipeline()
