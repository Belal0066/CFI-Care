import streamlit as st
import httpx
import asyncio
import json

st.set_page_config(
    page_title="MedMCP | Senior Medical Interface",
    page_icon="️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for a premium look
st.markdown("""
    <style>
    .main {
        background-color: #f8fafc;
    }
    .stButton>button {
        width: 100%;
        border-radius: 8px;
        height: 3em;
        background-color: #1e293b;
        color: white;
    }
    .medical-card {
        padding: 20px;
        border-radius: 12px;
        background-color: white;
        border: 1px solid #e2e8f0;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .warning-card {
        padding: 15px;
        border-radius: 8px;
        background-color: #fff7ed;
        border-left: 5px solid #f97316;
        color: #9a3412;
    }
    .source-tag {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        background-color: #f1f5f9;
        font-size: 0.8em;
        margin-right: 5px;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("️ MedMCP: Senior Medical Interface")
st.caption("Low-latency, authoritative medical reasoning powered by Llama 3.3 70B & LangGraph")

with st.sidebar:
    st.header("Settings & Status")
    api_status = st.empty()
    st.info("Backend: FastAPI @ localhost:8002")
    
    st.divider()
    st.markdown("### Category Legend")
    st.markdown("""
    - **A**: General Medical
    - **B**: Reference Ranges
    - **C**: Drug Interactions
    - **D**: Clinical Guidelines
    - **G**: Insufficient Evidence
    """)

# Query Input
query = st.text_input("Enter clinical query or lab result:", placeholder="e.g., 'What are the interactions for Warfarin?' or 'Potassium 3.2'")

async def fetch_data(q):
    url = "http://localhost:8002/mcp/query"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json={"query": q}, timeout=60.0)
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"error": f"JSON Decode Error. Status: {response.status_code}, Body: {response.text[:500]}"}
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

if query:
    with st.spinner("Synthesizing authoritative response..."):
        result = asyncio.run(fetch_data(query))
    
    if "detail" in result or "error" in result:
        st.error(f"Error connecting to backend: {result.get('detail', result.get('error'))}")
    else:
        # Display Results
        col1, col2 = st.columns([2, 1])
        
        # Check if we have a structured response (old format) or raw retrieval (new format)
        if "clinical_summary" in result:
             # Old/Synthesis Format
            with col1:
                st.markdown("###  Clinical Summary")
                st.markdown(f'<div class="medical-card">{result["clinical_summary"]}</div>', unsafe_allow_html=True)
                
                st.markdown("###  Actionable Recommendation")
                st.success(result["recommendation"])
                
                if result.get("notes"):
                    st.markdown("### ️ Conflict Validator")
                    st.markdown(f'<div class="warning-card">{result["notes"]}</div>', unsafe_allow_html=True)

            with col2:
                st.markdown("###  Metadata")
                st.metric("Confidence Score", f"{result.get('confidence_score', 0)*100:.0f}%")
                st.metric("Evidence Level", result.get("evidence_level", "N/A"))
                
                st.markdown("###  References")
                if result.get("references"):
                    for ref in result["references"]:
                        st.markdown(f"• {ref}")
                else:
                    st.write("No direct citations provided.")
                    
                if result.get("warnings"):
                    st.markdown("###  Safety Warnings")
                    for w in result["warnings"]:
                        st.warning(w)

        else:
            # New/Retrieval Format
            classification = result.get("classification", "Unknown")
            sources = result.get("sources", [])
            raw_data = result.get("raw_data", [])

            with col1:
                st.markdown(f"###  MCP Retrieval Results (Class: {classification})")
                
                if not raw_data:
                    st.warning("No data retrieved.")
                
                for idx, item in enumerate(raw_data):
                    source = item.get("source", "Unknown Source")
                    content = item.get("content", "")
                    url = item.get("url", "")
                    
                    st.markdown(f"**{idx+1}. {source}**")
                    st.info(content[:2000] + ("..." if len(content) > 2000 else "")) # Truncate long content
                    if url:
                        st.markdown(f"[Link to Source]({url})")
                    st.divider()

            with col2:
                st.markdown("###  Metadata")
                st.metric("Classification", classification)
                st.metric("Items Retrieved", len(raw_data))
                
                st.markdown("###  Sources Found")
                if sources:
                    for s in sources:
                        st.markdown(f"• {s}")
                else:
                    st.write("No sources identified.")

else:
    st.info("Please enter a query to begin clinical synthesis.")
    st.markdown("""
    ### Example Queries:
    1. **Guidelines**: "What are the latest ESC guidelines for acute heart failure?"
    2. **Interactions**: "Are there any interactions between Lisinopril and NSAIDs?"
    3. **Reference Range**: "What is the normal range for Hemoglobin A1c?"
    4. **Guardrail Check**: "Tell me about chakra alignment for health."
    """)
