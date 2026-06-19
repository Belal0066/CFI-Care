#!/usr/bin/env python3
"""
Test MedGemma RAG Integration
Usage: python test_medgemma_rag.py
"""
import logging
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.medgemma_rag import medgemma_rag

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_basic_query():
    """Test basic RAG query without patient filter."""
    print("\n" + "="*80)
    print("TEST 1: Basic RAG Query")
    print("="*80)
    
    query = "What are the symptoms of diabetes?"
    
    print(f"\nQuery: {query}")
    print("\nProcessing...")
    
    result = medgemma_rag.query(query)
    
    print("\n--- RESPONSE ---")
    print(result["content"])
    print("\n--- METADATA ---")
    print(f"Model: {result.get('model', 'N/A')}")
    print(f"Contexts Used: {result['contexts_used']}")
    if result.get("usage"):
        print(f"Tokens: {result['usage']}")
    
    if result.get("contexts"):
        print("\n--- RETRIEVED CONTEXTS ---")
        for i, ctx in enumerate(result["contexts"], 1):
            print(f"\n[{i}] Score: {ctx['score']:.4f} | Patient: {ctx['patient_id']}")
            print(f"    {ctx['content'][:200]}...")


def test_patient_filtered_query():
    """Test RAG query with patient filter."""
    print("\n" + "="*80)
    print("TEST 2: Patient-Filtered RAG Query")
    print("="*80)
    
    patient_id = "patient-001"  # Adjust based on your test data
    query = "What medications is the patient taking?"
    
    print(f"\nPatient ID: {patient_id}")
    print(f"Query: {query}")
    print("\nProcessing...")
    
    result = medgemma_rag.query(query, patient_id=patient_id)
    
    print("\n--- RESPONSE ---")
    print(result["content"])
    print("\n--- METADATA ---")
    print(f"Contexts Used: {result['contexts_used']}")
    
    if result.get("contexts"):
        print("\n--- RETRIEVED CONTEXTS ---")
        for i, ctx in enumerate(result["contexts"], 1):
            print(f"\n[{i}] Score: {ctx['score']:.4f}")
            print(f"    Type: {ctx['resource_type']}")
            print(f"    {ctx['content'][:150]}...")


def test_custom_system_prompt():
    """Test with custom system prompt."""
    print("\n" + "="*80)
    print("TEST 3: Custom System Prompt")
    print("="*80)
    
    query = "Explain hypertension treatment"
    system_prompt = (
        "You are a medical educator. Provide clear, structured explanations "
        "suitable for medical students. Use the provided clinical context."
    )
    
    print(f"\nQuery: {query}")
    print(f"System Prompt: {system_prompt}")
    print("\nProcessing...")
    
    result = medgemma_rag.query(query, system_prompt=system_prompt)
    
    print("\n--- RESPONSE ---")
    print(result["content"])


def test_retrieval_only():
    """Test retrieval without generation."""
    print("\n" + "="*80)
    print("TEST 4: Retrieval Only")
    print("="*80)
    
    query = "diabetes diagnosis"
    
    print(f"\nQuery: {query}")
    print("\nRetrieving contexts...")
    
    contexts = medgemma_rag.retrieve_context(query)
    
    print(f"\nRetrieved {len(contexts)} contexts:")
    for i, ctx in enumerate(contexts, 1):
        print(f"\n[{i}] Score: {ctx['score']:.4f}")
        print(f"    ID: {ctx['id']}")
        print(f"    Patient: {ctx['patient_id']}")
        print(f"    Type: {ctx['resource_type']}")
        print(f"    Content: {ctx['content'][:200]}...")


def interactive_mode():
    """Interactive RAG chat."""
    print("\n" + "="*80)
    print("INTERACTIVE MODE - MedGemma RAG")
    print("="*80)
    print("\nCommands:")
    print("  /patient <id>  - Set patient filter")
    print("  /clear         - Clear patient filter")
    print("  /quit          - Exit")
    print("\n" + "-"*80)
    
    patient_id = None
    
    while True:
        try:
            user_input = input("\nYou: ").strip()
            
            if not user_input:
                continue
                
            if user_input == "/quit":
                print("Goodbye!")
                break
                
            if user_input == "/clear":
                patient_id = None
                print("✓ Patient filter cleared")
                continue
                
            if user_input.startswith("/patient "):
                patient_id = user_input.split(maxsplit=1)[1].strip()
                print(f"✓ Patient filter set to: {patient_id}")
                continue
            
            # Process query
            if patient_id:
                print(f"[Patient: {patient_id}]")
            
            result = medgemma_rag.query(user_input, patient_id=patient_id)
            
            print(f"\nMedGemma: {result['content']}")
            print(f"\n[Used {result['contexts_used']} contexts]")
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test MedGemma RAG Integration")
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="Run in interactive mode"
    )
    parser.add_argument(
        "--test",
        choices=["basic", "patient", "prompt", "retrieval", "all"],
        default="all",
        help="Which test to run"
    )
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_mode()
    else:
        tests = {
            "basic": test_basic_query,
            "patient": test_patient_filtered_query,
            "prompt": test_custom_system_prompt,
            "retrieval": test_retrieval_only
        }
        
        if args.test == "all":
            for test_func in tests.values():
                try:
                    test_func()
                except Exception as e:
                    logger.error(f"Test failed: {e}", exc_info=True)
        else:
            try:
                tests[args.test]()
            except Exception as e:
                logger.error(f"Test failed: {e}", exc_info=True)
