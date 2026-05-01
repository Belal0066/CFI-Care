"""
Multi-Layer Confidence Scoring for Clinical Agent.

Implements four confidence layers:
1. Intent Routing Confidence (C_routing)
2. Retrieval Context Alignment (C_retrieval)
3. LLM Generation Token Confidence (C_generation)
4. Post-Generation Validation (C_validation)

Combined into a unified C_total via weighted heuristic.
"""

import math
import logging
from typing import List, Optional

from src.retrieval.config import retriever_config

logger = logging.getLogger(__name__)


def normalize_rrf_scores(
    rrf_scores: List[float],
    rank_constant: Optional[int] = None,
) -> tuple[float, float]:
    """
    Normalize RRF scores to [0, 1] and compute aggregate metrics.

    RRF formula: score = sum(1 / (k + rank + 1)) for each result set.
    Maximum theoretical score (ranked #1 in both dense + sparse):
    2 / (k + 1).

    Returns:
        (max_normalized, avg_top3_normalized)
    """
    if not rrf_scores:
        return 0.0, 0.0

    k = rank_constant or retriever_config.rrf_rank_constant
    max_possible = 2.0 / (k + 1)

    normalized = [s / max_possible for s in rrf_scores]
    max_score = max(normalized)
    top3 = sorted(normalized, reverse=True)[:3]
    avg_top3 = sum(top3) / len(top3)

    return round(max_score, 4), round(avg_top3, 4)


def compute_generation_confidence(
    token_logprobs: Optional[List[float]] = None,
    self_consistency_agreement: Optional[float] = None,
) -> float:
    """
    Compute generation confidence from token log-probabilities.

    Uses exp(mean(logprobs)) to map (-inf, 0] to (0, 1].
    Falls back to self-consistency agreement if logprobs unavailable.
    """
    if token_logprobs and len(token_logprobs) > 0:
        mean_lp = sum(token_logprobs) / len(token_logprobs)
        return round(math.exp(mean_lp), 4)

    if self_consistency_agreement is not None:
        return round(self_consistency_agreement, 4)

    return 0.0


def compute_validation_confidence(
    total_claims: int,
    supported_claims: int,
    faithfulness_score: Optional[float] = None,
) -> float:
    """
    Compute validation confidence from citation audit.

    Primary: fraction of supported claims.
    Override with external faithfulness score if available (e.g., Ragas judge).
    """
    if faithfulness_score is not None:
        return round(faithfulness_score, 4)

    if total_claims == 0:
        return 1.0

    return round(supported_claims / total_claims, 4)


def compute_overall_confidence(
    routing: float = 0.0,
    retrieval: float = 0.0,
    generation: float = 0.0,
    validation: float = 0.0,
    weights: Optional[dict] = None,
) -> float:
    """
    Unified confidence index: C_total = w1*C_routing + w2*C_retrieval
                                            + w3*C_generation + w4*C_validation
    """
    w = weights or {
        "routing": retriever_config.confidence_weight_routing,
        "retrieval": retriever_config.confidence_weight_retrieval,
        "generation": retriever_config.confidence_weight_generation,
        "validation": retriever_config.confidence_weight_validation,
    }

    total = (
        w["routing"] * routing
        + w["retrieval"] * retrieval
        + w["generation"] * generation
        + w["validation"] * validation
    )

    return round(total, 4)


def confidence_label(score: float) -> str:
    """Map a confidence score to Low / Medium / High."""
    if score < retriever_config.confidence_low_max:
        return "Low"
    if score < retriever_config.confidence_medium_max:
        return "Medium"
    return "High"


def build_confidence_block(
    routing: float,
    retrieval: float,
    generation: float,
    validation: float,
    overall: float,
) -> str:
    """Build the confidence block appended to the response text."""
    lines = [
        "\n\n---",
        "*Confidence Assessment:*",
        f"- Intent Routing: {routing:.2f} ({confidence_label(routing)})",
        f"- Evidence Quality: {retrieval:.2f} ({confidence_label(retrieval)})",
        f"- Response Consistency: {generation:.2f} ({confidence_label(generation)})",
        f"- Factual Verification: {validation:.2f} ({confidence_label(validation)})",
        f"- **Overall: {overall:.2f} ({confidence_label(overall)})**",
    ]
    return "\n".join(lines)
