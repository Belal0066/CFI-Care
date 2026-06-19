#!/usr/bin/env python3
"""
Test Full MCP Guideline Synthesis Pipeline
Tests the complete flow: Query → PubMed → Abstract extraction → LLM synthesis → Actionable guidelines
"""

import sys
import httpx
import json

sys.path.insert(0, '/home/belal/AI_System')

def test_mcp_guideline_synthesis():
    """Test the full MCP pipeline with guideline extraction."""
    print("=" * 80)
    print("TEST: Full MCP Guideline Synthesis")
    print("=" * 80)
    
    query = "Mycoplasma Pneumonia treatment guideline"
    print(f"\n🔍 Original Query: {query}\n")
    
    # Call MCP server
    MCP_URL = "http://localhost:8002/mcp/query"
    print(f"📡 Calling MCP at {MCP_URL}...")
    
    try:
        with httpx.Client() as client:
            response = client.post(MCP_URL, json={"query": query}, timeout=30.0)
            
            if response.status_code != 200:
                print(f"❌ MCP returned status {response.status_code}")
                return False
            
            data = response.json()
            
            print(f"\n✅ MCP Response Received")
            print(f"   Classification: {data.get('classification', 'N/A')}")
            print(f"   Entities: {data.get('entities', [])}")
            
            raw_data = data.get('raw_data', [])
            print(f"\nRetrieved {len(raw_data)} sources:")
            
            has_abstracts = False
            for idx, item in enumerate(raw_data[:3], 1):
                content = item.get('content', '')
                pmid = item.get('pmid', '')
                
                # Check if abstract is present
                has_abstract = 'Abstract:' in content
                if has_abstract:
                    has_abstracts = True
                
                # Extract title
                title = content.split('\\n\\n')[0] if '\\n\\n' in content else content[:80]
                
                print(f"\n   Source {idx}:")
                print(f"   Title: {title}...")
                print(f"   PMID: {pmid}")
                print(f"   Content Length: {len(content)} chars")
                print(f"   Has Abstract: {'✅' if has_abstract else '❌'}")
                
                if has_abstract:
                    # Show abstract preview
                    abstract_part = content.split('Abstract:')[1][:150]
                    print(f"   Abstract Preview: {abstract_part}...")
            
            print("\n" + "=" * 80)
            
            if has_abstracts:
                print("✅ SUCCESS: Abstracts are included in MCP response")
                print("\n💡 Next Step: Agent will synthesize these abstracts into actionable guidelines")
                print("   Expected output: Diagnostic criteria, treatment protocols, dosing, etc.")
            else:
                print("❌ FAILURE: No abstracts found in MCP response")
                print("   Check if PubMed API is returning abstracts")
            
            print("=" * 80)
            
            return has_abstracts
            
    except httpx.ConnectError:
        print(f"❌ ERROR: Cannot connect to MCP server at {MCP_URL}")
        print("   Ensure MCP server is running: cd mcps && python main.py")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    success = test_mcp_guideline_synthesis()
    sys.exit(0 if success else 1)
