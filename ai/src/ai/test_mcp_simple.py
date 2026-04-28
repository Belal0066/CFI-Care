#!/usr/bin/env python3
"""
Simple MCP Test Script
Tests the MCP's ability to fetch medical guidelines and drug information.
"""
import sys
sys.path.insert(0, '.')

from src.agent.graph.workflow import app
from langchain_core.messages import HumanMessage

# Test queries based on the patient data
test_queries = [
    {
        "name": "Mycoplasma Treatment Guidelines",
        "query": "What are the current guidelines for treating Mycoplasma Pneumonia?",
        "expected_keywords": ["azithromycin", "macrolide", "doxycycline", "fluoroquinolone"]
    },
    {
        "name": "Azithromycin Drug Interactions",
        "query": "What are the main drug interactions with Azithromycin?",
        "expected_keywords": ["qt", "warfarin", "digoxin", "interactions"]
    },
    {
        "name": "Azithromycin Contraindications",
        "query": "What are the contraindications for Azithromycin?",
        "expected_keywords": ["allergy", "liver", "qt", "macrolide"]
    },
    {
        "name": "Alternative Antibiotics",
        "query": "What antibiotics can be used if Azithromycin is not suitable?",
        "expected_keywords": ["doxycycline", "fluoroquinolone", "levofloxacin", "moxifloxacin"]
    }
]

print("="*70)
print("MCP SIMPLE TEST - Medical Guidelines & Drug Information")
print("="*70)

for i, test in enumerate(test_queries, 1):
    print(f"\n{'='*70}")
    print(f"TEST {i}: {test['name']}")
    print(f"{'='*70}")
    print(f"Query: {test['query']}")
    print("-"*70)
    
    # Run the query through the MCP system
    state = {
        'messages': [HumanMessage(content=test['query'])],
        'patient_state': None,  # No patient context - pure MCP query
        'documents': [],
        'intent': '',
        'retrieved_docs': [],
        'internet_evidence': [],
        'clinical_response': None,
        'is_mcp_query': True  # Force MCP mode
    }
    
    try:
        result = app.invoke(state)
        
        # Extract response - MCP path puts final answer in messages (as AIMessage)
        final_response = None
        messages = result.get('messages', [])
        for msg in reversed(messages):
            if hasattr(msg, 'content') and msg.content:
                final_response = msg.content
                break
        
        # Fallback to clinical_response if available (RAG path)
        if not final_response:
            clinical_resp = result.get('clinical_response')
            if clinical_resp:
                final_response = clinical_resp.get('explanation', str(clinical_resp))
        
        internet_evidence = result.get('internet_evidence', [])
        
        if final_response:
            print("\n📊 RESPONSE:")
            print(final_response[:500] if len(final_response) > 500 else final_response)
            
            # Check if expected keywords are present
            response_lower = final_response.lower()
            found_keywords = [kw for kw in test['expected_keywords'] if kw.lower() in response_lower]
            
            print(f"\n✓ Expected Keywords Found: {found_keywords}")
            print(f"✗ Missing Keywords: {[kw for kw in test['expected_keywords'] if kw.lower() not in response_lower]}")
        else:
            print("\n⚠️  No response generated")
        
        # Show evidence sources
        if internet_evidence:
            ev = internet_evidence[0] if internet_evidence else {}
            print(f"\n📚 Sources Retrieved: {len(ev.get('raw_data', []))} PubMed articles")
            print(f"Optimized Query: {ev.get('optimized_query', 'N/A')}")
        
        print("\n✅ TEST PASSED" if final_response and found_keywords else "⚠️  TEST NEEDS REVIEW")
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()

print("\n" + "="*70)
print("ALL TESTS COMPLETED")
print("="*70)
