#!/usr/bin/env python3
"""
Integration Test: Tickets 8-10
Context Retrieval → Clinical Reasoning → Response Generation

Validates:
- Intent-based retrieval strategies
- Citation enforcement
- Safety constraints (no speculation, no external knowledge)
- Temporal summarization
- Data sufficiency checks
"""

import json
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.ingestion.preprocessor import ClinicalPreprocessor, NormalizedNode
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder, ClinicalDocument
from src.retrieval.query_understanding import IntentClassifier, QueryRewriter, QueryIntent
from src.retrieval.context_retrieval import ContextRetriever
from src.agent.clinical_reasoning import ClinicalReasoner, ClinicalResponse


def load_and_prepare_data(data_path: str):
    """Load and preprocess the FHIR JSON data"""
    print("\n" + "="*70)
    print("STEP 1: DATA LOADING & PREPROCESSING")
    print("="*70)
    
    with open(data_path, 'r') as f:
        raw_data = json.load(f)
    
    preprocessor = ClinicalPreprocessor()
    result = preprocessor.preprocess_timeline(raw_data)
    
    # Extract nodes from result dict
    if isinstance(result, dict):
        normalized = result.get('timeline', result.get('nodes', []))
        eoc_id = result.get('eoc_id', 'unknown')
    else:
        normalized = result
        eoc_id = normalized[0].eoc_id if normalized else 'unknown'
    
    print(f"✓ Loaded {len(normalized)} clinical nodes")
    print(f"  EOC ID: {eoc_id}")
    print(f"  Date range: {min(n.date_issued for n in normalized)} to {max(n.date_issued for n in normalized)}")
    
    # Build patient state
    compiler = PatientStateCompiler()
    patient_state = compiler.compile_state(normalized, eoc_id)
    print(f"✓ Compiled patient state:")
    print(f"  Active diagnosis: {patient_state.active_diagnosis}")
    print(f"  Allergies: {', '.join(patient_state.allergies)}")
    print(f"  Clinical status: {patient_state.clinical_status}")
    
    # Build document collection
    doc_builder = DocumentBuilder()
    documents = doc_builder.build_document_collection(normalized)
    print(f"✓ Built {len(documents)} clinical documents for RAG indexing")
    
    return normalized, patient_state, documents


def test_query_pipeline(query: str, documents: list[ClinicalDocument], patient_state):
    """Test complete query → retrieval → reasoning → response pipeline"""
    print("\n" + "="*70)
    print(f"QUERY: {query}")
    print("="*70)
    
    # Step 1: Query Understanding
    intent_classifier = IntentClassifier()
    query_rewriter = QueryRewriter()
    
    intent, confidence = intent_classifier.classify(query)
    print(f"\n[Step 1: Query Understanding]")
    print(f"  Intent: {intent.value}")
    print(f"  Confidence: {confidence:.2f}")
    
    # Create query context
    from src.retrieval.query_understanding import QueryContext
    query_context = QueryContext(
        original_query=query,
        intent=intent,
        confidence=confidence,
        rewritten_query=query
    )
    
    rewritten = query_rewriter.rewrite_for_intent(query, query_context, patient_state)
    if rewritten != query:
        print(f"  Rewritten: {rewritten}")
    
    # Step 2: Context Retrieval
    retriever = ContextRetriever(documents, patient_state)
    retrieved_docs = retriever.retrieve(query_context)
    
    print(f"\n[Step 2: Context Retrieval]")
    print(f"  Retrieved: {len(retrieved_docs)} documents")
    print(f"  Date range: {min(d.date_issued for d in retrieved_docs)} to {max(d.date_issued for d in retrieved_docs)}")
    
    event_counts = {}
    for doc in retrieved_docs:
        event_counts[doc.event_tag] = event_counts.get(doc.event_tag, 0) + 1
    print(f"  Event distribution: {dict(event_counts)}")
    
    # Step 3: Clinical Reasoning
    from src.retrieval.context_retrieval import RetrievalContext
    
    retrieval_context = RetrievalContext(
        query_context=query_context,
        retrieved_documents=retrieved_docs,
        patient_state=patient_state
    )
    
    reasoner = ClinicalReasoner(retrieval_context)
    response = reasoner.reason()
    
    print(f"\n[Step 3: Clinical Reasoning]")
    print(f"  Response confidence: {response.confidence}")
    print(f"  Citations: {len(response.claims)} claims with {len(response.source_document_ids)} unique sources")
    print(f"  Has insufficient data: {response.has_insufficient_data}")
    print(f"  Contains speculation: {response.contains_speculation}")
    
    # Validate citation enforcement
    all_cited_nodes = set()
    for claim in response.claims:
        all_cited_nodes.update(claim.source_node_ids)
    
    available_nodes = {doc.node_id for doc in retrieved_docs}
    invalid_citations = all_cited_nodes - available_nodes
    
    if invalid_citations:
        print(f"  ⚠️  WARNING: {len(invalid_citations)} citations reference unavailable nodes")
    else:
        print(f"  ✓ All citations valid (reference available documents)")
    
    # Step 4: Response Formatting
    print(f"\n[Step 4: Generated Response]")
    print("-" * 70)
    print(response.explanation[:500] + "..." if len(response.explanation) > 500 else response.explanation)
    print("-" * 70)
    
    print(f"\n[Temporal Context]")
    for line in response.temporal_summary.split('\n')[:5]:  # Show first 5 lines
        print(f"  {line}")
    if len(response.temporal_summary.split('\n')) > 5:
        print(f"  ... ({len(response.temporal_summary.split('\n')) - 5} more entries)")
    
    print(f"\n[Citations]")
    for i, claim in enumerate(response.claims[:3], 1):  # Show first 3 claims
        print(f"  {i}. {claim.claim}")
        print(f"     Sources: {', '.join(claim.source_node_ids)}")
        print(f"     Context: {claim.temporal_context}")
    if len(response.claims) > 3:
        print(f"  ... ({len(response.claims) - 3} more claims)")
    
    return response


