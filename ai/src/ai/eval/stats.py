"""
Statistics for small paired evaluation sets (n = 50 per config).

Every reported rate carries a Wilson 95% interval; paired accuracy
comparisons use the exact McNemar test; continuous per-item metrics use a
paired bootstrap. Zero-failure results use the rule of three.
"""
from __future__ import annotations

import math
import random
from typing import Sequence

Z95 = 1.959963984540054


def wilson(successes: int, n: int, z: float = Z95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion."""
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def rate(successes: int, n: int) -> dict:
    lo, hi = wilson(successes, n)
    return {"k": successes, "n": n, "rate": (successes / n) if n else None, "ci95": [lo, hi]}


def rule_of_three(n: int) -> float:
    """95% upper bound on a failure rate when 0 failures were seen in n trials."""
    return 3.0 / n if n else 1.0


def _binom_cdf(k: int, n: int, p: float = 0.5) -> float:
    return sum(math.comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k + 1))


def mcnemar_exact(a_correct: Sequence[bool], b_correct: Sequence[bool]) -> dict:
    """
    Exact (binomial) McNemar test on paired outcomes. Returns the discordant
    counts: b_fixed = A wrong and B right, b_broke = A right and B wrong.
    """
    if len(a_correct) != len(b_correct):
        raise ValueError("paired sequences must have equal length")
    fixed = sum(1 for a, b in zip(a_correct, b_correct) if not a and b)
    broke = sum(1 for a, b in zip(a_correct, b_correct) if a and not b)
    n = fixed + broke
    if n == 0:
        p = 1.0
    else:
        p = min(1.0, 2 * _binom_cdf(min(fixed, broke), n))
    return {"fixed": fixed, "broke": broke, "discordant": n, "p_value": p}


def bootstrap_mean_ci(values: Sequence[float], n_resamples: int = 10_000, seed: int = 0) -> tuple[float, float]:
    vals = list(values)
    if not vals:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    n = len(vals)
    means = sorted(sum(vals[rng.randrange(n)] for _ in range(n)) / n for _ in range(n_resamples))
    return (means[int(0.025 * n_resamples)], means[int(0.975 * n_resamples) - 1])


def paired_bootstrap_diff(a: Sequence[float], b: Sequence[float], n_resamples: int = 10_000, seed: int = 0) -> dict:
    """Mean(b - a) with a 95% bootstrap interval and a two-sided bootstrap p-value."""
    if len(a) != len(b):
        raise ValueError("paired sequences must have equal length")
    diffs = [y - x for x, y in zip(a, b)]
    n = len(diffs)
    if n == 0:
        return {"mean_diff": float("nan"), "ci95": [float("nan"), float("nan")], "p_value": float("nan")}
    rng = random.Random(seed)
    observed = sum(diffs) / n
    boots = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(n_resamples))
    lo, hi = boots[int(0.025 * n_resamples)], boots[int(0.975 * n_resamples) - 1]
    # p-value: share of resampled means on the other side of zero, doubled.
    if observed >= 0:
        tail = sum(1 for m in boots if m <= 0) / n_resamples
    else:
        tail = sum(1 for m in boots if m >= 0) / n_resamples
    return {"mean_diff": observed, "ci95": [lo, hi], "p_value": min(1.0, 2 * tail)}


def cohen_kappa(a: Sequence, b: Sequence) -> float:
    if len(a) != len(b) or not a:
        raise ValueError("need two equal-length, non-empty label sequences")
    labels = sorted(set(a) | set(b), key=str)
    n = len(a)
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    pe = sum((list(a).count(l) / n) * (list(b).count(l) / n) for l in labels)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def roc_points(scores_pos: Sequence[float], scores_neg: Sequence[float]) -> list[dict]:
    """
    ROC for "score >= t means sufficient evidence". Positives are answerable
    items (should pass the gate), negatives unanswerable ones (should not).
    """
    thresholds = sorted(set(scores_pos) | set(scores_neg), reverse=True)
    points = []
    for t in thresholds:
        tpr = sum(1 for s in scores_pos if s >= t) / len(scores_pos) if scores_pos else 0.0
        fpr = sum(1 for s in scores_neg if s >= t) / len(scores_neg) if scores_neg else 0.0
        points.append({"threshold": t, "tpr": tpr, "fpr": fpr, "youden_j": tpr - fpr})
    return points


def auc(points: list[dict]) -> float:
    pts = sorted([(0.0, 0.0)] + [(p["fpr"], p["tpr"]) for p in points] + [(1.0, 1.0)])
    return sum((x2 - x1) * (y1 + y2) / 2 for (x1, y1), (x2, y2) in zip(pts, pts[1:]))
