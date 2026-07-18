#!/usr/bin/env python3
"""
Simple example of using MedGemma RAG
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.medgemma_rag import medgemma_rag

def main():
    print(" MedGemma RAG Example")
    print("=" * 60)
    
    # Example 1: General medical query
    print("\n Example 1: General Medical Query")
    print("-" * 60)
    query = "What are the common symptoms of type 2 diabetes?"
    print(f"Query: {query}\n")
    
    result = medgemma_rag.query(query)
    
    print("Answer:")
    print(result["content"])
    print(f"\n✓ Used {result['contexts_used']} contexts from Qdrant")
    
    # Example 2: Show retrieved contexts
    if result.get("contexts"):
        print("\n Retrieved Contexts:")
        for i, ctx in enumerate(result["contexts"][:3], 1):
            print(f"\n  [{i}] Score: {ctx['score']:.3f}")
            print(f"      Patient: {ctx['patient_id']}")
            print(f"      Type: {ctx['resource_type']}")
            print(f"      Content: {ctx['content'][:150]}...")
    
    # Example 3: Patient-specific query
    print("\n\n Example 2: Patient-Specific Query")
    print("-" * 60)
    patient_id = "patient-001"
    query = "What is this patient's current health status?"
    print(f"Patient ID: {patient_id}")
    print(f"Query: {query}\n")
    
    result = medgemma_rag.query(query, patient_id=patient_id)
    
    print("Answer:")
    print(result["content"])
    print(f"\n✓ Filtered to patient: {patient_id}")
    print(f"✓ Retrieved {result['contexts_used']} patient-specific contexts")
    
    # Example 4: Retrieval only
    print("\n\n Example 3: Retrieval Only (No Generation)")
    print("-" * 60)
    query = "hypertension treatment"
    print(f"Query: {query}\n")
    
    contexts = medgemma_rag.retrieve_context(query)
    
    print(f"Retrieved {len(contexts)} contexts:")
    for i, ctx in enumerate(contexts, 1):
        print(f"\n  [{i}] Score: {ctx['score']:.3f} | Patient: {ctx['patient_id']}")
        print(f"      {ctx['content'][:120]}...")
    
    print("\n" + "=" * 60)
    print(" Examples complete!")
    print("\nNext steps:")
    print("  • Run: python scripts/test_medgemma_rag.py --interactive")
    print("  • Docs: README.md, context.md")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n Error: {e}")
        import traceback
        traceback.print_exc()
