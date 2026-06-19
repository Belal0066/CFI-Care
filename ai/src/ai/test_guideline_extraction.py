#!/usr/bin/env python3
"""
Test MCP Guideline Extraction Enhancement
Validates that abstracts are fetched and synthesized into actionable guidelines.
"""

import sys
import asyncio
sys.path.insert(0, '/home/belal/AI_System')

from mcps.adapters.pubmed import search_pubmed

async def test_abstract_extraction():
    """Test that PubMed adapter extracts abstracts."""
    print("=" * 60)
    print("TEST: Abstract Extraction from PubMed")
    print("=" * 60)
    
    query = "Mycoplasma Pneumonia treatment guideline"
    print(f"\n🔍 Query: {query}\n")
    
    results = await search_pubmed(query, max_results=2)
    
    for idx, result in enumerate(results, 1):
        print(f"\n📄 Article {idx}:")
        print(f"   Title: {result.get('title', 'N/A')[:100]}...")
        print(f"   PMID: {result.get('pmid', 'N/A')}")
        
        abstract = result.get('abstract', '')
        if abstract:
            print(f"   ✅ Abstract Found: {len(abstract)} chars")
            print(f"   Preview: {abstract[:200]}...")
        else:
            print(f"   ❌ No Abstract")
    
    # Validation
    has_abstracts = any(r.get('abstract') for r in results)
    
    print("\n" + "=" * 60)
    if has_abstracts:
        print("✅ SUCCESS: Abstracts are being extracted")
    else:
        print("❌ FAILURE: No abstracts found - may be behind paywall or issue with extraction")
    print("=" * 60)
    
    return has_abstracts

if __name__ == "__main__":
    success = asyncio.run(test_abstract_extraction())
    sys.exit(0 if success else 1)
