import streamlit as st
import asyncio
import json
import os
import sys
from pathlib import Path

# Add project root and src to path
ROOT_DIR = str(Path(__file__).parent.parent)
SRC_DIR = str(Path(__file__).parent.parent / "src")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from agent.mcp_client import mcp_manager
from shared.config import config

st.set_page_config(page_title="MCP Tool Tester (FastMCP)", page_icon="")

st.title(" MCP Tool Explorer")
st.markdown("""
This app tests tools running on your **local laptop**, connected via an SSH reverse tunnel to this server.
""")

# Connection Status
mcp_url = st.text_input("MCP Server URL", value=config.mcp_server_url)

if "tools" not in st.session_state:
    st.session_state.tools = []

async def fetch_tools():
    return await mcp_manager.get_tools_for_llm()

if st.button("Connect & Fetch Tools"):
    with st.spinner("Connecting to laptop MCP..."):
        try:
            tools = asyncio.run(fetch_tools())
            if tools:
                st.session_state.tools = tools
                st.success(f"Successfully found {len(tools)} tools!")
            else:
                st.error("No tools found. Is your SSH tunnel active?")
        except Exception as e:
            st.error(f"Connection failed: {e}")

# Tool Selection
if st.session_state.tools:
    st.divider()
    tool_names = [t["function"]["name"] for t in st.session_state.tools]
    selected_tool_name = st.selectbox("Select Tool to Test", tool_names)
    
    selected_tool = next(t for t in st.session_state.tools if t["function"]["name"] == selected_tool_name)
    
    st.subheader(f"Tool: {selected_tool_name}")
    st.info(selected_tool["function"]["description"])
    
    # Dynamic Form for Arguments
    st.write("### Arguments")
    args_schema = selected_tool["function"]["parameters"]
    
    # Simple JSON editor for args
    default_args = {}
    if "properties" in args_schema:
        for prop, details in args_schema["properties"].items():
            default_args[prop] = ""
            
    args_input = st.text_area("JSON Arguments", value=json.dumps(default_args, indent=2))
    
    if st.button("Run Tool"):
        with st.spinner(f"Executing {selected_tool_name}..."):
            try:
                parsed_args = json.loads(args_input)
                # Call the remote tool via the manager
                result = asyncio.run(mcp_manager.call_tool(selected_tool_name, parsed_args))
                
                st.subheader("Result")
                if isinstance(result, (dict, list)):
                    st.json(result)
                else:
                    st.code(result)
            except json.JSONDecodeError:
                st.error("Invalid JSON in arguments.")
            except Exception as e:
                st.error(f"Execution Error: {e}")

else:
    st.warning("Click 'Connect' above to see tools available on your laptop.")
