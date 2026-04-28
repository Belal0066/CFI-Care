#!/usr/bin/env python3
"""
End-to-End MCP Flow Test
Tests the exact scenario from the UI: Local RAG → MCP follow-up
"""
import sys
sys.path.insert(0, '.')

from src.agent.graph.workflow import app
from langchain_core.messages import HumanMessage, AIMessage

def test_mcp_with_context():
    """Test MCP query optimization with clinical context"""
    print("="*70)
    print("END-TO-END MCP QUERY OPTIMIZATION TEST")
    print("="*70)
    print()
    print("Scenario: Patient with Mycoplasma Pneumonia")
    print("  1. User asks about clinical trends (Local RAG)")
    print("  2. System responds mentioning Mycoplasma Pneumonia")
    print("  3. User asks 'what are the guidelines for treating this patient?'")
    print("  4. System should extract Mycoplasma from context")
    print()
    
    # Simulate the exact UI flow
    messages = [
        HumanMessage(content='Are there any important clinical trends in this case?'),
        AIMessage(content='Based on the provided clinical reasoning, the important clinical trend is the patient improvement in clinical status following the initiation of Azithromycin treatment for Mycoplasma Pneumonia. The patient presenting symptoms of cough and fatigue have resolved.'),
        HumanMessage(content='what are the guidelines for treating this patient?')
    ]
    
    patient_state = {
        'eoc_id': 'test-patient-123',
        'active_diagnosis': ['Mycoplasma Pneumonia'],
        'recent_medications': ['Azithromycin'],
        'allergies': ['Amoxicillin (penicillin-class)'],
        'current_symptoms': [],
        'clinical_status': 'Improved'
    }
    
    print("Running agent workflow...")
    print("-"*70)
    
    result = app.invoke({
        'messages': messages,
        'patient_state': patient_state,
        'documents': [],
        'intent': '',
        'retrieved_docs': [],
        'internet_evidence': [],
        'clinical_response': None,
        'is_mcp_query': True  # Force MCP mode
    })
    
    # Analyze results
    ev = result.get('internet_evidence', [{}])[0]
    original = ev.get('original_query', 'N/A')
    optimized = ev.get('optimized_query', 'N/A')
    
    print()
    print("RESULTS:")
    print("-"*70)
    print(f"Original Query:  {original}")
    print(f"Optimized Query: {optimized}")
    print()
    
    # Validation
    has_condition = any(term in optimized.lower() for term in ['mycoplasma', 'pneumoni'])
    has_intent = any(term in optimized.lower() for term in ['treatment', 'guideline', 'management'])
    is_clean = len(optimized) < 100 and not optimized.startswith('thought')
    
    print("Validation:")
    print(f"  ✅ Contains condition (Mycoplasma/Pneumonia)" if has_condition else "  ❌ Missing condition")
    print(f"  ✅ Contains intent (treatment/guideline)" if has_intent else "  ❌ Missing intent")
    print(f"  ✅ Clean format (no reasoning text)" if is_clean else "  ❌ Contains reasoning/too long")
    print()
    
    if has_condition and has_intent and is_clean:
        print("🎉 SUCCESS - MCP Query Optimization Working Correctly!")
        print()
        print("PubMed Results Retrieved:")
        for i, article in enumerate(ev.get('raw_data', [])[:3], 1):
            content = article.get('content', '')
            is_relevant = 'mycoplasma' in content.lower() or 'pneumoni' in content.lower()
            marker = "✅" if is_relevant else "⚠️"
            print(f"  {i}. {marker} {content[:70]}...")
        return True
    else:
        print("❌ FAILED - Query optimization not working correctly")
        print()
        print("DEBUG INFO:")
        print(f"  Classification: {ev.get('classification', 'N/A')}")
        print(f"  Entities: {ev.get('entities', [])}")
        return False

if __name__ == '__main__':
    success = test_mcp_with_context()
    sys.exit(0 if success else 1)
