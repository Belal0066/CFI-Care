"""
Audit & Verification Logic for Clinical Claims (Ticket 2.2).
Implements strict validation of LLM-generated claims against retrieved context.
"""
import re
import logging
from typing import List, Set
from src.shared.models import DifferentialDiagnosis, AuditFailure, RetrievedContext

logger = logging.getLogger(__name__)

class ClaimAuditor:
    """
    Validates that all claims in differential diagnoses are grounded in retrieved context.
    """
    
    @staticmethod
    def audit_differential_diagnoses(
        ddx_list: List[DifferentialDiagnosis],
        contexts: List[RetrievedContext]
    ) -> tuple[bool, List[AuditFailure]]:
        """
        Audit all differential diagnoses against retrieved context.
        
        Args:
            ddx_list: List of differential diagnoses to audit
            contexts: Retrieved context from graph/vector search
            
        Returns:
            Tuple of (passed: bool, failures: List[AuditFailure])
        """
        if not contexts:
            return False, [AuditFailure(
                type="no_context",
                message="Cannot audit DDx without retrieved context",
                severity="high"
            )]
        
        all_failures = []
        
        # Build reference sets
        context_ids = {ctx.anchor_id for ctx in contexts}
        all_context_text = " ".join(ctx.anchor_content.lower() for ctx in contexts)
        
        for idx, ddx in enumerate(ddx_list):
            # Check 1: Cited IDs must exist in context
            for cited_id in ddx.cited_ids:
                if cited_id not in context_ids:
                    all_failures.append(AuditFailure(
                        type="missing_citation",
                        message=f"DDx '{ddx.diagnosis}' cites non-existent ID: {cited_id}",
                        severity="high",
                        related_ddx_index=idx
                    ))
            
            # Check 2: Supporting evidence must be grounded
            for evidence in ddx.supporting_evidence:
                if not ClaimAuditor._is_evidence_grounded(evidence, all_context_text):
                    all_failures.append(AuditFailure(
                        type="hallucination",
                        message=f"Evidence not found in context: '{evidence[:50]}...'",
                        severity="high",
                        related_ddx_index=idx
                    ))
            
            # Check 3: Confidence must be reasonable
            if ddx.confidence > 0.95 and len(ddx.supporting_evidence) < 2:
                all_failures.append(AuditFailure(
                    type="logical_error",
                    message=f"High confidence ({ddx.confidence}) with minimal evidence",
                    severity="medium",
                    related_ddx_index=idx
                ))
        
        passed = len(all_failures) == 0
        
        if passed:
            logger.info(f"✓ Audit passed: All {len(ddx_list)} DDx validated")
        else:
            logger.warning(f"✗ Audit failed: {len(all_failures)} failures found")
            for failure in all_failures:
                logger.warning(f"  - {failure.type}: {failure.message}")
        
        return passed, all_failures
    
    @staticmethod
    def _is_evidence_grounded(evidence: str, context_text: str) -> bool:
        """
        Check if evidence is grounded in context using fuzzy matching.
        
        This is a simplified version. For production, consider:
        - Semantic similarity using embeddings
        - Medical entity extraction and matching
        - Temporal reasoning for lab values
        """
        evidence_lower = evidence.lower()
        
        # Extract key medical terms from evidence
        # Simple heuristic: look for numbers, medical terms, symptoms
        key_terms = ClaimAuditor._extract_key_terms(evidence_lower)
        
        if not key_terms:
            # If no key terms extracted, do substring match
            return evidence_lower in context_text
        
        # Check if at least 50% of key terms appear in context
        matches = sum(1 for term in key_terms if term in context_text)
        match_ratio = matches / len(key_terms)
        
        return match_ratio >= 0.5
    
    @staticmethod
    def _extract_key_terms(text: str) -> List[str]:
        """
        Extract key medical terms from evidence text.
        
        This is a simplified extractor. For production:
        - Use medical NER (e.g., scispacy)
        - UMLS concept extraction
        """
        # Extract numbers with units (e.g., "140 mg/dL", "37.5°C")
        numbers = re.findall(r'\d+\.?\d*\s*(?:mg/dl|mmol/l|°c|bpm|mmhg|%)', text)
        
        # Extract medical terms (simplified: words > 4 chars that aren't common words)
        common_words = {'with', 'have', 'been', 'that', 'this', 'from', 'were', 'patient', 'showed'}
        words = re.findall(r'\b[a-z]{4,}\b', text)
        medical_terms = [w for w in words if w not in common_words]
        
        return numbers + medical_terms[:5]  # Limit to avoid false negatives
