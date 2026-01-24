import asyncio
import os
import json
from mcp import ClientSession
from mcp.client.sse import sse_client
from openai import OpenAI

# Configuration
# 1. MCP Server (Tunneled from your local machine to this server)
MCP_SERVER_URL = "http://localhost:8002/mcp/sse" 

# 2. Llama.cpp Server (Running locally on this remote server)
LLAMA_API_URL = "http://localhost:8000/v1" 
LLAMA_API_KEY = "sk-no-key-required"

async def main():
    print(f"Connecting to MCP Server at {MCP_SERVER_URL}...")
    
    # Connect to the MCP Server via SSE
    async with sse_client(url=MCP_SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            
            # 1. List available tools from the MCP Server
            mcp_tools = await session.list_tools()
            print(f" Connected! Found {len(mcp_tools.tools)} tools.")
            
            # 2. Convert MCP tools to OpenAI-compatible tool definitions
            openai_tools = []
            for tool in mcp_tools.tools:
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.inputSchema
                    }
                })
            
            # 3. Initialize OpenAI Client pointing to Llama.cpp
            client = OpenAI(base_url=LLAMA_API_URL, api_key=LLAMA_API_KEY)
            
            user_query = "What is the clinical protocol for hypertension?"
            print(f"\nQUERY: {user_query}")
            
            # 4. Call Llama.cpp with the tools
            try:
                response = client.chat.completions.create(
                    model="model", # typically 'model' or alias for llama.cpp
                    messages=[{"role": "user", "content": user_query}],
                    tools=openai_tools,
                    tool_choice="auto"
                )
                
                message = response.choices[0].message
                print(f"\nLLM RESPONSE: {message.content}")
                
                # 5. Execute tool if requested
                if message.tool_calls:
                    for tool_call in message.tool_calls:
                        fname = tool_call.function.name
                        fargs = json.loads(tool_call.function.arguments)
                        print(f" -> Tool Call Requested: {fname}({fargs})")
                        
                        # Execute against MCP session
                        result = await session.call_tool(fname, fargs)
                        print(f" -> Tool Result: {result.content}")

            except Exception as e:
                print(f"Error calling Llama.cpp: {e}")
                print("Make sure Llama.cpp server is running (e.g., ./llama-server -c 2048 --port 8080)")

if __name__ == "__main__":
    asyncio.run(main())
