#!/usr/bin/env python3
"""
Retrieval Recall@K Evaluator
Measures retrieval quality for thesis Section 3.6.1 Component-Level Evaluation
"""

import sys
import json
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, List, Set, Tuple

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.query_understanding import IntentClassifier, QueryContext
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder

class RetrievalRecallEvaluator:
    def __init__(self, ground_truth_path: str = "Data/retrieval_ground_truth.json", backend: str = "context"):
        with open(ground_truth_path, 'r') as f:
            self.ground_truth_data = json.load(f)
        
        self.queries = self.ground_truth_data['queries']
        self.metadata = self.ground_truth_data['metadata']
        self.backend = backend
        
        # Load patient data
        with open('Data/data.json', 'r') as f:
            self.patient_data = json.load(f)
        
        # Initialize system components
        print(f"Initializing Clinical RAG System (backend={backend})...")
        preprocessor = ClinicalPreprocessor()
        preprocess_result = preprocessor.preprocess_timeline(self.patient_data)
        self.nodes = preprocess_result['timeline']  # Extract chronological timeline
        
        state_compiler = PatientStateCompiler()
        self.patient_state = state_compiler.compile_state(self.nodes, self.metadata['patient_id'])
        
        doc_builder = DocumentBuilder()
        self.docs = doc_builder.build_document_collection(self.nodes)
        
        self.classifier = IntentClassifier()
        
        if backend == "hybrid":
            try:
                from src.retrieval.service import HybridRetriever
                self.retriever = HybridRetriever()
                print(f"Using HybridRetriever (Qdrant backend)")
            except Exception as e:
                print(f"Failed to init HybridRetriever, falling back to ContextRetriever: {e}")
                from src.retrieval.context_retrieval import ContextRetriever
                self.retriever = ContextRetriever(self.docs, self.patient_state)
        else:
            from src.retrieval.context_retrieval import ContextRetriever
            self.retriever = ContextRetriever(self.docs, self.patient_state)
        
        print(f"Loaded {len(self.docs)} documents, {len(self.queries)} queries\n")
    
    def compute_recall_at_k(self, retrieved_ids: List[str], relevant_ids: Set[str], k: int) -> float:
        """
        Recall@K = |retrieved[:k] ∩ relevant| / |relevant|
        """
        if not relevant_ids:
            return 1.0  # If no relevant docs, treat as perfect (MCP queries)
        
        retrieved_k = set(retrieved_ids[:k])
        intersection = retrieved_k & relevant_ids
        recall = len(intersection) / len(relevant_ids)
        return recall
    
    def compute_mrr(self, retrieved_ids: List[str], relevant_ids: Set[str]) -> float:
        """
        Mean Reciprocal Rank = 1 / rank_of_first_relevant
        """
        if not relevant_ids:
            return 1.0
        
        for idx, doc_id in enumerate(retrieved_ids, 1):
            if doc_id in relevant_ids:
                return 1.0 / idx
        return 0.0
    
    def evaluate_query(self, query_data: Dict) -> Dict:
        """Evaluate a single query."""
        query_id = query_data['query_id']
        query_text = query_data['query']
        intent_str = query_data['intent']
        relevant_ids = set(query_data['relevant_node_ids'])
        
        print(f"\n{'='*70}")
        print(f"Query ID: {query_id}")
        print(f"Query: {query_text}")
        print(f"Expected Intent: {intent_str}")
        print(f"Relevant Docs: {len(relevant_ids)}")
        
        # Skip MCP queries (no local retrieval)
        if intent_str.startswith('mcp_'):
            print("⏭️  Skipping MCP query (no local retrieval evaluation)")
            return {
                'query_id': query_id,
                'skipped': True,
                'reason': 'MCP query - routes to external tools'
            }
        
        # Classify intent
        intent, confidence = self.classifier.classify(query_text)
        print(f"Detected Intent: {intent} (confidence: {confidence:.2f})")
        
        # Create query context
        query_context = QueryContext(
            original_query=query_text,
            intent=intent,
            confidence=confidence,
            query_normalized=query_text.lower(),
            rewritten_query=query_text
        )
        
        # Retrieve documents — different interfaces per backend
        if self.backend == "hybrid":
            try:
                hybrid_results = self.retriever.search(
                    patient_id=self.metadata['patient_id'],
                    query=query_text,
                    limit=50,
                    intent=str(intent.value) if intent.value != "unknown" else None,
                )
                retrieved_ids = [r.anchor_id for r in hybrid_results]
            except Exception as e:
                print(f"Hybrid search failed: {e}")
                retrieved_ids = []
        else:
            retrieval_context = RetrievalContext(
                query_context=query_context,
                retrieved_documents=[],
                patient_state=self.patient_state
            )
            retrieved_docs = self.retriever.retrieve(query_context, max_docs=50)
            retrieved_ids = [doc.node_id for doc in retrieved_docs]
        
        print(f"Retrieved: {len(retrieved_ids)} documents")
        print(f"Retrieved IDs: {retrieved_ids[:5]}{'...' if len(retrieved_ids) > 5 else ''}")
        
        # Compute metrics for K = [1, 3, 5, 10]
        k_values = [1, 3, 5, 10]
        recall_at_k = {}
        
        for k in k_values:
            recall = self.compute_recall_at_k(retrieved_ids, relevant_ids, k)
            recall_at_k[f'recall@{k}'] = recall
            print(f"  Recall@{k}: {recall:.3f}")
        
        # Compute MRR
        mrr = self.compute_mrr(retrieved_ids, relevant_ids)
        print(f"  MRR: {mrr:.3f}")
        
        # Analyze retrieval
        tp = len(set(retrieved_ids) & relevant_ids)
        fp = len(set(retrieved_ids) - relevant_ids)
        fn = len(relevant_ids - set(retrieved_ids))
        
        precision = tp / len(retrieved_ids) if retrieved_ids else 0
        recall = tp / len(relevant_ids) if relevant_ids else 0
        
        print(f"\nRetrieval Analysis:")
        print(f"  True Positives: {tp}")
        print(f"  False Positives: {fp}")
        print(f"  False Negatives: {fn}")
        print(f"  Precision: {precision:.3f}")
        print(f"  Recall: {recall:.3f}")
        
        return {
            'query_id': query_id,
            'query': query_text,
            'expected_intent': intent_str,
            'detected_intent': str(intent),
            'intent_confidence': confidence,
            'relevant_count': len(relevant_ids),
            'retrieved_count': len(retrieved_ids),
            **recall_at_k,
            'mrr': mrr,
            'precision': precision,
            'recall': recall,
            'true_positives': tp,
            'false_positives': fp,
            'false_negatives': fn,
            'retrieved_ids': retrieved_ids[:10],  # Top 10 for inspection
            'skipped': False
        }
    
    def evaluate_all(self) -> Dict:
        """Evaluate all queries and compute aggregate metrics."""
        results = []
        
        # Filter only local RAG queries (exclude MCP)
        local_queries = [q for q in self.queries if not q['intent'].startswith('mcp_')]
        
        print(f"\n{'#'*70}")
        print(f"# RETRIEVAL RECALL EVALUATION")
        print(f"# Patient: {self.metadata['patient_id']}")
        print(f"# Backend: {self.backend}")
        print(f"# Total Queries: {len(local_queries)} (excluding {len(self.queries) - len(local_queries)} MCP queries)")
        print(f"{'#'*70}\n")
        
        for query_data in local_queries:
            result = self.evaluate_query(query_data)
            results.append(result)
        
        # Compute aggregate metrics
        valid_results = [r for r in results if not r.get('skipped', False)]
        
        if not valid_results:
            print("\n❌ No valid results to aggregate")
            return {'error': 'No valid queries evaluated'}
        
        aggregate = {
            'recall@1_mean': np.mean([r['recall@1'] for r in valid_results]),
            'recall@3_mean': np.mean([r['recall@3'] for r in valid_results]),
            'recall@5_mean': np.mean([r['recall@5'] for r in valid_results]),
            'recall@10_mean': np.mean([r['recall@10'] for r in valid_results]),
            'mrr_mean': np.mean([r['mrr'] for r in valid_results]),
            'precision_mean': np.mean([r['precision'] for r in valid_results]),
            'recall_mean': np.mean([r['recall'] for r in valid_results]),
        }
        
        # Print summary table
        print(f"\n{'='*70}")
        print("AGGREGATE METRICS (Mean across all queries)")
        print(f"{'='*70}")
        print(f"{'Metric':<20} {'Value':>10}")
        print(f"{'-'*70}")
        for metric, value in aggregate.items():
            print(f"{metric:<20} {value:>10.3f}")
        print(f"{'='*70}\n")
        
        # Save results
        output = {
            'metadata': self.metadata,
            'aggregate_metrics': aggregate,
            'per_query_results': results,
            'evaluation_date': '2026-01-26',
            'thesis_section': '3.6.1 Component-Level Evaluation - Retrieval Recall@K'
        }
        
        output_path = 'results/retrieval_recall_evaluation.json'
        Path('results').mkdir(exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"💾 Results saved to: {output_path}")
        
        return output

