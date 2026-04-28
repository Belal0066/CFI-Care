"""
MCP Client for Clinical Reasoning (Ticket 2.3).
Connects to a FastMCP server (likely on user laptop) via SSE.
"""
import asyncio
import logging
import json
from typing import List, Dict, Any, Optional
from mcp import ClientSession
from mcp.client.sse import sse_client
from src.shared.config import config

logger = logging.getLogger(__name__)

class MCPToolManager:
    """
    Manages connection to MCP server and tool mapping.
    """
    def __init__(self, server_url: Optional[str] = None):
        self.server_url = server_url or config.mcp_server_url
        self.tools: List[Dict[str, Any]] = []
        self._session: Optional[ClientSession] = None
        self._streams: Optional[Any] = None

    async def get_tools_for_llm(self) -> List[Dict[str, Any]]:
        """
        Connects to MCP and returns tools in OpenAI format.
        """
        logger.info(f"Connecting to MCP at {self.server_url}...")
        try:
            # Note: Using context manager inside a method for long-lived session is tricky
            # In a production app, we'd manage the lifecycle better.
            # For this workflow, we'll connect, list, and store.
            async with sse_client(url=self.server_url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    mcp_tools = await session.list_tools()
                    
                    self.tools = []
                    for tool in mcp_tools.tools:
                        self.tools.append({
                            "type": "function",
                            "function": {
                                "name": tool.name,
                                "description": tool.description,
                                "parameters": tool.inputSchema
                            }
                        })
                    logger.info(f"✓ Found {len(self.tools)} MCP tools")
                    return self.tools
        except Exception as e:
            logger.error(f"Failed to fetch tools from MCP: {e}")
            return []

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """
        Invokes a tool on the remote MCP server.
        """
        logger.info(f"Calling remote tool: {name} with args: {arguments}")
        try:
            async with sse_client(url=self.server_url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)
                    return result.content
        except Exception as e:
            logger.error(f"Error calling MCP tool {name}: {e}")
            raise

# Singleton instance
mcp_manager = MCPToolManager()
