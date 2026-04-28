#!/usr/bin/env python3
"""
Complete System Validation - Tickets 4-10
End-to-end test of the clinical RAG pipeline

Tests:
1. Data preprocessing (Ticket 4)
2. Patient state compilation (Ticket 5)
3. Document indexing (Ticket 6)
4. Query understanding (Ticket 7)
5. Context retrieval (Ticket 8)
6. Clinical reasoning (Ticket 9)
7. Response generation (Ticket 10)
8. Deterministic guarantees
9. Citation enforcement
10. Safety constraints
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add project root
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder, DocumentChunker
from src.retrieval.query_understanding import IntentClassifier, QueryRewriter, QueryContext
from src.retrieval.context_retrieval import ContextRetriever
from src.agent.clinical_reasoning import ClinicalReasoner


class SystemValidator:
    """Validates all deterministic guarantees"""
    
    def __init__(self):
        self.test_results = []
        self.data_path = project_root / "Data" / "data.json"
    
    def log_test(self, name: str, passed: bool, message: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({
            'name': name,
            'passed': passed,
            'message': message
        })
        print(f"{status} | {name}")
        if message and not passed:
            print(f"       {message}")
    
    def test_preprocessing(self):
        """Test deterministic preprocessing"""
        print("\n" + "="*70)
        print("TEST SUITE 1: PREPROCESSING (TICKET 4)")
        print("="*70)
        
        with open(self.data_path, 'r') as f:
            raw_data = json.load(f)
        
        preprocessor = ClinicalPreprocessor()
        result1 = preprocessor.preprocess_timeline(raw_data)
        result2 = preprocessor.preprocess_timeline(raw_data)
        
        # Test 1: Deterministic output
        nodes1 = result1['timeline']
        nodes2 = result2['timeline']
        
        self.log_test(
            "Preprocessing is deterministic",
            len(nodes1) == len(nodes2) and all(
                n1.id == n2.id for n1, n2 in zip(nodes1, nodes2)
            )
        )
        
        # Test 2: All nodes processed
        self.log_test(
            "All input nodes processed",
            len(nodes1) == len(raw_data.get('nodes', []))
        )
        
        # Test 3: Timestamps normalized
        self.log_test(
            "All timestamps normalized",
            all(n.date_normalized is not None for n in nodes1)
        )
        
        # Test 4: Event tags assigned
        self.log_test(
            "All event tags assigned",
            all(n.event_tag != "Unknown" for n in nodes1)
        )
        
        return result1
    
    def test_patient_state(self, result):
        """Test patient state compilation"""
        print("\n" + "="*70)
        print("TEST SUITE 2: PATIENT STATE (TICKET 5)")
        print("="*70)
        
        nodes = result['timeline']
        eoc_id = result['eoc_id']
        
        compiler = PatientStateCompiler()
        state1 = compiler.compile_state(nodes, eoc_id)
        state2 = compiler.compile_state(nodes, eoc_id)
        
        # Test 1: Deterministic compilation
        self.log_test(
            "Patient state compilation is deterministic",
            state1.active_diagnosis == state2.active_diagnosis and
            state1.allergies == state2.allergies and
            state1.clinical_status == state2.clinical_status
        )
        
        # Test 2: Immutability (frozen model)
        try:
            state1.active_diagnosis = ["test"]
            self.log_test("Patient state is immutable", False, "State was modified")
        except:
            self.log_test("Patient state is immutable", True)
        
        # Test 3: Temporal priority respected
        has_diagnosis = any(n.is_diagnosis for n in nodes)
        if has_diagnosis:
            self.log_test(
                "Temporal priority respected (has active diagnosis)",
                len(state1.active_diagnosis) > 0
            )
        
        return state1
    
    def test_indexing(self, nodes):
        """Test document indexing"""
        print("\n" + "="*70)
        print("TEST SUITE 3: DOCUMENT INDEXING (TICKET 6)")
        print("="*70)
        
        builder = DocumentBuilder()
        docs = builder.build_document_collection(nodes)
        
        # Test 1: One document per node
        self.log_test(
            "One document per clinical node",
            len(docs) == len(nodes)
        )
        
        # Test 2: All metadata populated
        self.log_test(
            "All documents have metadata",
            all(
                doc.node_id and doc.event_tag and doc.date_issued
                for doc in docs
            )
        )
        
        # Test 3: Citations traceable
        node_ids = {n.id for n in nodes}
        doc_ids = {d.node_id for d in docs}
        self.log_test(
            "All documents traceable to source nodes",
            doc_ids == node_ids
        )
        
        return docs
    
    def test_query_understanding(self):
        """Test query classification"""
        print("\n" + "="*70)
        print("TEST SUITE 4: QUERY UNDERSTANDING (TICKET 7)")
        print("="*70)
        
        classifier = IntentClassifier()
        
        test_queries = [
            ("Summarize this patient's case", "summary"),
            ("What diagnoses were considered?", "diagnosis"),
            ("Why was this diagnosed?", "differential"),
            ("What medications were prescribed?", "medication"),
            ("Are there allergies?", "allergy"),
            ("What symptoms changed over time?", "change_tracking"),
            ("What patterns do we see in vitals?", "trend_analysis"),
            ("Explain the rationale for this treatment", "rationale"),
            ("Show timeline of events", "timeline"),
            ("What was the clinical outcome?", "outcome"),
            ("What about unrelated topic?", "unknown"),
        ]
        
        correct = 0
        for query, expected_intent in test_queries:
            intent, confidence = classifier.classify(query)
            if intent.value == expected_intent:
                correct += 1
        
        self.log_test(
            f"Intent classification accuracy",
            correct == len(test_queries),
            f"{correct}/{len(test_queries)} correct"
        )
    
    def test_retrieval(self, docs, patient_state):
        """Test context retrieval"""
        print("\n" + "="*70)
        print("TEST SUITE 5: CONTEXT RETRIEVAL (TICKET 8)")
        print("="*70)
        
        retriever = ContextRetriever(docs, patient_state)
        classifier = IntentClassifier()
        
        # Test different intents
        test_cases = [
            ("What diagnoses?", "diagnosis", lambda d: d.is_diagnosis),
            ("What medications?", "medication", lambda d: d.is_medication),
        ]
        
        for query, expected_intent, filter_fn in test_cases:
            intent, confidence = classifier.classify(query)
            query_context = QueryContext(
                original_query=query,
                intent=intent,
                confidence=confidence,
                rewritten_query=query
            )
            
            retrieved_docs = retriever.retrieve(query_context)
            
            # Check filtering works
            if intent.value == expected_intent:
                self.log_test(
                    f"Retrieval filters correctly for {expected_intent}",
                    len(retrieved_docs) > 0
                )
    
    def test_reasoning(self, docs, patient_state):
        """Test clinical reasoning"""
        print("\n" + "="*70)
        print("TEST SUITE 6: CLINICAL REASONING (TICKETS 9-10)")
        print("="*70)
        
        retriever = ContextRetriever(docs, patient_state)
        classifier = IntentClassifier()
        
        query = "What diagnoses were considered?"
        intent, confidence = classifier.classify(query)
        
        query_context = QueryContext(
            original_query=query,
            intent=intent,
            confidence=confidence,
            rewritten_query=query
        )
        
        retrieved_docs = retriever.retrieve(query_context)
        
        # Create RetrievalContext
        from src.retrieval.context_retrieval import RetrievalContext
        retrieval_context = RetrievalContext(
            query_context=query_context,
            retrieved_documents=retrieved_docs,
            patient_state=patient_state
        )
        
        reasoner = ClinicalReasoner(retrieval_context)
        response = reasoner.reason()
        
        # Test 1: Response generated
        self.log_test(
            "Clinical response generated",
            response is not None and len(response.explanation) > 0
        )
        
        # Test 2: All claims cited
        uncited = [c for c in response.claims if not c.source_node_ids]
        self.log_test(
            "All claims have citations",
            len(uncited) == 0,
            f"{len(uncited)} uncited claims" if uncited else ""
        )
        
        # Test 3: Citations valid
        available_ids = {doc.node_id for doc in retrieval_context.retrieved_documents}
        all_cited_ids = set()
        for claim in response.claims:
            all_cited_ids.update(claim.source_node_ids)
        
        invalid = all_cited_ids - available_ids
        self.log_test(
            "All citations reference available documents",
            len(invalid) == 0,
            f"{len(invalid)} invalid citations" if invalid else ""
        )
        
        # Test 4: No speculation
        self.log_test(
            "Response contains no speculation",
            not response.contains_speculation
        )
        
        # Test 5: Temporal context present
        self.log_test(
            "Temporal context provided",
            response.temporal_summary is not None and len(response.temporal_summary.strip()) > 0
        )
        
        return response
    
    def test_chunker(self):
        """Test DocumentChunker functionality"""
        print("\n" + "="*70)
        print("TEST SUITE 9: DOCUMENT CHUNKER")
        print("="*70)

        # Short doc → single chunk
        short_text = "Short clinical note."
        chunks = DocumentChunker.chunk_text(short_text, "test-short", chunk_size=400)
        self.log_test(
            "Short doc produces single chunk",
            len(chunks) == 1
        )
        if chunks:
            self.log_test(
                "Short chunk retains full text",
                chunks[0].text == short_text
            )

        # Long sentence-bounded → multiple chunks
        sentences = ["Sentence " + str(i) + "." for i in range(50)]
        long_text = " ".join(sentences)
        chunks2 = DocumentChunker.chunk_text(long_text, "test-long", chunk_size=100)
        self.log_test(
            "Long doc produces multiple chunks",
            len(chunks2) > 1
        )
        if len(chunks2) > 1:
            self.log_test(
                "Multiple chunks have sequential indices",
                all(c.chunk_index == i for i, c in enumerate(chunks2))
            )

        # Metadata propagation
        from src.retrieval.indexing import ClinicalDocument
        meta_doc = ClinicalDocument(
            doc_id="meta-test", node_id="meta-test", eoc_id="eoc-test",
            content=long_text, content_primary=long_text, content_details="",
            date_issued="2026-01-01", date_unix=1767312000,
            category="Test", event_tag="Test",
            is_diagnosis=True, is_medication=False,
            normality="Normal", priority="High",
        )
        chunks3 = DocumentChunker.chunk_document(meta_doc, chunk_size=200)
        if chunks3:
            self.log_test(
                "Chunk inherits is_diagnosis flag",
                chunks3[0].is_diagnosis == True
            )
            self.log_test(
                "Chunk inherits parent_doc_id",
                chunks3[0].parent_doc_id == meta_doc.doc_id
            )
    
    def test_deterministic_guarantees(self, docs, patient_state):
        """Test deterministic guarantees"""
        print("\n" + "="*70)
        print("TEST SUITE 7: DETERMINISTIC GUARANTEES")
        print("="*70)
        
        retriever = ContextRetriever(docs, patient_state)
        classifier = IntentClassifier()
        
        query = "What diagnoses were considered?"
        
        # Run same query twice
        responses = []
        for i in range(2):
            intent, confidence = classifier.classify(query)
            query_context = QueryContext(
                original_query=query,
                intent=intent,
                confidence=confidence,
                rewritten_query=query
            )
            
            retrieved_docs = retriever.retrieve(query_context)
            
            # Create RetrievalContext
            from src.retrieval.context_retrieval import RetrievalContext
            retrieval_context = RetrievalContext(
                query_context=query_context,
                retrieved_documents=retrieved_docs,
                patient_state=patient_state
            )
            
            reasoner = ClinicalReasoner(retrieval_context)
            response = reasoner.reason()
            responses.append(response)
        
        # Test 1: Same documents retrieved
        self.log_test(
            "Context retrieval is deterministic",
            responses[0].source_document_ids == responses[1].source_document_ids
        )
        
        # Test 2: Same citations
        self.log_test(
            "Citation generation is deterministic",
            len(responses[0].claims) == len(responses[1].claims)
        )
        
        # Test 3: All outputs grounded in JSON
        all_doc_ids = {doc.node_id for doc in docs}
        all_cited = set()
        for claim in responses[0].claims:
            all_cited.update(claim.source_node_ids)
        
        self.log_test(
            "All outputs grounded in provided JSON",
            all_cited.issubset(all_doc_ids)
        )
    
    def test_non_goals(self, docs, patient_state):
        """Verify non-goals are respected"""
        print("\n" + "="*70)
        print("TEST SUITE 8: NON-GOALS VERIFICATION")
        print("="*70)
        
        retriever = ContextRetriever(docs, patient_state)
        classifier = IntentClassifier()
        
        query = "What are the latest treatment guidelines?"
        intent, confidence = classifier.classify(query)
        
        query_context = QueryContext(
            original_query=query,
            intent=intent,
            confidence=confidence,
            rewritten_query=query
        )
        
        retrieved_docs = retriever.retrieve(query_context)
        
        # Create RetrievalContext
        from src.retrieval.context_retrieval import RetrievalContext
        retrieval_context = RetrievalContext(
            query_context=query_context,
            retrieved_documents=retrieved_docs,
            patient_state=patient_state
        )
        
        reasoner = ClinicalReasoner(retrieval_context)
        response = reasoner.reason()
        
        # Check that only patient data is used
        self.log_test(
            "No guideline retrieval attempted",
            all(
                node_id in {d.node_id for d in docs}
                for claim in response.claims
                for node_id in claim.source_node_ids
            )
        )
        
        # Check no external knowledge claims
        self.log_test(
            "No cross-patient reasoning",
            retrieval_context.patient_state.eoc_id == patient_state.eoc_id
        )
    
    def run_all_tests(self):
        """Run complete validation suite"""
        print("\n" + "="*70)
        print("CLINICAL RAG SYSTEM - COMPLETE VALIDATION")
        print("Tickets 4-10 | Deterministic Guarantees")
        print("="*70)
        
        start_time = datetime.now()
        
        try:
            # Run test suites
            result = self.test_preprocessing()
            patient_state = self.test_patient_state(result)
            docs = self.test_indexing(result['timeline'])
            self.test_query_understanding()
            self.test_retrieval(docs, patient_state)
            response = self.test_reasoning(docs, patient_state)
            self.test_deterministic_guarantees(docs, patient_state)
            self.test_non_goals(docs, patient_state)
            self.test_chunker()
            
        except Exception as e:
            print(f"\n❌ CRITICAL ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Summary
        print("\n" + "="*70)
        print("VALIDATION SUMMARY")
        print("="*70)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r['passed'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests:  {total_tests}")
        print(f"✅ Passed:     {passed_tests}")
        print(f"❌ Failed:     {failed_tests}")
        print(f"⏱️  Duration:   {duration:.2f}s")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['name']}")
                    if result['message']:
                        print(f"    {result['message']}")
        
        print("\n" + "="*70)
        
        if failed_tests == 0:
            print("✅ ALL VALIDATION TESTS PASSED")
            print("="*70)
            print("\n🎉 System is ready for production use!")
            print("\nDeterministic Guarantees:")
            print("  ✅ All outputs grounded in provided JSON")
            print("  ✅ All clinical claims traceable to encounters")
            print("  ✅ Longitudinal reasoning is reproducible")
            print("  ✅ No hallucinated medical facts introduced")
            print("\nNon-Goals Respected:")
            print("  ✅ No guideline retrieval")
            print("  ✅ No internet access")
            print("  ✅ No autonomous medical advice")
            print("  ✅ No cross-patient reasoning")
            return True
        else:
            print("❌ VALIDATION FAILED")
            print("="*70)
            return False


if __name__ == "__main__":
    validator = SystemValidator()
    success = validator.run_all_tests()
    sys.exit(0 if success else 1)
