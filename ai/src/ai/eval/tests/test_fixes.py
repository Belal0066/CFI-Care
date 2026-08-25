"""
Unit tests for the evaluation fixes (ai/docs/SYSTEM_CARD.md, F1-F4).
No models, no Qdrant, no network: every external dependency is faked.
"""
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.retrieval import service as retrieval_service
from src.retrieval.config import retriever_config
from src.shared.models import EncounterGroup, RetrievedContext


# ---------------------------------------------------------------- F1 fakes

QUERY_VEC = [1.0, 0.0, 0.0]


def point(pid, parent, vec, score=0.5):
    return SimpleNamespace(
        id=pid, score=score, vector={"text-dense": vec},
        payload={"id": pid, "parent_node_id": parent, "toon_content": f"text {pid}"},
    )


class FakeQdrant:
    def __init__(self, dense, sparse):
        self.dense, self.sparse = dense, sparse
        self.calls = []

    def search(self, collection_name, query_vector, limit, query_filter=None, with_vectors=False, **kw):
        self.calls.append({"query_vector": query_vector, "with_vectors": with_vectors, "filter": query_filter})
        hits = self.dense if isinstance(query_vector, tuple) else self.sparse
        return hits[:limit]


@pytest.fixture
def fake_retrieval(monkeypatch):
    def install(dense, sparse, sparse_available=True):
        fake = FakeQdrant(dense, sparse)
        monkeypatch.setattr(retrieval_service.qdrant_client, "connect", lambda: fake)
        monkeypatch.setattr(retrieval_service.qdrant_client, "collection_name", "test")
        monkeypatch.setattr(retrieval_service.IngestionService, "get_embedding", staticmethod(lambda q: QUERY_VEC))
        monkeypatch.setattr(
            retrieval_service.IngestionService, "get_sparse_embedding",
            staticmethod(lambda q: {"indices": [1], "values": [1.0]} if sparse_available else None),
        )
        return fake
    return install


def test_f1_cosine_computed_for_sparse_only_hits(fake_retrieval):
    dense = [point("a", "A", [0.9, 0.1, 0.0]), point("b", "B", [0.5, 0.5, 0.0])]
    sparse = [point("c", "C", [0.0, 1.0, 0.0]), point("a", "A", [0.9, 0.1, 0.0])]
    fake = fake_retrieval(dense, sparse)
    results = retrieval_service.HybridRetriever().search("p1", "q", limit=5)
    by_id = {r.anchor_id: r for r in results}
    assert set(by_id) == {"a", "b", "c"}
    # "c" only came from the sparse list and still gets a real cosine.
    assert by_id["c"].dense_cosine == pytest.approx(0.0)
    assert by_id["a"].dense_cosine == pytest.approx(0.9 / (0.81 + 0.01) ** 0.5)
    assert all(call["with_vectors"] == ["text-dense"] for call in fake.calls)


def test_f1_topk_groups_by_resource_without_threshold(fake_retrieval):
    # Two chunks of resource A, then B, C, D. RRF scores are tiny (< 0.04);
    # the old per-intent thresholds (0.10-0.20) would have dropped all of them.
    dense = [point("a", "A", [1, 0, 0]), point("a_chunk_1", "A", [0.8, 0.6, 0]),
             point("b", "B", [0.6, 0.8, 0]), point("c", "C", [0, 1, 0]), point("d", "D", [0, 0, 1])]
    fake_retrieval(dense, list(dense))
    groups = retrieval_service.HybridRetriever().search_topk_resources("p1", "q", k=3)
    assert [g.encounter_id for g in groups] == ["A", "B", "C"]
    assert len(groups[0].chunks) == 2
    assert groups[0].score == pytest.approx(1.0)  # max dense cosine, not RRF
    assert groups[1].score == pytest.approx(0.6)


def test_f1_intent_filter_toggle(fake_retrieval, monkeypatch):
    fake = fake_retrieval([point("a", "A", [1, 0, 0])], [])
    retrieval_service.HybridRetriever().search("p1", "q", intent="diagnosis", use_intent_filter=False)
    assert fake.calls[0]["filter"].should is None
    monkeypatch.setattr(retriever_config, "intent_filter_enabled", True)
    retrieval_service.HybridRetriever().search("p1", "q", intent="diagnosis", use_intent_filter=True)
    assert fake.calls[-1]["filter"].should


