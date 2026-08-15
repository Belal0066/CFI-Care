import os
import httpx
import json
from typing import List, Optional, Dict, Union
from adapters.rxnav import normalize_drug_name

BASE_URL = "https://api.fda.gov/drug/label.json"

async def get_drug_interactions(drug_name: str) -> Union[str, Dict]:
    try:
        normalized_name = await normalize_drug_name(drug_name)
        search_term = normalized_name if normalized_name else drug_name
        search_term = search_term.replace('"', '')

        async with httpx.AsyncClient(trust_env=True, follow_redirects=True) as client:
            q = f'(generic_name:"{search_term}"+OR+openfda.generic_name:"{search_term}"+OR+brand_name:"{search_term}")+AND+_exists_:drug_interactions'
            params = {"search": q, "limit": 2}
            if os.getenv("OPENFDA_API_KEY"):
                params["api_key"] = os.getenv("OPENFDA_API_KEY")
            resp = await client.get(BASE_URL, params=params, timeout=15.0)
            
            if resp.status_code == 404:
                return None
            
            resp.raise_for_status()
            results = resp.json().get("results", [])
            if not results: return None
            
            top = results[0]
            return {
                "drug_name": search_term,
                "interactions": top.get("drug_interactions", ["No specific interaction data in label"])[0][:1500],
                "contraindications": top.get("contraindications", ["N/A"])[0][:1000]
            }
    except Exception as e:
        return f"OpenFDA Error: {str(e)}"
