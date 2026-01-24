import asyncio
import os
import sys
from dotenv import load_dotenv

# Ensure we can import from local directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from router import run_medical_flow

load_dotenv()

async def test_guardrail():
    print("\n--- Testing Guardrail ---")
    bad_query = "crystal healing"  # Changed to match exact keyword in router.py
    try:
        result = await run_medical_flow(bad_query)
        print(f"Query: {bad_query}")
        
        # Check classification/error directly from the state dict returned
        # Logic in router.py: guardrail_node returns {"classification": "G", ...}
        # and then classification_node might run.
        # But wait, guardrail_node returns key-value updates to the state.
        # run_medical_flow returns the final state.
        
        # If guardrail catches it, it sets classification='G' and error='Guardrail: ...'
        classification = result.get("classification")
        error = result.get("error")
        
        print(f"Result Classification: {classification}")
        print(f"Result Error: {error}")
        
        if classification == "G" or (error and "Guardrail" in error):
            print("PASS: Correctly caught by guardrail")
        else:
            print(f"FAIL: Should be G/Guardrail error. Got {classification} / {error}")
            
    except Exception as e:
        print(f"ERROR: {e}")

async def test_medical_query():
    print("\n--- Testing Medical Query ---")
    
    # Check for API keys
    groq_key = os.getenv("GROQ_API_KEY")
    llama_key = os.getenv("LLAMACPP_API_KEY")
    
    if not groq_key and not llama_key:
        print("SKIPPING: No GROQ_API_KEY or LLAMACPP_API_KEY found in env.")
        print("Please set GROQ_API_KEY in .env file in mcps directory.")
        return

    good_query = "What is the standard dosage for Amoxicillin?"
    print(f"Query: {good_query}")
    print("Running flow... (this calls the LLM)")
    
    try:
        result = await run_medical_flow(good_query)
        
        classification = result.get("classification")
        raw_data = result.get("raw_data")
        
        print(f"Result Classification: {classification}")
        print(f"Raw Data Entries: {len(raw_data) if raw_data else 0}")
        
        if classification and classification != "G":
            print(f"PASS: Classified as {classification}")
            if raw_data:
                print(f"PASS: Retrieved {len(raw_data)} items")
                print(f"Sample source: {raw_data[0].get('source')}")
            else:
                print("WARN: No data retrieved (check internet/adapters)")
        else:
            print("FAIL: Should NOT be G")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_guardrail())
    asyncio.run(test_medical_query())
