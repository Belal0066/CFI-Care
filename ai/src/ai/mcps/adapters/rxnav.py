import httpx
from typing import Optional

BASE_URL = "https://rxnav.nlm.nih.gov/REST"

async def normalize_drug_name(term: str) -> Optional[str]:
    """
    Normalizes a drug name to its canonical RxNorm name using the Approximate Match API.
    Example: "Coudamin" -> "Warfarin" (or "Coumadin" -> "Coumadin" depending on Concept)
    We will prioritize the 'rxcui' output and try to get the primary name.
    """
    async with httpx.AsyncClient() as client:
        try:
            # ROI: /approximateTerm.json?term=value&maxEntries=1
            url = f"{BASE_URL}/approximateTerm.json"
            params = {
                "term": term,
                "maxEntries": 1
            }
            resp = await client.get(url, params=params, timeout=5.0)
            data = resp.json()
            
            # Navigate nested JSON structure
            # response -> approximateGroup -> candidate -> [0] -> rxcui, score
            group = data.get("approximateGroup", {})
            candidates = group.get("candidate", [])
            
            if not candidates:
                return None
                
            # Take the first best match
            best_match = candidates[0]
            rxcui = best_match.get("rxcui")
            
            if not rxcui:
                return None
                
            # Optional: Get property to confirm name, or just use the approximate term returned?
            # Creating a second call to get properties is safer for canonicalization.
            prop_url = f"{BASE_URL}/rxcui/{rxcui}/properties.json"
            prop_resp = await client.get(prop_url, timeout=5.0)
            prop_data = prop_resp.json()
            
            name = prop_data.get("properties", {}).get("name")
            return name if name else term.title()
            
        except Exception:
            # Fallback to original term on any error
            return None
