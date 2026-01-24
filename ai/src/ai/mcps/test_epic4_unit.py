import asyncio
import os
import json
from unittest.mock import MagicMock, patch
from router import synthesizer_node, validator_node, GraphState

async def test_synthesizer():
    print("\n--- Testing Synthesizer Node ---")
    state: GraphState = {
        "query": "What are the common side effects of Aspirin?",
        "classification": "A",
        "raw_data": [{"source": "PubMed", "content": "Side effects include bleeding, nausea."}],
        "structured_response": None,
        "conflicts": [],
        "error": None
    }
    
    # Mock LLM response
    mock_llm = MagicMock()
    mock_response = MagicMock()
    mock_response.content = json.dumps({
        "clinical_summary": "According to PubMed, side effects include bleeding and nausea.",
        "evidence_level": "Level 1A",
        "recommendation": "Monitor for signs of bleeding.",
        "confidence_score": 0.9,
        "references": ["PubMed"],
        "warnings": ["Bleeding risk"]
    })
    mock_llm.invoke.return_value = mock_response
    
    with patch("router.llm", mock_llm):
        result = await synthesizer_node(state)
        print("Synthesized Response:", json.dumps(result, indent=2))
        assert "structured_response" in result
        assert result["structured_response"]["confidence_score"] == 0.9

async def test_conflict_detection():
    print("\n--- Testing Conflict Detection (Ticket 4.2) ---")
    state: GraphState = {
        "query": "What is the potassium range?",
        "classification": "B",
        "raw_data": [
            {"source": "Source A", "content": "Potassium range is 3.5 - 5.0"},
            {"source": "Source B", "content": "Potassium range is 4.0 - 6.0"} # Conflict
        ],
        "structured_response": {
            "clinical_summary": "Summary text",
            "confidence_score": 0.9,
            "notes": ""
        },
        "conflicts": [],
        "error": None
    }
    
    # Mock LLM response for conflict
    mock_llm = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Conflict in potassium ranges detected: 3.5-5.0 vs 4.0-6.0"
    mock_llm.invoke.return_value = mock_response
    
    with patch("router.llm", mock_llm):
        result = await validator_node(state)
        print("Validation Result:", json.dumps(result, indent=2))
        
        structured = result.get("structured_response", {})
        assert "Conflict Warning" in structured.get("notes", "")
        assert structured["confidence_score"] < 0.9
        print("PASS: Conflict detected and notes updated.")

if __name__ == "__main__":
    asyncio.run(test_synthesizer())
    asyncio.run(test_conflict_detection())
