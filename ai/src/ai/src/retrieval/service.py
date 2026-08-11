from typing import List, Dict, Any, Optional
from collections import defaultdict
import logging
import math

from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    NamedSparseVector,
    SparseVector,
)
from src.shared.db_clients import qdrant_client
from src.shared.models import RetrievedContext
from src.ingestion.service import IngestionService
from src.retrieval.config import retriever_config

logger = logging.getLogger(__name__)


# Intent → list of FieldConditions that should match (OR logic).
# The patient_id is always AND-ed; intent flags below use SHOULD (any can match).
# This mirrors the RetrievalStrategy methods in context_retrieval.py.
_INTENT_FILTER_MAP: Dict[str, Optional[List[FieldCondition]]] = {
    # No filter — return all documents for the patient
    "summary": None,
    "timeline": None,
    "unknown": None,
    # diagnosis-only
    "diagnosis": [FieldCondition(key="is_diagnosis", match=MatchValue(value=True))],
    # diagnosis + evidence (symptoms, investigations, allergies, medications)
    "differential": [
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
        FieldCondition(key="is_symptom", match=MatchValue(value=True)),
        FieldCondition(key="is_allergy", match=MatchValue(value=True)),
        FieldCondition(key="is_medication", match=MatchValue(value=True)),
        FieldCondition(key="event_tag", match=MatchValue(value="Investigation")),
    ],
    # medications + diagnoses + allergies + symptoms + outcomes
    "medication": [
        FieldCondition(key="is_medication", match=MatchValue(value=True)),
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
        FieldCondition(key="is_allergy", match=MatchValue(value=True)),
        FieldCondition(key="is_symptom", match=MatchValue(value=True)),
        FieldCondition(key="is_outcome", match=MatchValue(value=True)),
    ],
    # allergy (same as medication strategy — allergy context includes related symptoms + outcomes)
    "allergy": [
        FieldCondition(key="is_allergy", match=MatchValue(value=True)),
        FieldCondition(key="is_medication", match=MatchValue(value=True)),
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
        FieldCondition(key="is_symptom", match=MatchValue(value=True)),
        FieldCondition(key="is_outcome", match=MatchValue(value=True)),
    ],
    # symptoms + outcomes + diagnoses
    "change_tracking": [
        FieldCondition(key="is_symptom", match=MatchValue(value=True)),
        FieldCondition(key="is_outcome", match=MatchValue(value=True)),
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
    ],
    # interventions (meds) + outcomes + diagnoses
    "trend_analysis": [
        FieldCondition(key="is_medication", match=MatchValue(value=True)),
        FieldCondition(key="is_outcome", match=MatchValue(value=True)),
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
    ],
    # outcomes + final diagnosis + recent medications
    "outcome": [
        FieldCondition(key="is_outcome", match=MatchValue(value=True)),
        FieldCondition(key="is_diagnosis", match=MatchValue(value=True)),
        FieldCondition(key="is_medication", match=MatchValue(value=True)),
    ],
    # diagnosis + medication + allergy (needs full clinical context)
    "rationale": None,
}


def _build_intent_should(intent: Optional[str]) -> Optional[List[FieldCondition]]:
    """Return SHOULD conditions for a clinical intent, or None if no filter needed."""
    if not intent or not retriever_config.intent_filter_enabled:
        return None
    return _INTENT_FILTER_MAP.get(intent)


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _hit_dense_vector(hit: Any, vector_name: str) -> Optional[List[float]]:
    vec = getattr(hit, "vector", None)
    if isinstance(vec, dict):
        return vec.get(vector_name)
    if isinstance(vec, list):
        return vec
    return None


def _reciprocal_rank_fusion(
    dense_results: list,
    sparse_results: list,
    limit: int,
    rank_constant: int = 60,
    score_threshold: Optional[float] = None,
) -> list:
    scores = defaultdict(float)

    for rank, hit in enumerate(dense_results):
        doc_id = str(hit.id)
        scores[doc_id] += 1.0 / (rank_constant + rank + 1)

    for rank, hit in enumerate(sparse_results):
        doc_id = str(hit.id)
        scores[doc_id] += 1.0 / (rank_constant + rank + 1)

    sorted_ids = sorted(scores.items(), key=lambda x: -x[1])

    id_to_hit = {}
    for hit in dense_results:
        id_to_hit[str(hit.id)] = hit
    for hit in sparse_results:
        if str(hit.id) not in id_to_hit:
            id_to_hit[str(hit.id)] = hit

    merged = []
    for doc_id, rrf_score in sorted_ids:
        if score_threshold is not None and rrf_score < score_threshold:
            continue
        hit = id_to_hit.get(doc_id)
        if hit:
            merged.append((hit, rrf_score))
        if len(merged) >= limit:
            break

    return merged