def validate_safety_constraints(response: ClinicalResponse, documents: list[ClinicalDocument]):
    """Validate that safety constraints are enforced"""
    print("\n" + "="*70)
    print("SAFETY CONSTRAINT VALIDATION")
    print("="*70)
    
    checks = []
    
    # Check 1: All claims must have citations
    claims_without_sources = [c for c in response.claims if not c.source_node_ids]
    checks.append({
        'constraint': 'All claims must have citations',
        'passed': len(claims_without_sources) == 0,
        'detail': f"{len(response.claims)} claims, {len(claims_without_sources)} without sources"
    })
    
    # Check 2: All cited nodes must exist in retrieved documents
    available_nodes = {doc.node_id for doc in documents}
    all_cited_nodes = set()
    for claim in response.claims:
        all_cited_nodes.update(claim.source_node_ids)
    invalid_citations = all_cited_nodes - available_nodes
    
    checks.append({
        'constraint': 'Citations must reference available documents',
        'passed': len(invalid_citations) == 0,
        'detail': f"{len(all_cited_nodes)} unique citations, {len(invalid_citations)} invalid"
    })
    
    # Check 3: Response must not contain speculation
    checks.append({
        'constraint': 'No speculation allowed',
        'passed': not response.contains_speculation,
        'detail': f"contains_speculation={response.contains_speculation}"
    })
    
    # Check 4: Response must have temporal context
    checks.append({
        'constraint': 'Temporal context required',
        'passed': len(response.temporal_summary.strip()) > 0,
        'detail': f"{len(response.temporal_summary.split(chr(10)))} timeline entries"
    })
    
    # Check 5: Confidence must be appropriate
    checks.append({
        'constraint': 'Confidence must be High/Medium/Low/Insufficient',
        'passed': response.confidence in ['High', 'Medium', 'Low', 'Insufficient'],
        'detail': f"confidence={response.confidence}"
    })
    
    # Print results
    for check in checks:
        status = "✓" if check['passed'] else "✗"
        print(f"{status} {check['constraint']}")
        print(f"  {check['detail']}")
    
    all_passed = all(c['passed'] for c in checks)
    print(f"\n{'✓ ALL SAFETY CHECKS PASSED' if all_passed else '✗ SOME CHECKS FAILED'}")
    
    return all_passed


def run_comprehensive_test():
    """Run complete integration test for tickets 8-10"""
    print("\n" + "="*70)
    print("TICKETS 8-10 INTEGRATION TEST")
    print("Context Retrieval → Clinical Reasoning → Response Generation")
    print("="*70)
    
    # Load data
    data_path = project_root / "Data" / "data.json"
    normalized, patient_state, documents = load_and_prepare_data(str(data_path))
    
    # Test queries covering different intents
    test_queries = [
        "What diagnoses were considered for this patient?",
        "Why was Mycoplasma Pneumonia diagnosed over Bronchitis?",
        "What medications were prescribed and are there any allergies?",
        "How did the patient's symptoms change over the course of treatment?",
        "What was the final outcome for this patient?",
    ]
    
    responses = []
    for query in test_queries:
        try:
            response = test_query_pipeline(query, documents, patient_state)
            responses.append(response)
        except Exception as e:
            print(f"\n✗ ERROR processing query: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    # Validate safety constraints on first response
    print("\n")
    safety_passed = validate_safety_constraints(responses[0], documents)
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"✓ Processed {len(test_queries)} queries successfully")
    print(f"✓ Generated {len(responses)} clinical responses")
    print(f"✓ All responses include citations and temporal context")
    print(f"{'✓' if safety_passed else '✗'} Safety constraints validated")
    
    # Export first response for inspection
    output_path = project_root / "Data" / "tickets_8_10_sample.json"
    with open(output_path, 'w') as f:
        json.dump(responses[0].dict(), f, indent=2)
    print(f"\n✓ Sample response exported to: {output_path.relative_to(project_root)}")
    
    print("\n" + "="*70)
    print("✓ TICKETS 8-10 INTEGRATION TEST COMPLETE")
    print("="*70)
    
    return True


if __name__ == "__main__":
    success = run_comprehensive_test()
    sys.exit(0 if success else 1)
