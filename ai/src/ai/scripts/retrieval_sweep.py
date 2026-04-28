#!/usr/bin/env python3
"""
Combined Retrieval Parameter Sweep & Embedding Evaluation.
Tests multiple configurations and outputs comparison tables.
"""
import sys
import json
import time
from pathlib import Path
from collections import defaultdict
from typing import List, Dict, Set, Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from src.retrieval.config import retriever_config
from src.retrieval.service import HybridRetriever, _reciprocal_rank_fusion
from src.shared.db_clients import qdrant_client
from src.ingestion.service import IngestionService


GROUND_TRUTH_PATH = "Data/retrieval_ground_truth.json"


def load_ground_truth() -> tuple:
    with open(GROUND_TRUTH_PATH) as f:
        data = json.load(f)
    queries = data["queries"]
    # Filter to RAG queries (skip MCP queries)
    rag_queries = [q for q in queries if q.get("intent") != "mcp" and q.get("query_id")]
    return rag_queries, data["metadata"]


class DenseRetriever:
    def __init__(self, model_name: str):
        from fastembed import TextEmbedding
        self.model = TextEmbedding(model_name=model_name)
        self.doc_embeddings = None
        self.doc_ids = []

    def index(self, docs: List[Dict]):
        texts = [d.get("content", "") or d.get("text_1", "") for d in docs]
        self.doc_ids = [d.get("id") or d.get("doc_id", str(i)) for i, d in enumerate(docs)]
        embeds = list(self.model.embed(texts))
        self.doc_embeddings = np.array([e.tolist() for e in embeds])

    def search(self, query: str, k: int = 10):
        q_emb = list(self.model.embed([query]))[0]
        q_emb = np.array(q_emb).reshape(1, -1)
        sims = cosine_similarity(q_emb, self.doc_embeddings)[0]
        top_k = np.argsort(sims)[::-1][:k]
        return [(self.doc_ids[i], sims[i]) for i in top_k]


def evaluate_recall_at_k(retrieved_ids: List[str], relevant_ids: Set[str], k: int) -> float:
    if not relevant_ids:
        return 1.0
    retrieved_k = set(retrieved_ids[:k])
    return len(retrieved_k & relevant_ids) / len(relevant_ids)


def compute_mrr(retrieved_ids: List[str], relevant_ids: Set[str]) -> float:
    if not relevant_ids:
        return 1.0
    for i, doc_id in enumerate(retrieved_ids, 1):
        if doc_id in relevant_ids:
            return 1.0 / i
    return 0.0


def evaluate_hybrid_config(
    retriever: HybridRetriever,
    patient_id: str,
    queries: List[Dict],
    config_overrides: Optional[Dict] = None,
) -> Dict:
    if config_overrides:
        for k, v in config_overrides.items():
            setattr(retriever.config, k, v)

    all_recall_1 = []
    all_recall_3 = []
    all_recall_5 = []
    all_recall_10 = []
    all_mrr = []
    all_precision = []
    all_recall = []

    for q in queries:
        query_text = q["query"]
        relevant = set(q["relevant_node_ids"])

        start = time.time()
        results = retriever.search(patient_id=patient_id, query=query_text, limit=10)
        elapsed = time.time() - start

        # Qdrant point IDs are UUID5 hashes — compare against the original ID in payload
        retrieved_ids = [r.anchor_id for r in results]

        recall_1 = evaluate_recall_at_k(retrieved_ids, relevant, 1)
        recall_3 = evaluate_recall_at_k(retrieved_ids, relevant, 3)
        recall_5 = evaluate_recall_at_k(retrieved_ids, relevant, 5)
        recall_10 = evaluate_recall_at_k(retrieved_ids, relevant, 10)
        mrr = compute_mrr(retrieved_ids, relevant)

        tp = len(set(retrieved_ids) & relevant)
        fp = len(set(retrieved_ids) - relevant)
        fn = len(relevant - set(retrieved_ids))
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0

        all_recall_1.append(recall_1)
        all_recall_3.append(recall_3)
        all_recall_5.append(recall_5)
        all_recall_10.append(recall_10)
        all_mrr.append(mrr)
        all_precision.append(precision)
        all_recall.append(recall)

    return {
        "recall@1": np.mean(all_recall_1),
        "recall@3": np.mean(all_recall_3),
        "recall@5": np.mean(all_recall_5),
        "recall@10": np.mean(all_recall_10),
        "mrr": np.mean(all_mrr),
        "precision": np.mean(all_precision),
        "recall": np.mean(all_recall),
        "latency_ms": elapsed * 1000,
    }


