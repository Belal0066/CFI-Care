#!/usr/bin/env python3
"""
Compares the existing term-overlap faithfulness heuristic
(evaluate_faithfulness.py) against the NLI-based ClaimVerifier
(src/agent/verification.py) on the same test corpus, claim by claim.

Why this exists: ClaimVerifier shipped disabled by default
(retriever_config.semantic_verification_enabled = False), with gating
(retriever_config.semantic_verification_gating_enabled) meant to stay off
until the verifier's predictions have actually been checked against
something. This script is that check, reusing the exact corpus and claim
extraction evaluate_faithfulness.py already uses rather than inventing a
new one.

It does NOT replace evaluate_faithfulness.py — it imports and extends
FaithfulnessEvaluator so the two verification methods run over the same
claims, side by side, instead of being computed separately and compared
only at the aggregate level.

Known limitation, inherited unchanged from the existing corpus: only 4
non-MCP queries / 9 claims exist in Data/retrieval_ground_truth.json —
already flagged in ai/src/ai/README.md as "too small to be conclusive."
This script makes the two methods' disagreements visible; it does not fix
the sample-size problem. Treat "0 disagreements" as "no evidence of a
problem on 9 claims," not as "the verifier is validated."

Neither method here has an independent human-labeled ground truth for
"is this claim actually supported" — the term-overlap score is itself a
heuristic proxy, not gold labels. This script measures agreement between
two methods, not accuracy against truth. A real go/no-go on
semantic_verification_gating_enabled should have a clinician-reviewed
label set, which this script does not provide.
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.evaluate_faithfulness import FaithfulnessEvaluator
from src.retrieval.query_understanding import QueryContext
from src.retrieval.context_retrieval import RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner
from src.agent.verification import ClaimVerifier
from src.retrieval.config import retriever_config


class SemanticVerificationComparison(FaithfulnessEvaluator):
    def __init__(self):
        super().__init__()
        # Force-enabled regardless of the production default — this script
        # IS the evaluation semantic_verification_enabled's docstring says
        # to run before trusting the model's predictions.
        self.verifier = ClaimVerifier(enabled=True)
        if self.verifier._get_model() is None:
            print(
                "WARNING: the NLI model could not be loaded (see the log line above "
                "for why) — every semantic result below will be 'skipped', which is "
                "not the same as 'no disagreement'. Install sentence-transformers/torch "
                "and retry before treating this run's output as meaningful."
            )

    def _full_claims_for(self, query: str) -> dict:
        """
        Re-runs classify -> retrieve -> reason for `query`, mirroring
        FaithfulnessEvaluator.evaluate_response_faithfulness exactly, to
        recover full (untruncated) claim text keyed by the same 1-based
        claim_index the parent method produces.
        """
        intent, confidence = self.classifier.classify(query)
        query_context = QueryContext(
            original_query=query,
            intent=intent,
            confidence=confidence,
            query_normalized=query.lower(),
            rewritten_query=query,
        )
        retrieved_docs = self.retriever.retrieve(query_context, max_docs=10)
        retrieval_context = RetrievalContext(
            query_context=query_context,
            retrieved_documents=retrieved_docs,
            patient_state=self.patient_state,
        )
        reasoner = ClinicalReasoner(retrieval_context)
        clinical_response = reasoner.reason()
        claims = self.extract_claims_and_citations(clinical_response)
        return {idx: claim["claim_text"] for idx, claim in enumerate(claims, 1)}

    def _evidence_by_id_for(self, cited_sources):
        evidence_by_id = {}
        for node_id in cited_sources:
            if node_id in self.node_lookup:
                node = self.node_lookup[node_id]
                evidence_by_id[node_id] = f"{node.text_primary} {node.details}"
        return evidence_by_id

    def evaluate_response_faithfulness(self, query: str) -> dict:
        result = super().evaluate_response_faithfulness(query)

        # super()'s verification_details truncates claim_text to 100 chars
        # for display — using that truncated text for the NLI check could
        # cut off exactly the clause that determines entailment. Re-derive
        # the full claim text by re-running classify+retrieve+reason for
        # this query (wasteful but correct; this is an offline eval script,
        # not a hot path) rather than risk scoring truncated claims.
        full_claims_by_index = self._full_claims_for(query)

        comparisons = []
        for detail in result.get("verification_details", []):
            idx = detail["claim_index"]
            claim_text = full_claims_by_index.get(idx, detail["claim_text"])
            cited_sources = detail["cited_sources"]
            evidence_by_id = self._evidence_by_id_for(cited_sources)

            semantic = self.verifier.verify_claim(
                claim_index=idx,
                claim_text=claim_text,
                cited_ids=cited_sources,
                evidence_by_id=evidence_by_id,
            )

            overlap_supported = detail["supported"]
            semantic_supported = semantic.semantically_supported  # True / False / None (skipped)
            agree = (
                None
                if semantic_supported is None
                else (overlap_supported == semantic_supported)
            )

            comparisons.append({
                "claim_index": detail["claim_index"],
                "claim_text": detail["claim_text"],
                "overlap_supported": overlap_supported,
                "overlap_confidence": detail["confidence"],
                "semantic_supported": semantic_supported,
                "semantic_reason": semantic.reason,
                "semantic_links": [link.model_dump() for link in semantic.links],
                "methods_agree": agree,
            })

        result["semantic_comparison"] = comparisons
        return result


def main():
    evaluator = SemanticVerificationComparison()
    results = evaluator.run_evaluation()

    all_comparisons = [
        c for r in results["per_query_results"] for c in r.get("semantic_comparison", [])
    ]
    scored = [c for c in all_comparisons if c["semantic_supported"] is not None]
    skipped = [c for c in all_comparisons if c["semantic_supported"] is None]
    disagreements = [c for c in scored if not c["methods_agree"]]

    print("\n" + "=" * 70)
    print("TERM-OVERLAP vs NLI SEMANTIC VERIFICATION — AGREEMENT REPORT")
    print("=" * 70)
    print(f"Total claims compared: {len(all_comparisons)}")
    print(f"  Scored by both methods: {len(scored)}")
    print(f"  Skipped (NLI model unavailable): {len(skipped)}")
    print(f"  Disagreements: {len(disagreements)}")

    if disagreements:
        print("\nDisagreements (term-overlap vs NLI verdict differ):")
        for c in disagreements:
            print(f"  - Claim: {c['claim_text'][:80]}")
            print(f"    overlap_supported={c['overlap_supported']} (conf={c['overlap_confidence']:.2f})"
                  f"  semantic_supported={c['semantic_supported']} ({c['semantic_reason']})")

    if len(scored) < 20:
        print(
            f"\nNOTE: only {len(scored)} claims were scored by both methods. This is not "
            "enough to draw a statistical conclusion about the verifier's precision/recall "
            "— it can only surface obvious disagreements on this small corpus. Do not treat "
            "an empty disagreement list here as validation for enabling "
            "semantic_verification_gating_enabled in production."
        )

    output_path = Path("results/semantic_verification_comparison.json")
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(
            {
                "metadata": {
                    "compares": ["evaluate_faithfulness.py term-overlap heuristic", "src/agent/verification.ClaimVerifier (NLI)"],
                    "nli_model": retriever_config.nli_model_name,
                    "corpus": "Data/retrieval_ground_truth.json (4 non-MCP queries)",
                    "limitation": "corpus too small for a statistical precision/recall claim; see script docstring",
                },
                "summary": {
                    "total_claims": len(all_comparisons),
                    "scored_by_both": len(scored),
                    "skipped": len(skipped),
                    "disagreements": len(disagreements),
                },
                "per_claim": all_comparisons,
            },
            f,
            indent=2,
        )
    print(f"\nFull comparison saved to: {output_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
