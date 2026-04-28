#!/home/belal/AI_System/.venv/bin/python3
"""
Latency Benchmarking Suite
Measures component timing for thesis Section 3.6.1 Component-Level Evaluation
"""

import sys
import json
import time
from pathlib import Path
from typing import Dict, List
from contextlib import contextmanager

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.query_understanding import IntentClassifier, QueryContext
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder

def percentile(values: List[float], p: float) -> float:
    """Calculate percentile without numpy."""
    if not values:
        return 0.0
    sorted_values = sorted(values)
    k = (len(sorted_values) - 1) * (p / 100)
    f = int(k)
    c = f + 1
    if c >= len(sorted_values):
        c = f
    if f == c:
        return sorted_values[int(k)]
    return sorted_values[f] * (c - k) + sorted_values[c] * (k - f)

def mean(values: List[float]) -> float:
    """Calculate mean without numpy."""
    return sum(values) / len(values) if values else 0.0

def median(values: List[float]) -> float:
    """Calculate median without numpy."""
    if not values:
        return 0.0
    sorted_values = sorted(values)
    n = len(sorted_values)
    mid = n // 2
    if n % 2 == 0:
        return (sorted_values[mid - 1] + sorted_values[mid]) / 2
    return sorted_values[mid]

def std(values: List[float]) -> float:
    """Calculate standard deviation without numpy."""
    if not values:
        return 0.0
    m = mean(values)
    variance = sum((x - m) ** 2 for x in values) / len(values)
    return variance ** 0.5

@contextmanager
def timer(label: str):
    """Context manager for timing code blocks."""
    start = time.perf_counter()
    timing = {}
    yield timing
    duration = time.perf_counter() - start
    timing['duration_ms'] = duration * 1000
    timing['duration_s'] = duration
    timing['label'] = label

