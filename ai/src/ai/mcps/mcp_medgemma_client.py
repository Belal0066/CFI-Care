import asyncio
import json
import httpx
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# Configuration from environment or defaults
# If running locally and llama.cpp is remote, use: ssh -L 5000:localhost:8080 user@remote-server
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/mcp/query")
LLAMACPP_API_BASE = os.getenv("LLAMACPP_API_BASE", "http://localhost:5000/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "MedGemma")

async def call_mcp_tool(query: str):
    """Calls the local Medical MCP server."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(MCP_SERVER_URL, json={"query": query}, timeout=60.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}

async def main():
    client = AsyncOpenAI(base_url=LLAMACPP_API_BASE, api_key=os.getenv("LLAMACPP_API_KEY", "sk-no-token"))
    
    print("️ MedMCP + Llama.cpp Bridge Started")
    print(f" MCP Endpoint: {MCP_SERVER_URL}")
    print(f" Llama.cpp API: {LLAMACPP_API_BASE}")
    print(f" Model: {MODEL_NAME}")
    
    while True:
        try:
            user_query = input("\n[Patient Query] > ")
        except EOFError:
            break
            
        if user_query.lower() in ["exit", "quit", "q"]:
            break
            
        print("\n Fetching authoritative medical data via MCP...")
        
        # 1. Retrieve data from MCP
        mcp_data = await call_mcp_tool(user_query)
        
        if "error" in mcp_data and len(mcp_data) == 1:
            print(f" MCP Error: {mcp_data['error']}")
            continue

        # 2. Feed the authoritative data back to the remote model for synthesis
        prompt = (
            "You are a highly capable medical assistant. Use the authoritative medical data pr
ovided below to answer the user's query.\n"
            "Ensure your response is accurate, professional, and cites the provided sources if
 available.\n\n"
            f"Authoritative Data:\n{json.dumps(mcp_data, indent=2)}\n\n"
            f"User Query: {user_query}\n\n"
            "Response:"
        )
        
        print(f" Synthesizing response with {MODEL_NAME}...")
        
        try:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )
            
            print("\n [Medical Response]:")
            print(response.choices[0].message.content)
        except Exception as e:
            print(f" Inference Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