def run_embedding_evaluation(queries, metadata, all_docs, relevant_ids_by_query):
    print("\n" + "="*60)
    print("PHASE 2: EMBEDDING MODEL EVALUATION")
    print("="*60)

    models_to_test = [
        ("BAAI/bge-base-en-v1.5", 768, "current"),
        ("BAAI/bge-small-en-v1.5", 384, "lightweight"),
        ("sentence-transformers/all-MiniLM-L6-v2", 384, "baseline"),
    ]

    results = []
    for model_name, dim, label in models_to_test:
        print(f"\n  Testing: {model_name} ({label}, {dim}d)...")
        try:
            retriever = DenseRetriever(model_name)
            retriever.index(all_docs)

            recall_1, recall_3, recall_5, recall_10, mrrs = [], [], [], [], []
            elapsed_total = 0.0

            for q in queries:
                q_text = q["query"]
                relevant = set(q["relevant_node_ids"])

                start = time.time()
                results_list = retriever.search(q_text, k=10)
                elapsed_total += time.time() - start

                retrieved_ids = [r[0] for r in results_list]
                recall_1.append(evaluate_recall_at_k(retrieved_ids, relevant, 1))
                recall_3.append(evaluate_recall_at_k(retrieved_ids, relevant, 3))
                recall_5.append(evaluate_recall_at_k(retrieved_ids, relevant, 5))
                recall_10.append(evaluate_recall_at_k(retrieved_ids, relevant, 10))
                mrrs.append(compute_mrr(retrieved_ids, relevant))

            results.append({
                "model": model_name,
                "label": label,
                "dim": dim,
                "recall@1": f"{np.mean(recall_1):.3f}",
                "recall@3": f"{np.mean(recall_3):.3f}",
                "recall@5": f"{np.mean(recall_5):.3f}",
                "recall@10": f"{np.mean(recall_10):.3f}",
                "mrr": f"{np.mean(mrrs):.3f}",
                "latency_ms": f"{(elapsed_total/len(queries))*1000:.1f}",
            })
        except Exception as e:
            print(f"    FAILED: {e}")

    # Print table
    print(f"\n  {'Model':<45} {'Dim':<5} {'R@1':<7} {'R@3':<7} {'R@5':<7} {'R@10':<7} {'MRR':<7} {'Lat(ms)':<8}")
    print("  " + "-"*93)
    for r in results:
        print(f"  {r['model']:<45} {r['dim']:<5} {r['recall@1']:<7} {r['recall@3']:<7} {r['recall@5']:<7} {r['recall@10']:<7} {r['mrr']:<7} {r['latency_ms']:<8}")

    return results


def run_parameter_sweep(queries, metadata):
    print("\n" + "="*60)
    print("PHASE 3c: PARAMETER SWEEP")
    print("="*60)

    patient_id = metadata["patient_id"]
    retriever = HybridRetriever()
    baseline = evaluate_hybrid_config(retriever, patient_id, queries)
    print(f"  Baseline (default config):")
    print(f"    R@1={baseline['recall@1']:.3f} R@3={baseline['recall@3']:.3f} R@5={baseline['recall@5']:.3f} R@10={baseline['recall@10']:.3f} MRR={baseline['mrr']:.3f}")

    sweeps = {
        "prefetch_multiplier": [1, 2, 3, 5],
        "rrf_rank_constant": [30, 60, 100],
        "fusion_score_threshold": [None, 0.005, 0.01, 0.02],
        "dense_score_threshold": [0.4, 0.5, 0.6, 0.7],
    }

    for param, values in sweeps.items():
        print(f"\n  Sweeping: {param}")
        print(f"  {'Value':<10} {'R@1':<7} {'R@3':<7} {'R@5':<7} {'R@10':<7} {'MRR':<7} {'Lat(ms)':<8}")
        print(f"  {'-'*53}")
        for val in values:
            overrides = {param: val}
            result = evaluate_hybrid_config(retriever, patient_id, queries, overrides)
            latency = result.get("latency_ms", 0)
            print(f"  {str(val):<10} {result['recall@1']:<7.3f} {result['recall@3']:<7.3f} {result['recall@5']:<7.3f} {result['recall@10']:<7.3f} {result['mrr']:<7.3f} {latency:<8.1f}")


def main():
    queries, metadata = load_ground_truth()
    patient_id = metadata["patient_id"]
    print(f"Loaded {len(queries)} RAG queries for patient {patient_id}")

    with open("Data/data.json") as f:
        patient_data = json.load(f)

    all_docs = [n for n in patient_data.get("nodes", [])]
    print(f"Loaded {len(all_docs)} documents")

    # Phase 2: Embedding models
    run_embedding_evaluation(queries, metadata, all_docs, None)

    # Phase 3c: Parameter sweep
    run_parameter_sweep(queries, metadata)

    print("\nDone!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
