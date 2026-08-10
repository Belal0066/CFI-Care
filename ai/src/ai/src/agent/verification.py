"""
Phase 1 evidence verification.

audit_claims (src/agent/graph/nodes.py) already checks that every claim's
cited IDs exist among the retrieved encounter/chunk IDs. That answers "does
this citation point at something real" — it does not answer "does the text
at that citation actually support what the claim says." This module adds
the second question as its own explicit, additive layer:

    citation attribution   -> existing audit_claims ID-existence check
    semantic support        -> ClaimVerifier below, via a local NLI model

Deliberately not an LLM-as-judge: an NLI cross-encoder is cheaper, faster,
runs locally (sentence-transformers is already a project dependency), and
is the smaller, easier-to-evaluate first step. Escalating to an LLM judge
for the residual ambiguous cases is a possible later addition, not done
here, and should not be assumed to be an improvement without the same kind
of held-out evaluation this module itself hasn't had yet — see
retriever_config.semantic_verification_gating_enabled.
"""
import logging
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from src.retrieval.config import retriever_config

logger = logging.getLogger(__name__)

# cross-encoder/nli-deberta-v3-base's documented label order (per its model
# card / the sentence-transformers CrossEncoder NLI usage example) is
# [contradiction, entailment, neutral]. If nli_model_name is changed to a
# different checkpoint, this mapping must be re-verified against that
# model's card — it is not a universal convention.
_NLI_LABELS = ["contradiction", "entailment", "neutral"]


class Evidence(BaseModel):
    """A single retrievable unit of evidence, keyed the same way citations are."""
    id: str
    text: str


class ClaimEvidenceLink(BaseModel):
    """The result of checking one (claim, evidence) pair."""
    evidence_id: str
    method: Literal["id_missing", "nli", "skipped"]
    label: Optional[Literal["contradiction", "entailment", "neutral"]] = None
    score: float = 0.0


class VerificationResult(BaseModel):
    """
    Aggregate verification outcome for one claim across all of its citations.

    cited_evidence_exists: the tier-1 check already done by audit_claims,
        carried here so callers get one place to see both tiers.
    semantically_supported: None if the semantic check didn't run (model
        unavailable, disabled, or no resolvable evidence text) — this is
        distinct from False, which means it ran and found no support.
    """
    claim_index: int
    cited_evidence_exists: bool
    semantically_supported: Optional[bool]
    links: List[ClaimEvidenceLink] = Field(default_factory=list)
    reason: str


class ClaimVerifier:
    """
    Wraps a local NLI cross-encoder. Model load is lazy and shared across
    instances (class-level cache) so paying the load cost once per process,
    not once per audit call.
    """

    _model = None  # None = not yet attempted; False = attempted and failed

    def __init__(
        self,
        model_name: Optional[str] = None,
        entailment_threshold: Optional[float] = None,
        enabled: Optional[bool] = None,
    ):
        self.model_name = model_name or retriever_config.nli_model_name
        self.entailment_threshold = (
            entailment_threshold
            if entailment_threshold is not None
            else retriever_config.nli_entailment_threshold
        )
        self.enabled = (
            enabled if enabled is not None else retriever_config.semantic_verification_enabled
        )

    def _get_model(self):
        if not self.enabled:
            return None
        if ClaimVerifier._model is None:
            try:
                from sentence_transformers import CrossEncoder

                ClaimVerifier._model = CrossEncoder(self.model_name)
                logger.info(f"Loaded NLI verification model: {self.model_name}")
            except Exception as e:
                logger.warning(
                    f"Semantic claim verification disabled — failed to load "
                    f"NLI model {self.model_name}: {e}"
                )
                ClaimVerifier._model = False
        return ClaimVerifier._model or None

    def verify_claim(
        self,
        claim_index: int,
        claim_text: str,
        cited_ids: List[str],
        evidence_by_id: Dict[str, str],
    ) -> VerificationResult:
        """
        evidence_by_id maps a cited ID to its evidence text (e.g. built from
        encounter_groups' chunk.anchor_id -> chunk.anchor_content).
        """
        cited_evidence_exists = bool(cited_ids) and all(
            cid in evidence_by_id for cid in cited_ids
        )

        if not cited_ids:
            return VerificationResult(
                claim_index=claim_index,
                cited_evidence_exists=False,
                semantically_supported=None,
                links=[],
                reason="claim cites no evidence IDs",
            )

        model = self._get_model()
        resolvable = [(cid, evidence_by_id[cid]) for cid in cited_ids if cid in evidence_by_id]

        if model is None:
            return VerificationResult(
                claim_index=claim_index,
                cited_evidence_exists=cited_evidence_exists,
                semantically_supported=None,
                links=[
                    ClaimEvidenceLink(evidence_id=cid, method="skipped")
                    for cid in cited_ids
                ],
                reason="semantic check skipped (verifier disabled or model unavailable)",
            )

        if not resolvable:
            return VerificationResult(
                claim_index=claim_index,
                cited_evidence_exists=False,
                semantically_supported=None,
                links=[
                    ClaimEvidenceLink(evidence_id=cid, method="id_missing")
                    for cid in cited_ids
                ],
                reason="no resolvable evidence text for any cited ID",
            )

        pairs = [(text, claim_text) for _cid, text in resolvable]
        raw_scores = model.predict(pairs, apply_softmax=True)

        links: List[ClaimEvidenceLink] = []
        any_entailment = False
        any_contradiction = False
        for (cid, _text), scores in zip(resolvable, raw_scores):
            label_idx = int(scores.argmax())
            label = _NLI_LABELS[label_idx]
            score = float(scores[label_idx])
            links.append(
                ClaimEvidenceLink(evidence_id=cid, method="nli", label=label, score=score)
            )
            if label == "entailment" and score >= self.entailment_threshold:
                any_entailment = True
            if label == "contradiction" and score >= self.entailment_threshold:
                any_contradiction = True

        missing = [cid for cid in cited_ids if cid not in evidence_by_id]
        links.extend(ClaimEvidenceLink(evidence_id=cid, method="id_missing") for cid in missing)

        if any_contradiction:
            supported, reason = False, "cited evidence contradicts the claim"
        elif any_entailment:
            supported, reason = True, "at least one cited evidence entails the claim"
        else:
            supported, reason = False, "cited evidence is neutral — does not entail the claim"

        return VerificationResult(
            claim_index=claim_index,
            cited_evidence_exists=cited_evidence_exists,
            semantically_supported=supported,
            links=links,
            reason=reason,
        )
