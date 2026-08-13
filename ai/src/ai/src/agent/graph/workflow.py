import logging
from typing import Dict, Any
from langgraph.graph import StateGraph, END
from langchain_core.messages import AIMessage
from src.agent.graph.state import ClinicalAgentState
from src.agent.graph.nodes import (
    classify_intent,
    retrieve_patient_context,
    run_deterministic_reasoning,
    query_mcp,
    generate_response,
    audit_claims,
    generate_visualization,
    MAX_AUDIT_RETRIES,
)
from src.agent.confidence import (
    compute_overall_confidence,
    build_confidence_block,
)
from src.retrieval.config import retriever_config

logger = logging.getLogger(__name__)


def _compute_confidence(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Layer 4 → Unified: Compute overall_confidence and append the confidence
    block to the generated response text.
    """
    routing_conf = state.get("intent_confidence", 0.0)
    retrieval_conf = state.get("retrieval_confidence", 0.0)
    generation_conf = state.get("generation_confidence", 0.0)
    validation_conf = state.get("validation_confidence", 1.0)

    overall = compute_overall_confidence(
        routing=routing_conf,
        retrieval=retrieval_conf,
        generation=generation_conf,
        validation=validation_conf,
    )

    block = build_confidence_block(
        routing=routing_conf,
        retrieval=retrieval_conf,
        generation=generation_conf,
        validation=validation_conf,
        overall=overall,
    )

    # Append confidence block to the last message
    messages = state.get("messages", [])
    if messages:
        last_msg = messages[-1]
        if hasattr(last_msg, "content"):
            last_msg.content += block

    logger.info(
        f"Confidence: routing={routing_conf:.2f} retrieval={retrieval_conf:.2f} "
        f"generation={generation_conf:.2f} validation={validation_conf:.2f} "
        f"overall={overall:.2f}"
    )

    return {
        "overall_confidence": overall,
    }


workflow = StateGraph(ClinicalAgentState)

def _prepare_retrieval_retry(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Bounded adaptive retrieval: the first retrieval pass scored below the
    sufficiency gate (has_insufficient_data). Retry once with a relaxed
    threshold rather than proceeding to reasoning on thin evidence.

    Deliberately deterministic, not model-controlled: the retrieval score
    is already a sufficient signal to decide "try again, more broadly" —
    no LLM call is needed to make or act on that decision, and the retry
    count is a hard, code-enforced bound regardless of what any later
    model-assisted step might otherwise "want."
    """
    iterations = state.get("retrieval_iterations", 0) + 1
    current_threshold = state.get("retrieval_threshold", retriever_config.retrieval_gatekeeper_threshold)
    relaxed_threshold = current_threshold * retriever_config.retrieval_retry_threshold_factor
    logger.info(
        f"Retrieval insufficient (retry {iterations}/{retriever_config.max_retrieval_retries}) — "
        f"relaxing threshold {current_threshold:.3f} -> {relaxed_threshold:.3f}"
    )
    return {"retrieval_iterations": iterations, "retrieval_threshold": relaxed_threshold}


workflow.add_node("classify", classify_intent)
workflow.add_node("rag_retrieve", retrieve_patient_context)
workflow.add_node("retry_retrieval", _prepare_retrieval_retry)
workflow.add_node("reason", run_deterministic_reasoning)
workflow.add_node("mcp_search", query_mcp)
workflow.add_node("visualize", generate_visualization)
workflow.add_node("generate", generate_response)
workflow.add_node("audit_claims", audit_claims)
workflow.add_node("compute_confidence", _compute_confidence)

# Define Logic
workflow.set_entry_point("classify")

# Layer 1: Intent Routing Fallback Threshold
CONFIDENCE_THRESHOLD = retriever_config.routing_fallback_threshold


def route_intent(state):
    """
    Route based on 'mode' flag (Manual Toggle) or Intent (Auto).
    
    Priorities:
    1. mode == 'chat'  -> Skip retrieval, go to Generate
    2. mode == 'local' -> Force Local RAG
    3. mode == 'mcp'   -> Force External MCP
    4. mode == 'auto'  -> Use Intent Classification

    If intent confidence < routing_fallback_threshold (0.70), route to
    broad high-recall RAG instead of hyper-specific tool execution (Layer 1).
    """
    mode = state.get("mode", "auto")
    
    if mode == "chat":
        return "generate"
    if mode == "local":
        return "rag_retrieve"
    if mode == "mcp":
        return "mcp_search"
    
    intent = state.get("intent", "unknown")
    confidence = state.get("intent_confidence", 0.0)
    is_mcp_query = state.get("is_mcp_query", False)

    if intent == "visualization":
        return "visualize"

    if is_mcp_query:
        return "mcp_search"

    rag_intents = [
        "summary", "diagnosis", "differential", "medication",
        "change_tracking", "trend_analysis", "timeline", "outcome", "rationale", "allergy"
    ]

    # Low confidence → broad RAG (safer than hallucinating from internet sources)
    if confidence < CONFIDENCE_THRESHOLD:
        logger.info(f"Low routing confidence ({confidence:.2f} < {CONFIDENCE_THRESHOLD}) — falling back to broad RAG retrieval")
        return "rag_retrieve"

    if intent in rag_intents:
        return "rag_retrieve"

    return "mcp_search"

workflow.add_conditional_edges(
    "classify",
    route_intent,
    {
        "rag_retrieve": "rag_retrieve",
        "mcp_search": "mcp_search",
        "visualize": "visualize",
        "generate": "generate"
    }
)

# RAG Path — bounded adaptive retry before reasoning on insufficient evidence
def route_after_retrieval(state):
    """One bounded retry if retrieval scored below the sufficiency gate."""
    if (
        state.get("has_insufficient_data", False)
        and state.get("retrieval_iterations", 0) < retriever_config.max_retrieval_retries
    ):
        return "retry_retrieval"
    return "reason"


workflow.add_conditional_edges(
    "rag_retrieve",
    route_after_retrieval,
    {"retry_retrieval": "retry_retrieval", "reason": "reason"},
)
workflow.add_edge("retry_retrieval", "rag_retrieve")


def route_after_reason(state):
    """After clinical reasoning, go to MCP for external drug-safety evidence if needed."""
    if state.get("needs_drug_check", False):
        logger.info("needs_drug_check=True — routing reason → mcp_search for external evidence")
        return "mcp_search"
    return "generate"


workflow.add_conditional_edges(
    "reason",
    route_after_reason,
    {"mcp_search": "mcp_search", "generate": "generate"},
)

# MCP Path
workflow.add_edge("mcp_search", "generate")

# Visualization Path
workflow.add_edge("visualize", "generate")

# Audit Path — self-correction loop after generation
workflow.add_edge("generate", "audit_claims")


def route_after_audit(state):
    """Route back to generate for correction on audit failure, up to MAX_AUDIT_RETRIES.
    If the retry budget is exhausted without passing, fail closed instead of
    returning a response whose claims never verified against evidence."""
    if state.get("audit_passed", True):
        logger.info("Audit passed — computing confidence")
        return "compute_confidence"

    retries = state.get("audit_retry_count", 0)
    if retries < MAX_AUDIT_RETRIES:
        logger.info(f"Audit failed — retry {retries + 1}/{MAX_AUDIT_RETRIES}")
        return "retry_generate"

    logger.warning(f"Audit failed after {MAX_AUDIT_RETRIES} retries — abstaining rather than returning unverified content")
    return "abstain"


def _abstain_on_failed_audit(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Fail-closed exit for the self-correction loop: the audit could not verify
    the response's claims within the retry budget. Replace the response with
    an explicit abstention instead of silently returning content that failed
    its grounding check.
    """
    abstention = (
        "I don't have enough verified evidence in this patient's record to "
        "answer that confidently. Please rephrase the question or consult "
        "the full chart."
    )
    messages = state.get("messages", [])
    if messages:
        last_msg = messages[-1]
        if hasattr(last_msg, "content"):
            last_msg.content = abstention
    return {"abstained": True}


workflow.add_node("abstain", _abstain_on_failed_audit)

workflow.add_conditional_edges(
    "audit_claims",
    route_after_audit,
    {
        "retry_generate": "generate",
        "compute_confidence": "compute_confidence",
        "abstain": "abstain",
    }
)

workflow.add_edge("abstain", "compute_confidence")
workflow.add_edge("compute_confidence", END)

app = workflow.compile()
