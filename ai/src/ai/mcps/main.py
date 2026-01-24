from fastapi import FastAPI
from fastmcp import FastMCP
from typing import List, Optional
import uuid
from dotenv import load_dotenv

load_dotenv()

from schemas import RetrievalDataSchema, VizRenderRequest, VizRenderResponse
from router import run_medical_flow
from adapters.clinical_viz import render_chart

# Initialize FastMCP Server
mcp = FastMCP("Medical MCP")

async def medical_retrieval_logic(query: str) -> RetrievalDataSchema:
    """
    Pure retrieval logic: Classify and fetch data from internet sources.
    NO synthesis - just return raw data for MedGemma to reason about.
    """
    print(f"DEBUG: MCP Retrieving for query: {query}")
    result = await run_medical_flow(query)
    print(f"DEBUG: MCP Router result classification: {result.get('classification')}")
    
    classification = result.get("classification", "A")
    entities = result.get("entities", [])
    raw_data = result.get("raw_data", [])
    error = result.get("error")
    
    # Extract unique sources
    sources = list(set(item.get("source", "Unknown") for item in raw_data))
    
    if classification == "G":
        return RetrievalDataSchema(
            query=query,
            classification="G",
            entities=[],
            raw_data=[{"source": "Guardrail", "content": error or "Query blocked by safety guardrail"}],
            sources=["Guardrail"]
        )
    
    if not raw_data:
        return RetrievalDataSchema(
            query=query,
            classification=classification,
            entities=entities,
            raw_data=[{"source": "Error", "content": error or "No data retrieved"}],
            sources=["Error"]
        )
    
    return RetrievalDataSchema(
        query=query,
        classification=classification,
        entities=entities,
        raw_data=raw_data,
        sources=sources
    )

@mcp.tool()
async def get_medical_data(query: str) -> RetrievalDataSchema:
    """
    Retrieves raw medical data from internet sources using LangGraph.
    Returns unprocessed data for clinical reasoning by MedGemma.
    """
    return await medical_retrieval_logic(query)


@mcp.tool()
async def render_clinical_viz(patient_data: list[dict], query: str) -> dict:
    """
    Generate a clinical visualization chart from patient observations.
    Uses Groq for normalization, then renders with matplotlib/seaborn.
    Returns base64-encoded PNG image, text summary, and chart type.
    """
    return await render_chart(patient_data, query)


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp._lifespan_manager():
        yield

# Initialize FastAPI App
app = FastAPI(lifespan=lifespan)

from pydantic import BaseModel

class QueryRequest(BaseModel):
    query: str

@app.post("/mcp/query", response_model=RetrievalDataSchema)
async def query_medical_mcp(request: QueryRequest):
    """Retrieve raw medical data from internet sources (no synthesis)"""
    return await medical_retrieval_logic(request.query)


@app.post("/mcp/viz/render", response_model=VizRenderResponse)
async def viz_render_endpoint(request: VizRenderRequest):
    """Generate clinical visualization chart from patient observations."""
    result = await render_chart(request.patient_data, request.query)
    return VizRenderResponse(**result)


# Mount FastMCP SSE handles at /mcp
# This enables the standard MCP protocol over SSE for VS Code
mcp_app = mcp.http_app(transport="sse", path="/")
app.mount("/mcp", mcp_app)

if __name__ == "__main__":
    import uvicorn
    print("Starting MCP Server on port 8002...")
    print("MCP SSE endpoint available at: http://localhost:8002/mcp/sse")
    print("MCP Query endpoint available at: http://localhost:8002/mcp/query")
    print("MCP Viz Render endpoint available at: http://localhost:8002/mcp/viz/render")
    uvicorn.run(app, host="0.0.0.0", port=8002)
