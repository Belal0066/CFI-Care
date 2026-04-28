import httpx
import xml.etree.ElementTree as ET
from typing import List, Dict

# Public Entrez API endpoint
BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

async def search_pubmed(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Searches PubMed and returns articles with titles, PMIDs, and URLs."""
    async with httpx.AsyncClient(trust_env=True, follow_redirects=True) as client:
        try:
            # Relaxed query: Include guidelines, reviews, recent articles, and books/chapters
            # Don't over-constrain - let relevance ranking work
            refined_query = f"{query} AND (Practice Guideline[pt] OR Review[pt] OR systematic[sb] OR guideline OR treatment OR therapy)"
            params = {
                "db": "pubmed",
                "term": refined_query,
                "retmode": "json",
                "retmax": max_results,
                "sort": "relevance"  # Use relevance instead of date
            }
            resp = await client.get(f"{BASE_URL}/esearch.fcgi", params=params, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            id_list = data.get("esearchresult", {}).get("idlist", [])
            
            if not id_list:
                return [{"title": "No direct authoritative guidelines found on PubMed for this query.", "pmid": "", "url": ""}]

            fetch_params = {"db": "pubmed", "id": ",".join(id_list), "retmode": "xml"}
            summary_resp = await client.get(f"{BASE_URL}/efetch.fcgi", params=fetch_params, timeout=15.0)
            summary_resp.raise_for_status()
            
            root = ET.fromstring(summary_resp.content)
            results = []
            
            for article in root.findall(".//PubmedArticle"):
                title_elem = article.find(".//ArticleTitle")
                pmid_elem = article.find(".//PMID")
                
                # Extract abstract text
                abstract_text = ""
                abstract_elems = article.findall(".//AbstractText")
                if abstract_elems:
                    abstract_parts = []
                    for abs_elem in abstract_elems:
                        # Handle structured abstracts with labels
                        label = abs_elem.get('Label', '')
                        text = abs_elem.text or ""
                        if label:
                            abstract_parts.append(f"{label}: {text}")
                        else:
                            abstract_parts.append(text)
                    abstract_text = " ".join(abstract_parts)
                
                if title_elem is not None and title_elem.text:
                    pmid = pmid_elem.text if pmid_elem is not None else ""
                    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""
                    
                    results.append({
                        "title": title_elem.text,
                        "pmid": pmid,
                        "url": url,
                        "abstract": abstract_text
                    })
            
            return results[:max_results] if results else [{"title": "No results found", "pmid": "", "url": ""}]
        except Exception as e:
            return [{"title": f"PubMed Connection Error: {str(e)}", "pmid": "", "url": ""}]

async def search_pubmed_interactions(drug1: str, drug2: str) -> List[str]:
    """Interaction specific fallback."""
    query = f'{drug1} AND {drug2} AND "Drug Interactions"[MeSH Terms]'
    async with httpx.AsyncClient(trust_env=True) as client:
        try:
            params = {"db": "pubmed", "term": query, "retmode": "json", "retmax": 3}
            resp = await client.get(f"{BASE_URL}/esearch.fcgi", params=params, timeout=15.0)
            resp.raise_for_status()
            ids = resp.json().get("esearchresult", {}).get("idlist", [])
            if not ids: return []

            fetch_resp = await client.get(f"{BASE_URL}/efetch.fcgi", params={"db":"pubmed", "id":",".join(ids), "retmode":"xml"}, timeout=15.0)
            root = ET.fromstring(fetch_resp.content)
            results = []
            for art in root.findall(".//Article"):
                t = art.find(".//ArticleTitle")
                a = art.find(".//AbstractText")
                results.append(f"Title: {t.text if t is not None else 'N/A'}\nAbstract: {a.text if a is not None else 'No abstract'}")
            return results
        except Exception as e:
            return [f"PubMed Error: {str(e)}"]
