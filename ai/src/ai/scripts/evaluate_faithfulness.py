#!/usr/bin/env python3
"""
Faithfulness & Hallucination Detection Evaluator
Measures claim-source alignment for thesis Section 3.6.2 End-to-End Task Evaluation
"""

import sys
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).parent.parent))

# Import directly from modules to avoid __init__.py that imports sentence_transformers
from src.retrieval.query_understanding import IntentClassifier, QueryContext
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder

class FaithfulnessEvaluator:
    def __init__(self):
        # Load test data
        print("🔧 Initializing system...")
        with open('Data/data.json', 'r') as f:
            self.patient_data = json.load(f)
        
        with open('Data/retrieval_ground_truth.json', 'r') as f:
            ground_truth = json.load(f)
            self.test_queries = [
                q for q in ground_truth['queries'] 
                if not q['intent'].startswith('mcp_')
            ]
            self.eoc_id = ground_truth['metadata']['patient_id']
        
        # Initialize system
        preprocessor = ClinicalPreprocessor()
        preprocess_result = preprocessor.preprocess_timeline(self.patient_data)
        self.nodes = preprocess_result['timeline']  # Extract chronological timeline
        
        state_compiler = PatientStateCompiler()
        self.patient_state = state_compiler.compile_state(self.nodes, self.eoc_id)
        
        doc_builder = DocumentBuilder()
        self.docs = doc_builder.build_document_collection(self.nodes)
        
        # Create node lookup (nodes are NormalizedNode objects, use attributes)
        self.node_lookup = {node.id: node for node in self.nodes}
        
        self.classifier = IntentClassifier()
        self.retriever = ContextRetriever(self.docs, self.patient_state)
        # Note: ClinicalReasoner will be instantiated per query with proper RetrievalContext
        
        print(f"✅ System initialized with {len(self.docs)} documents\n")
    
    def extract_claims_and_citations(self, response) -> List[Dict]:
        """
        Extract claims and their cited sources from ClinicalResponse.
        response is a ClinicalResponse Pydantic model.
        """
        # ClinicalResponse has a claims field which is List[CitedClaim]
        extracted_claims = []
        
        for claim in response.claims:
            extracted_claims.append({
                'claim_text': claim.claim,
                'cited_sources': claim.source_node_ids,
                'temporal_context': claim.temporal_context or ''
            })
        
        return extracted_claims
    
    def verify_claim_against_sources(self, claim: Dict) -> Dict:
        """
        Verify if a claim is supported by its cited sources.
        Uses simple text overlap heuristic (can be upgraded to NLI).
        """
        claim_text = claim['claim_text'].lower()
        cited_sources = claim['cited_sources']
        
        if not cited_sources:
            return {
                'supported': False,
                'reason': 'no_citations',
                'confidence': 0.0
            }
        
        # Get source node content
        source_contents = []
        for node_id in cited_sources:
            if node_id in self.node_lookup:
                node = self.node_lookup[node_id]
                # Access NormalizedNode attributes
                content = f"{node.text_primary} {node.details}".lower()
                source_contents.append(content)
        
        if not source_contents:
            return {
                'supported': False,
                'reason': 'invalid_citations',
                'confidence': 0.0
            }
        
        # Simple heuristic: check if key entities/terms from claim appear in sources
        # Extract key medical terms (simplified)
        claim_terms = set(re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', claim['claim_text']))
        claim_terms.update(re.findall(r'\b[a-z]{4,}\b', claim_text))
        
        # Check overlap
        found_terms = 0
        for term in claim_terms:
            if any(term.lower() in content for content in source_contents):
                found_terms += 1
        
        overlap_ratio = found_terms / len(claim_terms) if claim_terms else 0
        supported = overlap_ratio > 0.5  # At least 50% overlap
        
        return {
            'supported': supported,
            'reason': 'text_overlap',
            'confidence': overlap_ratio,
            'overlap_ratio': overlap_ratio,
            'matched_terms': found_terms,
            'total_terms': len(claim_terms)
        }
    
    def evaluate_response_faithfulness(self, query: str) -> Dict:
        """Evaluate faithfulness of response to a single query."""
        print(f"\n{'='*70}")
        print(f"Query: {query}")
        
        # Step 1: Create query context and classify intent
        intent, confidence = self.classifier.classify(query)
        
        query_context = QueryContext(
            original_query=query,
            intent=intent,
            confidence=confidence,
            query_normalized=query.lower(),
            rewritten_query=query
        )
        
        # Step 2: Retrieve relevant documents
        retrieved_docs = self.retriever.retrieve(query_context, max_docs=10)
        print(f"Retrieved {len(retrieved_docs)} documents")
        
        # Step 3: Build RetrievalContext and generate response
        retrieval_context = RetrievalContext(
            query_context=query_context,
            retrieved_documents=retrieved_docs,
            patient_state=self.patient_state
        )
        
        reasoner = ClinicalReasoner(retrieval_context)
        clinical_response = reasoner.reason()
        
        # Extract claims
        claims = self.extract_claims_and_citations(clinical_response)
        print(f"Extracted {len(claims)} claims")
        
        if not claims:
            print("⚠️  No claims extracted (possibly empty response)")
            return {
                'query': query,
                'n_claims': 0,
                'faithfulness_score': 1.0,  # No claims = vacuously faithful
                'supported_claims': 0,
                'unsupported_claims': 0,
                'hallucination_rate': 0.0
            }
        
        # Verify each claim
        verification_results = []
        supported_count = 0
        
        for idx, claim in enumerate(claims, 1):
            verification = self.verify_claim_against_sources(claim)
            verification_results.append({
                'claim_index': idx,
                'claim_text': claim['claim_text'][:100] + '...' if len(claim['claim_text']) > 100 else claim['claim_text'],
                'cited_sources': claim['cited_sources'],
                **verification
            })
            
            if verification['supported']:
                supported_count += 1
                status = "✅"
            else:
                status = "❌"
            
            print(f"  {status} Claim {idx}: {verification['reason']} (confidence: {verification['confidence']:.2f})")
        
        # Calculate metrics
        faithfulness_score = supported_count / len(claims) if claims else 1.0
        hallucination_rate = (len(claims) - supported_count) / len(claims) if claims else 0.0
        
        print(f"\nFaithfulness Score: {faithfulness_score:.3f}")
        print(f"Hallucination Rate: {hallucination_rate:.3f}")
        
        return {
            'query': query,
            'n_claims': len(claims),
            'supported_claims': supported_count,
            'unsupported_claims': len(claims) - supported_count,
            'faithfulness_score': faithfulness_score,
            'hallucination_rate': hallucination_rate,
            'verification_details': verification_results
        }
    
    def run_evaluation(self) -> Dict:
        """Run faithfulness evaluation on all test queries."""
        print(f"{'#'*70}")
        print(f"# FAITHFULNESS & HALLUCINATION DETECTION EVALUATION")
        print(f"# Total Queries: {len(self.test_queries)}")
        print(f"{'#'*70}\n")
        
        results = []
        
        for query_data in self.test_queries:
            query = query_data['query']
            result = self.evaluate_response_faithfulness(query)
            results.append(result)
        
        # Aggregate statistics
        total_claims = sum(r['n_claims'] for r in results)
        total_supported = sum(r['supported_claims'] for r in results)
        total_unsupported = sum(r['unsupported_claims'] for r in results)
        
        aggregate = {
            'total_queries': len(results),
            'total_claims': total_claims,
            'total_supported_claims': total_supported,
            'total_unsupported_claims': total_unsupported,
            'overall_faithfulness_score': total_supported / total_claims if total_claims > 0 else 1.0,
            'overall_hallucination_rate': total_unsupported / total_claims if total_claims > 0 else 0.0,
            'mean_claims_per_query': total_claims / len(results) if results else 0,
            'mean_faithfulness_score': sum(r['faithfulness_score'] for r in results) / len(results) if results else 0
        }
        
        # Print summary
        print(f"\n{'='*70}")
        print("AGGREGATE FAITHFULNESS METRICS")
        print(f"{'='*70}\n")
        print(f"{'Metric':<35} {'Value':>15}")
        print(f"{'-'*70}")
        for metric, value in aggregate.items():
            if 'rate' in metric or 'score' in metric:
                print(f"{metric:<35} {value:>15.3f}")
            else:
                print(f"{metric:<35} {value:>15.0f}")
        print(f"{'='*70}\n")
        
        # Save results
        output = {
            'metadata': {
                'evaluation_date': '2026-01-26',
                'thesis_section': '3.6.2 End-to-End Task Evaluation - Faithfulness',
                'evaluation_method': 'Text overlap heuristic (upgradable to NLI)'
            },
            'aggregate_metrics': aggregate,
            'per_query_results': results
        }
        
        output_path = 'results/faithfulness_evaluation.json'
        Path('results').mkdir(exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"💾 Results saved to: {output_path}\n")
        
        return output

def main():
    evaluator = FaithfulnessEvaluator()
    results = evaluator.run_evaluation()
    
    # Print thesis-ready summary
    print("="*70)
    print("THESIS SECTION 3.6.2 - FAITHFULNESS & HALLUCINATION METRICS")
    print("="*70)
    print(f"\nFaithfulness Evaluation (N = {results['aggregate_metrics']['total_queries']} queries, {results['aggregate_metrics']['total_claims']} claims):")
    print(f"  • Overall Faithfulness Score: {results['aggregate_metrics']['overall_faithfulness_score']:.3f}")
    print(f"  • Hallucination Rate:         {results['aggregate_metrics']['overall_hallucination_rate']:.3f}")
    print(f"  • Supported Claims:           {results['aggregate_metrics']['total_supported_claims']}/{results['aggregate_metrics']['total_claims']}")
    
    print("\nThesis Target Achievement:")
    faith_score = results['aggregate_metrics']['overall_faithfulness_score']
    halluc_rate = results['aggregate_metrics']['overall_hallucination_rate']
    print(f"  • Faithfulness > 0.95:     {'✅ PASS' if faith_score > 0.95 else '❌ FAIL'} ({faith_score:.3f})")
    print(f"  • Hallucination Rate < 0.05: {'✅ PASS' if halluc_rate < 0.05 else '❌ FAIL'} ({halluc_rate:.3f})")
    print("="*70)

if __name__ == "__main__":
    main()
