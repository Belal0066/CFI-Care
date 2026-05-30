"""
LangGraph Workflow Orchestrator (Ticket 2.2).
Implements the Retrieve → Reason → Verify → Format pattern.
"""
import json
import logging
from typing import Dict, Any
from datetime import datetime

from langgraph.graph import StateGraph, END
from src.shared.models import ClinicalState, DifferentialDiagnosis
from src.retrieval.service import HybridRetriever
from src.agent.llm_client import ollama_client
from src.agent.auditor import ClaimAuditor
from prompts.ddx_prompts import build_ddx_prompt

logger = logging.getLogger(__name__)

class ClinicalWorkflow:
    """
    LangGraph orchestrator for clinical reasoning.
    """
    
    def __init__(self, retrieval_k: int = 5, retrieval_hops: int = 1, prompt_version: str = "v1"):
        self.retriever = HybridRetriever()
        self.auditor = ClaimAuditor()
        self.retrieval_k = retrieval_k
        self.retrieval_hops = retrieval_hops
        self.prompt_version = prompt_version
        
        # Build the workflow graph
        self.workflow = self._build_workflow()
        self.app = self.workflow.compile()
    
    def _build_workflow(self) -> StateGraph:
        """Construct the LangGraph state machine."""
        workflow = StateGraph(ClinicalState)
        
        # Add nodes
        workflow.add_node("retrieve", self._retrieve_context)
        workflow.add_node("reason", self._reason_and_diagnose)
        workflow.add_node("audit", self._audit_claims)
        workflow.add_node("format", self._format_output)
        workflow.add_node("reject", self._reject_output)
        
        # Define edges
        workflow.set_entry_point("retrieve")
        
        workflow.add_conditional_edges(
            "retrieve",
            self._route_after_retrieval
        )
        
        workflow.add_edge("reason", "audit")
        
        workflow.add_conditional_edges(
            "audit",
            self._route_after_audit
        )
        
        workflow.add_edge("format", END)
        workflow.add_edge("reject", END)
        
        return workflow
    
    # ========================================================================
    # Node Implementations
    # ========================================================================
    
    def _retrieve_context(self, state: ClinicalState) -> ClinicalState:
        """Node 1: Retrieve clinical context using HybridRetriever."""
        logger.info(f"[RETRIEVE] Patient: {state.patient_id}, Query: '{state.query}'")
        
        try:
            contexts = self.retriever.search(
                patient_id=state.patient_id,
                query=state.query,
                limit=self.retrieval_k,
                hops=self.retrieval_hops
            )
            
            state.retrieved_contexts = contexts
            state.metadata["reasoning_trace"].append({
                "node": "retrieve",
                "timestamp": datetime.now().isoformat(),
                "contexts_found": len(contexts)
            })
            
            logger.info(f"[RETRIEVE] ✓ Retrieved {len(contexts)} contexts")
            
        except Exception as e:
            logger.error(f"[RETRIEVE] ✗ Error: {e}")
            state.retrieval_error = str(e)
        
        return state
    
    def _reason_and_diagnose(self, state: ClinicalState) -> ClinicalState:
        """Node 2: Generate differential diagnoses using MedGemma."""
        logger.info("[REASON] Generating differential diagnoses...")
        
        try:
            # Build prompt
            prompt = build_ddx_prompt(
                patient_id=state.patient_id,
                query=state.query,
                contexts=state.retrieved_contexts,
                version=self.prompt_version
            )
            
            # Call LLM
            response = ollama_client.generate(prompt=prompt, format="json", temperature=0.3)
            
            # Parse response
            raw_text = response.get("response", "")
            state.raw_reasoning = raw_text
            
            parsed = json.loads(raw_text)
            
            # Convert to Pydantic models
            ddx_list = []
            for ddx_dict in parsed.get("differentials", []):
                ddx_list.append(DifferentialDiagnosis(**ddx_dict))
            
            state.differential_diagnoses = ddx_list
            
            state.metadata["reasoning_trace"].append({
                "node": "reason",
                "timestamp": datetime.now().isoformat(),
                "ddx_count": len(ddx_list),
                "prompt_version": self.prompt_version
            })
            
            logger.info(f"[REASON] ✓ Generated {len(ddx_list)} differential diagnoses")
            
        except json.JSONDecodeError as e:
            logger.error(f"[REASON] ✗ JSON parse error: {e}")
            state.reasoning_error = f"Failed to parse LLM output: {e}"
        except Exception as e:
            logger.error(f"[REASON] ✗ Error: {e}")
            state.reasoning_error = str(e)
        
        return state
    
    def _audit_claims(self, state: ClinicalState) -> ClinicalState:
        """Node 3: Audit DDx claims against retrieved context."""
        logger.info("[AUDIT] Validating differential diagnoses...")
        
        try:
            passed, failures = self.auditor.audit_differential_diagnoses(
                ddx_list=state.differential_diagnoses,
                contexts=state.retrieved_contexts
            )
            
            state.audit_passed = passed
            state.audit_failures = failures
            
            state.metadata["reasoning_trace"].append({
                "node": "audit",
                "timestamp": datetime.now().isoformat(),
                "passed": passed,
                "failure_count": len(failures)
            })
            
            if passed:
                logger.info("[AUDIT] ✓ All claims validated")
            else:
                logger.warning(f"[AUDIT] ✗ {len(failures)} validation failures")
            
        except Exception as e:
            logger.error(f"[AUDIT] ✗ Error: {e}")
            state.audit_passed = False
            state.audit_failures = [{"type": "audit_error", "message": str(e)}]
        
        return state
    
    def _format_output(self, state: ClinicalState) -> ClinicalState:
        """Node 4: Format successful output for presentation."""
        logger.info("[FORMAT] Formatting output...")
        
        state.metadata["reasoning_trace"].append({
            "node": "format",
            "timestamp": datetime.now().isoformat(),
            "status": "success"
        })
        
        logger.info("[FORMAT] ✓ Output ready")
        return state
    
    def _reject_output(self, state: ClinicalState) -> ClinicalState:
        """Node 5: Handle rejected output (failed audit)."""
        logger.warning("[REJECT] Output rejected due to validation failures")
        
        state.metadata["reasoning_trace"].append({
            "node": "reject",
            "timestamp": datetime.now().isoformat(),
            "reason": "audit_failed",
            "failures": [f.dict() for f in state.audit_failures]
        })
        
        logger.warning("[REJECT] ✗ Workflow terminated")
        return state
    
    # ========================================================================
    # Routing Logic
    # ========================================================================
    
    def _route_after_retrieval(self, state: ClinicalState) -> str:
        """Route after retrieval: continue if contexts found, else reject."""
        if state.retrieval_error:
            return "reject"
        if not state.retrieved_contexts:
            return "reject"
        return "reason"
    
    def _route_after_audit(self, state: ClinicalState) -> str:
        """Route after audit: format if passed, else reject."""
        return "format" if state.audit_passed else "reject"
    
    # ========================================================================
    # Public API
    # ========================================================================
    
    def run(self, patient_id: str, query: str) -> ClinicalState:
        """
        Execute the clinical reasoning workflow.
        
        Args:
            patient_id: Patient identifier
            query: Clinical query/question
            
        Returns:
            Final ClinicalState with results or errors
        """
        logger.info(f"="*60)
        logger.info(f"Starting Clinical Workflow")
        logger.info(f"Patient: {patient_id}")
        logger.info(f"Query: {query}")
        logger.info(f"="*60)
        
        initial_state = ClinicalState(
            patient_id=patient_id,
            query=query
        )
        
        try:
            final_state_data = self.app.invoke(initial_state)
            
            # Ensure we return a ClinicalState object for the caller
            if isinstance(final_state_data, dict):
                final_state = ClinicalState(**final_state_data)
            else:
                final_state = final_state_data

            logger.info(f"Workflow completed: {'SUCCESS' if final_state.audit_passed else 'REJECTED'}")
            return final_state
        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            raise
