"""
E001 baseline: plain RAG with the system's own retriever and generator model.

One retrieval (the same HybridRetriever, top-5 resources after fusion, no
intent filter) and one LLM call over the same formatted patient context the
graph's generator sees. No routing, reasoning, retry, verification,
abstention gate or MCP tools, so Block C measures what the tools add and
Blocks A/B/D measure what the graph adds over plain retrieval.
"""
from __future__ import annotations

SYSTEM_PROMPT = (
    "You are an advanced Clinical AI Assistant. Answer the query using only the "
    "patient record context provided. If the context does not contain the answer, "
    "say that the record does not contain it. Maintain a neutral, objective tone."
)
TOP_K = 5


def answer(item: dict) -> dict:
    from src.agent.graph.nodes import (
        LLAMA_MODEL_NAME, _sampling, format_encounter_context, get_llm_client,
    )
    from src.retrieval.config import retriever_config
    from src.retrieval.service import HybridRetriever

    groups = HybridRetriever().search_topk_resources(
        patient_id=item["patient_id"], query=item["question"], k=TOP_K, use_intent_filter=False,
    )
    context = format_encounter_context(groups)
    user_prompt = f"Query: {item['question']}\n\nPatient Record Context:\n{context or '(no matching records)'}"
    response = get_llm_client().chat.completions.create(
        model=LLAMA_MODEL_NAME,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
        max_tokens=retriever_config.llm_max_tokens_rag,
        **_sampling(retriever_config.temperature_rag),
    )
    text = response.choices[0].message.content or ""
    return {
        "answer_raw": text,
        "answer": text.strip(),
        "abstained": False,  # no abstention mechanism; declines are scored from the text
        "abstain_reason": None,
        "context_resource_ids": [g.encounter_id for g in groups],
        "context_texts": [c.anchor_content for g in groups for c in g.chunks],
        "evidence_sources": [],
        "evidence_items": [],
        "mcp_called": False,
        "path": ["naive_retrieve", "naive_generate"],
        "node_latency": [],
        "retrieval_confidence": max((g.score for g in groups), default=0.0),
    }