def main():
    parser = argparse.ArgumentParser(description="Retrieval Recall@K Evaluator")
    parser.add_argument(
        "--backend", choices=["context", "hybrid"], default="context",
        help="Retrieval backend: context (in-memory ContextRetriever) or hybrid (Qdrant HybridRetriever)"
    )
    args = parser.parse_args()

    evaluator = RetrievalRecallEvaluator(backend=args.backend)
    results = evaluator.evaluate_all()
    
    # Print thesis-ready summary
    print("\n" + "="*70)
    print("THESIS SECTION 3.6.1 - RETRIEVAL QUALITY METRICS")
    print("="*70)
    print(f"\nRetrieval Recall@K (N = {len([r for r in results['per_query_results'] if not r.get('skipped')])} queries):")
    print(f"  • Recall@1:  {results['aggregate_metrics']['recall@1_mean']:.3f}")
    print(f"  • Recall@3:  {results['aggregate_metrics']['recall@3_mean']:.3f}")
    print(f"  • Recall@5:  {results['aggregate_metrics']['recall@5_mean']:.3f}")
    print(f"  • Recall@10: {results['aggregate_metrics']['recall@10_mean']:.3f}")
    print(f"  • MRR:       {results['aggregate_metrics']['mrr_mean']:.3f}")
    print(f"  • Precision: {results['aggregate_metrics']['precision_mean']:.3f}")
    print("="*70)
    
    # Check if meets thesis targets
    recall_3 = results['aggregate_metrics']['recall@3_mean']
    recall_10 = results['aggregate_metrics']['recall@10_mean']
    
    print("\nThesis Target Achievement:")
    print(f"  • Recall@3 > 0.90:  {'✅ PASS' if recall_3 > 0.90 else '❌ FAIL'} ({recall_3:.3f})")
    print(f"  • Recall@10 > 0.95: {'✅ PASS' if recall_10 > 0.95 else '❌ FAIL'} ({recall_10:.3f})")
    print()

if __name__ == "__main__":
    main()