class HybridRetriever:
    def __init__(self, config: Optional[Any] = None):
        self.config = config or retriever_config

    def search(
        self,
        patient_id: str,
        query: str,
        limit: Optional[int] = None,
        score_threshold: Optional[float] = None,
        intent: Optional[str] = None,
        use_intent_filter: bool = True,
        mode: str = "hybrid",
    ) -> List[RetrievedContext]:
        """
        mode: "hybrid" (dense + sparse, RRF), "dense" or "sparse". The
        single-list modes exist for the retrieval study (R1); the agent
        always uses "hybrid".
        """
        logger.info(f"Hybrid Search for Patient {patient_id}: '{query}'")

        limit = limit or self.config.default_top_k
        prefetch_k = limit * self.config.prefetch_multiplier
        rrf_k = self.config.rrf_rank_constant
        fallback_threshold = score_threshold if score_threshold is not None else self.config.dense_score_threshold

        dense_vector = IngestionService.get_embedding(query)
        sparse_data = IngestionService.get_sparse_embedding(query)

        q_client = qdrant_client.connect()
        collection = qdrant_client.collection_name

        # Build filter: patient_id is mandatory when provided; intent flags are optional (OR)
        # If patient_id is empty/None, search across all patients (single-patient collections)
        must_conditions = []
        if patient_id:
            must_conditions.append(
                FieldCondition(key="patient_id", match=MatchValue(value=patient_id))
            )
        should_conditions = _build_intent_should(intent) if use_intent_filter else None
        if should_conditions:
            logger.info(f"Applied intent filter '{intent}': {should_conditions}")
            query_filter = Filter(must=must_conditions or None, should=should_conditions) if must_conditions else Filter(should=should_conditions)
        else:
            query_filter = Filter(must=must_conditions) if must_conditions else None

        # Dense vectors come back with every hit so the query/chunk cosine can
        # be computed uniformly, including for hits only the sparse list found.
        with_vectors = [self.config.dense_vector_name]

        try:
            dense_results = []
            if mode in ("hybrid", "dense"):
                dense_results = q_client.search(
                    collection_name=collection,
                    query_vector=(self.config.dense_vector_name, dense_vector),
                    limit=prefetch_k,
                    query_filter=query_filter,
                    with_vectors=with_vectors,
                )

            sparse_results = []
            if sparse_data and mode in ("hybrid", "sparse"):
                sparse_results = q_client.search(
                    collection_name=collection,
                    query_vector=NamedSparseVector(
                        name=self.config.sparse_vector_name,
                        vector=SparseVector(
                            indices=sparse_data["indices"],
                            values=sparse_data["values"],
                        ),
                    ),
                    limit=prefetch_k,
                    query_filter=query_filter,
                    with_vectors=with_vectors,
                )

            # (hit, score) pairs: the RRF score for fused results, the
            # engine's own score for single-list results.
            if mode == "sparse":
                scored_hits = [(h, h.score) for h in sparse_results[:limit]]
            elif sparse_results and dense_results:
                scored_hits = _reciprocal_rank_fusion(
                    dense_results,
                    sparse_results,
                    limit=limit,
                    rank_constant=rrf_k,
                    score_threshold=self.config.fusion_score_threshold,
                )
            else:
                scored_hits = [(h, h.score) for h in dense_results[:limit]]

        except Exception as e:
            logger.warning(f"Hybrid search failed ({e}), falling back to Dense-only.")
            fallback_hits = q_client.search(
                collection_name=collection,
                query_vector=(self.config.dense_vector_name, dense_vector),
                limit=limit,
                score_threshold=fallback_threshold,
                query_filter=query_filter,
                with_vectors=with_vectors,
            )
            scored_hits = [(h, h.score) for h in fallback_hits]

        results = []
        rrf_scores = []
        for hit, score in scored_hits:
            original_id = hit.payload.get("id", str(hit.id))
            hit_vector = _hit_dense_vector(hit, self.config.dense_vector_name)
            dense_cosine = _cosine(dense_vector, hit_vector) if hit_vector else None
            results.append(
                RetrievedContext(
                    anchor_id=str(original_id),
                    anchor_content=hit.payload.get("toon_content", ""),
                    score=score,
                    parent_node_id=hit.payload.get("parent_node_id"),
                    father_id=hit.payload.get("father_id"),
                    date_issued=hit.payload.get("date_issued"),
                    dense_cosine=dense_cosine,
                )
            )
            rrf_scores.append(score)

        # Attach RRF score list for confidence computation downstream
        self._last_rrf_scores = rrf_scores

        return results

    def search_topk_resources(
        self,
        patient_id: str,
        query: str,
        k: Optional[int] = None,
        intent: Optional[str] = None,
        use_intent_filter: bool = True,
        mode: str = "hybrid",
    ) -> List["EncounterGroup"]:
        """
        Top-k retrieval after fusion, at resource level (fix F1).

        Chunks are grouped by parent_node_id (the source FHIR resource id,
        or the encounter id for node-list data) in fused rank order, and the
        first k distinct groups are returned. There is no score threshold
        here: a group's score is the max dense cosine of its chunks, a real
        relevance score the caller gates on, never the RRF rank score.
        """
        from src.shared.models import EncounterGroup

        k = k or self.config.retrieval_top_k
        # Over-fetch chunks so that k distinct resources survive de-duplication.
        raw_results = self.search(
            patient_id,
            query,
            limit=k * 4,
            intent=intent,
            use_intent_filter=use_intent_filter,
            mode=mode,
        )

        order: List[str] = []
        grouped: Dict[str, List[RetrievedContext]] = defaultdict(list)
        for ctx in raw_results:
            group_id = ctx.parent_node_id or ctx.anchor_id
            if group_id not in grouped:
                if len(order) >= k:
                    continue
                order.append(group_id)
            grouped[group_id].append(ctx)

        groups = []
        for group_id in order:
            chunks = grouped[group_id]
            cosines = [c.dense_cosine for c in chunks if c.dense_cosine is not None]
            best = max(chunks, key=lambda c: c.dense_cosine if c.dense_cosine is not None else -1.0)
            groups.append(EncounterGroup(
                encounter_id=group_id,
                score=max(cosines) if cosines else 0.0,
                chunks=chunks,
                father_id=best.father_id,
                date_issued=best.date_issued,
            ))
        return groups

    def search_by_encounter(
        self,
        patient_id: str,
        query: str,
        threshold: float = 0.15,
        max_encounters: Optional[int] = None,
        intent: Optional[str] = None,
    ) -> List["EncounterGroup"]:
        """
        Retrieve and group results by encounter (parent_node_id).
        
        Args:
            patient_id: Patient/EOC ID to search within
            query: Clinical query text
            threshold: Minimum encounter score to include (configurable per query)
            max_encounters: Optional cap on encounters returned (None = all above threshold)
            intent: Clinical intent for filtering
            
        Returns:
            List of EncounterGroup sorted by score descending
        """
        from src.shared.models import EncounterGroup
        
        logger.info(f"Encounter-level search for Patient {patient_id}: '{query}' (threshold={threshold})")

        # Broad retrieval: use higher limit for encounter grouping
        encounter_count = self._estimate_encounter_count(patient_id)
        prefetch_limit = self._adaptive_prefetch(encounter_count)
        
        raw_results = self.search(
            patient_id, query, limit=prefetch_limit, intent=intent
        )

        # Group by parent_node_id (encounter)
        encounter_map: Dict[str, List[RetrievedContext]] = defaultdict(list)
        for ctx in raw_results:
            enc_id = ctx.parent_node_id or ctx.anchor_id
            encounter_map[enc_id].append(ctx)

        # Score each encounter
        scored_encounters = []
        for enc_id, chunks in encounter_map.items():
            max_chunk_score = max(c.score for c in chunks)
            # Bonus for multiple relevant chunks (diminishing returns)
            count_bonus = min(0.05, len(chunks) * 0.01)
            encounter_score = max_chunk_score + count_bonus

            if encounter_score >= threshold:
                # Use metadata from the highest-scoring chunk
                best_chunk = max(chunks, key=lambda c: c.score)
                scored_encounters.append(EncounterGroup(
                    encounter_id=enc_id,
                    score=encounter_score,
                    chunks=chunks,
                    father_id=best_chunk.father_id,
                    date_issued=best_chunk.date_issued,
                ))

        # Sort by score descending
        scored_encounters.sort(key=lambda x: x.score, reverse=True)

        # Optionally cap results
        if max_encounters and max_encounters > 0:
            scored_encounters = scored_encounters[:max_encounters]

        logger.info(
            f"Found {len(scored_encounters)} relevant encounters "
            f"(from {len(encounter_map)} total, threshold={threshold})"
        )

        return scored_encounters

    def _estimate_encounter_count(self, patient_id: str) -> int:
        """Estimate encounter count from Qdrant payload metadata."""
        try:
            q_client = qdrant_client.connect()
            collection = qdrant_client.collection_name
            # Count distinct parent_node_id values for this patient
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            results = q_client.scroll(
                collection_name=collection,
                scroll_filter=Filter(must=[
                    FieldCondition(key="patient_id", match=MatchValue(value=patient_id))
                ]),
                limit=1000,
                with_payload=["parent_node_id"],
            )
            unique_nodes = set()
            for point in results[0]:
                node_id = point.payload.get("parent_node_id")
                if node_id:
                    unique_nodes.add(node_id)
            return len(unique_nodes)
        except Exception as e:
            logger.warning(f"Failed to estimate encounter count: {e}")
            return 10  # Default assumption

    def _adaptive_prefetch(self, encounter_count: int) -> int:
        """Calculate prefetch limit based on estimated encounter count."""
        if encounter_count <= 10:
            return 30
        elif encounter_count <= 30:
            return 60
        else:
            return 90

    def get_retrieval_confidence(self) -> tuple[float, float]:
        """Return (max_normalized_rrf, avg_top3_normalized_rrf) from the last search."""
        from src.agent.confidence import normalize_rrf_scores
        scores = getattr(self, "_last_rrf_scores", [])
        return normalize_rrf_scores(scores)
