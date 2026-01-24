import asyncio
from adapters.pubmed import search_pubmed
from adapters.openfda import get_drug_interactions
from adapters.references import get_reference_range

async def test_adapters():
    print("\n--- Testing Reference Adapter ---")
    ref = get_reference_range("potassium")
    print(f"Potassium: {ref}")
    assert "3.5 - 5.0" in ref
    
    print("\n--- Testing OpenFDA Adapter ---")
    drug = "aspirin"
    interactions = await get_drug_interactions(drug)
    print(f"Interactions for {drug}: {interactions[:100]}...")
    # OpenFDA might return different things, but we expect some string.
    # If network fails, this might print error string.
    
    print("\n--- Testing PubMed Adapter ---")
    query = "hypertension"
    results = await search_pubmed(query)
    print(f"PubMed Results for {query}:")
    for r in results:
        print(f"- {r}")

if __name__ == "__main__":
    asyncio.run(test_adapters())