class LatencyEvaluator:
    def __init__(self):
        # Load test data
        print("🔧 Initializing system...")
        with open('Data/data.json', 'r') as f:
            self.patient_data = json.load(f)
        
        with open('Data/retrieval_ground_truth.json', 'r') as f:
            ground_truth = json.load(f)
            self.test_queries = [q['query'] for q in ground_truth['queries'] if not q['intent'].startswith('mcp_')]
            self.eoc_id = ground_truth['metadata']['patient_id']
        
        # Initialize system components
        with timer("System Initialization") as t:
            preprocessor = ClinicalPreprocessor()
            preprocess_result = preprocessor.preprocess_timeline(self.patient_data)
            self.nodes = preprocess_result['timeline']  # Extract chronological timeline
            
            state_compiler = PatientStateCompiler()
            self.patient_state = state_compiler.compile_state(self.nodes, self.eoc_id)
            
            doc_builder = DocumentBuilder()
            self.docs = doc_builder.build_document_collection(self.nodes)
            
            self.classifier = IntentClassifier()
            self.retriever = ContextRetriever(self.docs, self.patient_state)
            # Note: ClinicalReasoner will be instantiated per query with proper RetrievalContext
        
        print(f"✅ System initialized in {t['duration_ms']:.0f}ms\n")
    
    def benchmark_single_query(self, query: str) -> Dict:
        """Benchmark a single query through the full pipeline."""
        timings = {}
        
        # 1. Query Understanding
        with timer("1_query_understanding") as t:
            intent, confidence = self.classifier.classify(query)
        timings['query_understanding'] = t
        
        # 2. Query Context Creation
        with timer("2_context_creation") as t:
            query_context = QueryContext(
                original_query=query,
                intent=intent,
                confidence=confidence,
                query_normalized=query.lower(),
                rewritten_query=query
            )
        timings['context_creation'] = t
        
        # 3. Document Retrieval (Vector Search)
        with timer("3_retrieval") as t:
            retrieved_docs = self.retriever.retrieve(query_context, max_docs=10)
        timings['retrieval'] = t
        
        # 4. Retrieval Context Creation
        with timer("4_retrieval_context_build") as t:
            retrieval_context = RetrievalContext(
                query_context=query_context,
                retrieved_documents=retrieved_docs,
                patient_state=self.patient_state
            )
        timings['retrieval_context_build'] = t
        
        # 5. Clinical Reasoning
        with timer("5_reasoning") as t:
            reasoner = ClinicalReasoner(retrieval_context)
            clinical_response = reasoner.reason()
        timings['reasoning'] = t
        
        # 6. Note: The real LLM generation (generate_response node in the agent graph)
        # is NOT measured here. This benchmark covers only the deterministic pipeline
        # (query understanding → retrieval → reasoning). See evaluate_agent_latency.py
        # for end-to-end latency including the actual LLM call.
        with timer("6_narrative_extract") as t:
            try:
                generated_text = clinical_response.explanation if clinical_response else ""
                timings['narrative_extract'] = t
            except Exception as e:
                timings['narrative_extract'] = {'duration_ms': 0, 'error': str(e)}
        
        # Calculate total end-to-end latency
        total_duration_ms = sum(
            t.get('duration_ms', 0) for k, t in timings.items() if k != 'narrative_extract' or 'error' not in t
        )
        
        return {
            'query': query[:80] + '...' if len(query) > 80 else query,
            'timings': timings,
            'total_duration_ms': total_duration_ms,
            'retrieved_docs_count': len(retrieved_docs)
        }
    
    def run_benchmark(self, n_iterations: int = 10) -> Dict:
        """Run benchmark across multiple queries and iterations."""
        print(f"{'='*70}")
        print(f"LATENCY BENCHMARK - {n_iterations} iterations per query")
        print(f"{'='*70}\n")
        
        all_results = []
        
        for query in self.test_queries:
            print(f"\n📊 Benchmarking: {query[:60]}...")
            query_results = []
            
            for i in range(n_iterations):
                result = self.benchmark_single_query(query)
                query_results.append(result)
                if (i + 1) % 5 == 0:
                    print(f"  Iteration {i+1}/{n_iterations} complete")
            
            all_results.extend(query_results)
            
            # Print summary for this query
            latencies = [r['total_duration_ms'] for r in query_results]
            print(f"  ✓ P50: {percentile(latencies, 50):.0f}ms, P95: {percentile(latencies, 95):.0f}ms")
        
        # Aggregate statistics
        print(f"\n{'='*70}")
        print("AGGREGATE LATENCY STATISTICS")
        print(f"{'='*70}\n")
        
        # Overall latencies
        all_latencies = [r['total_duration_ms'] for r in all_results]
        
        stats = {
            'total_iterations': len(all_results),
            'mean_latency_ms': mean(all_latencies),
            'median_latency_ms': median(all_latencies),
            'p50_latency_ms': percentile(all_latencies, 50),
            'p95_latency_ms': percentile(all_latencies, 95),
            'p99_latency_ms': percentile(all_latencies, 99),
            'min_latency_ms': min(all_latencies),
            'max_latency_ms': max(all_latencies),
            'std_latency_ms': std(all_latencies)
        }
        
        print(f"{'Metric':<25} {'Value':>15}")
        print(f"{'-'*70}")
        for metric, value in stats.items():
            print(f"{metric:<25} {value:>15.2f}")
        
        # Component-level breakdown
        print(f"\n{'='*70}")
        print("COMPONENT-LEVEL LATENCY BREAKDOWN (Mean)")
        print(f"{'='*70}\n")
        
        components = ['query_understanding', 'context_creation', 'retrieval', 'retrieval_context_build', 'reasoning', 'narrative_extract']
        component_stats = {}
        
        for comp in components:
            comp_latencies = [
                r['timings'][comp]['duration_ms'] 
                for r in all_results 
                if comp in r['timings'] and 'error' not in r['timings'][comp]
            ]
            if comp_latencies:
                component_stats[comp] = {
                    'mean_ms': mean(comp_latencies),
                    'median_ms': median(comp_latencies),
                    'p95_ms': percentile(comp_latencies, 95)
                }
        
        for comp, stat in component_stats.items():
            print(f"{comp:<25} Mean: {stat['mean_ms']:>8.2f}ms | P95: {stat['p95_ms']:>8.2f}ms")
        
        # Note: Real LLM token generation speed is measured by evaluate_agent_latency.py
        # This benchmark covers only the deterministic pipeline.
        
        # Save results
        output = {
            'metadata': {
                'evaluation_date': '2026-01-26',
                'n_queries': len(self.test_queries),
                'n_iterations': n_iterations,
                'thesis_section': '3.6.1 Component-Level Evaluation - Latency',
                'note': 'Deterministic pipeline only (no LLM). See evaluate_agent_latency.py for end-to-end timing.'
            },
            'aggregate_statistics': stats,
            'component_breakdown': component_stats,
            'deterministic_pipeline_only': True,
            'per_query_results': all_results
        }
        
        output_path = 'results/latency_benchmark.json'
        Path('results').mkdir(exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"💾 Results saved to: {output_path}\n")
        
        return output

def main():
    evaluator = LatencyEvaluator()
    results = evaluator.run_benchmark(n_iterations=10)
    
    # Print thesis-ready summary
    print("="*70)
    print("THESIS SECTION 3.6.1 - LATENCY BENCHMARKS")
    print("="*70)
    print(f"\nEnd-to-End Latency (N = {results['metadata']['n_queries']} queries, {results['metadata']['n_iterations']} iterations each):")
    print(f"  • Mean:   {results['aggregate_statistics']['mean_latency_ms']:.0f}ms")
    print(f"  • Median: {results['aggregate_statistics']['median_latency_ms']:.0f}ms")
    print(f"  • P95:    {results['aggregate_statistics']['p95_latency_ms']:.0f}ms")
    print(f"  • P99:    {results['aggregate_statistics']['p99_latency_ms']:.0f}ms")
    
    print(f"  (Deterministic pipeline only — no LLM. See evaluate_agent_latency.py for full graph timing.)")
    
    print("\nThesis Target Achievement:")
    p95 = results['aggregate_statistics']['p95_latency_ms']
    target_met = p95 < 12000  # 12 second target
    print(f"  • P95 < 12000ms: {'✅ PASS' if target_met else '❌ FAIL'} ({p95:.0f}ms)")
    print("="*70)

if __name__ == "__main__":
    main()
