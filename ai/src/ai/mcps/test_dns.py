import asyncio
import httpx

async def test():
    urls = [
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        "https://api.fda.gov/drug/label.json",
        "https://rxnav.nlm.nih.gov/REST/approximateTerm.json"
    ]
    async with httpx.AsyncClient() as client:
        for url in urls:
            try:
                resp = await client.get(url, timeout=5.0)
                print(f" {url}: {resp.status_code}")
            except Exception as e:
                print(f" {url}: {e}")

if __name__ == "__main__":
    asyncio.run(test())