def _groups(scores):
    return [EncounterGroup(encounter_id=f"r{i}", score=s, chunks=[
        RetrievedContext(anchor_id=f"r{i}", anchor_content="x", score=0.01, parent_node_id=f"r{i}", dense_cosine=s)])
        for i, s in enumerate(scores)]


def test_f1_gate_uses_max_cosine(monkeypatch):
    from src.agent.graph import nodes

    monkeypatch.setattr(retriever_config, "relevance_gate_threshold", 0.6)
    monkeypatch.setattr(retriever_config, "relevance_gate_ambiguous_threshold", 0.5)
    monkeypatch.setattr(retriever_config, "graded_retrieval_evaluator_enabled", True)
    captured = {}

    class FakeRetriever:
        def search_topk_resources(self, **kw):
            captured.update(kw)
            return _groups(self.scores)

    for scores, insufficient, grade in (([0.72, 0.3], False, "sufficient"),
                                        ([0.55, 0.52], True, "ambiguous"),
                                        ([0.2], True, "insufficient"),
                                        ([], True, "insufficient")):
        FakeRetriever.scores = scores
        monkeypatch.setattr(nodes, "HybridRetriever", FakeRetriever)
        out = nodes._retrieve_dense_topk({"retrieval_top_k": None}, "p1", "q", "diagnosis")
        assert out["has_insufficient_data"] is insufficient
        assert out["retrieval_grade"] == grade
    assert captured["k"] == retriever_config.retrieval_top_k


def test_f1_retry_widens_instead_of_lowering_bar(monkeypatch):
    from src.agent.graph.workflow import _prepare_retrieval_retry

    monkeypatch.setattr(retriever_config, "retrieval_gating_mode", "dense_topk")
    monkeypatch.setattr(retriever_config, "retrieval_top_k", 5)
    out = _prepare_retrieval_retry({"retrieval_iterations": 0})
    assert out == {"retrieval_iterations": 1, "retrieval_top_k": 10, "retrieval_use_intent_filter": False}


# ---------------------------------------------------------------- F2

class FakeLLM:
    def __init__(self):
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="NEW ANSWER"), logprobs=None)],
            usage=None, model="test-model",
        )


def test_f2_audit_retry_uses_the_question_not_the_previous_answer(monkeypatch):
    from src.agent.graph import nodes

    llm = FakeLLM()
    monkeypatch.setattr(nodes, "get_llm_client", lambda: llm)
    question = "What was the patient's most recent potassium value?"
    state = {
        "mode": "local",
        "query": question,
        # After a failed audit, messages end with the previous answer.
        "messages": [HumanMessage(content=question), AIMessage(content="PREVIOUS ANSWER")],
        "clinical_response": {"explanation": "Potassium 4.4 mEq/L", "claims": []},
        "encounter_groups": _groups([0.8]),
        "audit_failures": [{"claim": "x", "reason": "missing citation"}],
        "audit_retry_count": 0,
        "internet_evidence": [],
    }
    out = nodes.generate_response(state)
    prompt = llm.requests[0]["messages"][1]["content"]
    assert prompt.startswith(f"Query: {question}")
    assert "PREVIOUS ANSWER" not in prompt
    # The retry replaces this turn's previous answer instead of stacking it.
    assert [m.content for m in out["messages"]] == [question, "NEW ANSWER"]


def test_f2_reformulation_changes_search_text_only(monkeypatch):
    from src.agent.graph import nodes

    llm = FakeLLM()
    monkeypatch.setattr(nodes, "get_llm_client", lambda: llm)
    state = {"query": "original question", "messages": [HumanMessage(content="original question")],
             "encounter_groups": [], "retrieval_iterations": 0}
    out = nodes.reformulate_query(state)
    assert out["retrieval_query"] == "NEW ANSWER"
    assert "messages" not in out
    assert nodes._user_query({**state, **out}) == "original question"
    assert nodes._retrieval_query({**state, **out}) == "NEW ANSWER"


# ---------------------------------------------------------------- F3

def test_f3_sampling_override_and_seed(monkeypatch):
    from src.agent.graph import nodes

    monkeypatch.setattr(retriever_config, "llm_temperature_override", None)
    monkeypatch.setattr(retriever_config, "llm_seed", None)
    assert nodes._sampling(0.7) == {"temperature": 0.7}
    monkeypatch.setattr(retriever_config, "llm_temperature_override", 0.0)
    monkeypatch.setattr(retriever_config, "llm_seed", 0)
    assert nodes._sampling(0.7) == {"temperature": 0.0, "seed": 0}
