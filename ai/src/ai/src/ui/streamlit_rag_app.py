"""
Streamlit Interface for MedGemma RAG Testing
Interactive web UI for testing the RAG pipeline.
"""
import os
import streamlit as st
import sys
from pathlib import Path
import requests
import json

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src.retrieval.medgemma_rag import medgemma_rag
from src.shared.db_clients import qdrant_client

# Icon path
ICON_PATH = project_root / "src" / "icon" / "icon.png"

# Page config
st.set_page_config(
    page_title="MedGemma RAG",
    page_icon=str(ICON_PATH) if ICON_PATH.exists() else "",
    layout="wide"
)

# Title
st.title("MedGemma RAG\nPowered by BWS")
st.markdown("---")

# Sidebar - Configuration
with st.sidebar:
    st.header("️ Configuration")
    
    # Check service status
    st.subheader("Service Status")
    
    # Qdrant
    try:
        q_client = qdrant_client.connect()
        collections = q_client.get_collections()
        st.success(f" Qdrant Connected")
        st.caption(f"{len(collections.collections)} collections")
    except Exception as e:
        st.error(f" Qdrant: {str(e)[:50]}")
    
    # LLM Backend
    llm_backend = os.getenv("LLM_BACKEND", "local")
    if llm_backend == "lightning":
        lightning_url = os.getenv("LIGHTNING_BASE_URL", "").rstrip("/")
        health_url = f"{lightning_url}/../health" if lightning_url else ""
        try:
            response = requests.get(health_url, timeout=5) if health_url else None
            if response and response.status_code == 200:
                st.success(" Lightning AI 27B Running")
            else:
                st.warning(f"️ Lightning AI: HTTP {(response.status_code if response else 'N/A')}")
        except:
            st.error(" Lightning AI Not Reachable")
    else:
        try:
            response = requests.get("http://localhost:8000/health", timeout=2)
            if response.status_code == 200:
                st.success(" Llama Server (4B) Running")
            else:
                st.warning(f"️ Llama Server: HTTP {response.status_code}")
        except:
            st.error(" Llama Server Not Running")
    
    st.markdown("---")
    
    # Mode Selection
    st.subheader(" Retrieval Mode")
    
    mode = st.radio(
        "Select Mode:",
        ["Local RAG", "Internet MCP"],
        index=0,
        help="Local RAG: Use Qdrant vector DB\nInternet MCP: Use PubMed/OpenFDA"
    )
    
    retrieval_mode = "rag" if mode == "Local RAG" else "mcp"
    
    if retrieval_mode == "rag":
        st.info(" **Local Mode**: Retrieves from your Qdrant database")
    else:
        st.info(" **Internet Mode**: Queries PubMed, OpenFDA, and NIH sources")
    
    st.markdown("---")
    
    # Settings based on mode
    if retrieval_mode == "rag":
        st.subheader("RAG Settings")
        top_k = st.slider("Top-K Contexts", 1, 10, 5)
        medgemma_rag.top_k = top_k
        patient_filter = st.text_input("Patient ID Filter (optional)", "")
    else:
        st.subheader("MCP Settings")
        st.caption("Internet retrieval automatically classifies queries and fetches from authoritative sources")
        top_k = 5  # Default for backend compatibility
        patient_filter = ""
    
    temperature = st.slider("Temperature", 0.0, 1.0, 0.7, 0.1)
    
    use_custom_prompt = st.checkbox("Use Custom System Prompt")
    custom_prompt = ""
    if use_custom_prompt:
        # Load default from file as starting point
        default_prompt = medgemma_rag.get_default_system_prompt()
        custom_prompt = st.text_area(
            "System Prompt",
            default_prompt,
            height=300
        )
    else:
        # Still use the file-based prompt even if not "custom"
        custom_prompt = medgemma_rag.get_default_system_prompt()
    
    st.markdown("---")
    st.caption(f"**Active Mode**: {' Internet MCP' if retrieval_mode == 'mcp' else ' Local RAG'}")

# Main area - Two tabs
tab1, tab2, tab3 = st.tabs([" Chat", " Retrieval Test", " Data Browser"])

# Tab 1: Chat Interface
with tab1:
    st.header("Chat with MedGemma")
    
    # Initialize session state for attachment
    if "attached_image" not in st.session_state:
        st.session_state.attached_image = None
    if "show_attachment_dialog" not in st.session_state:
        st.session_state.show_attachment_dialog = False
    
    # Attachment section with toggle
    col1, col2 = st.columns([4, 1])
    with col1:
        if st.button(" Attach Image", use_container_width=False):
            st.session_state.show_attachment_dialog = not st.session_state.show_attachment_dialog
    
    with col2:
        if st.session_state.attached_image is not None:
            if st.button("️ Clear", use_container_width=False):
                st.session_state.attached_image = None
                st.session_state.show_attachment_dialog = False
                st.rerun()
    
    # Show attachment dialog
    if st.session_state.show_attachment_dialog:
        with st.expander(" Attach Medical Image", expanded=True):
            st.markdown("**Option 1: Upload File**")
            uploaded_file = st.file_uploader(
                "Choose image file",
                type=["jpg", "jpeg", "png", "bmp"],
                key="file_uploader",
                label_visibility="collapsed"
            )
            
            if uploaded_file is not None:
                st.session_state.attached_image = uploaded_file
                st.session_state.show_attachment_dialog = False
                st.rerun()
            
            st.markdown("---")
            st.markdown("**Option 2: Paste from Clipboard**")
            
            # Try to use paste button if available
            try:
                from streamlit_paste_button import paste_image_button as pbutton
                
                paste_result = pbutton(
                    label=" Paste Image",
                    background_color="#1f77b4",
                    hover_background_color="#0d3a5c",
                    text_color="#FFFFFF",
                    errors='ignore',
                    key="paste_button"
                )
                
                if paste_result.image_data is not None:
                    st.session_state.attached_image = paste_result.image_data
                    st.session_state.show_attachment_dialog = False
                    st.rerun()
            except ImportError:
                st.info(" Copy-paste feature requires: `pip install streamlit-paste-button`")
                st.markdown("*Use file upload instead or install the package.*")
    
    # Show attached image preview
    if st.session_state.attached_image is not None:
        st.info(" Image attached (Vision mode - RAG disabled)")
        col1, col2 = st.columns([1, 3])
        with col1:
            if hasattr(st.session_state.attached_image, 'read'):
                st.image(st.session_state.attached_image, width=100)
            else:
                st.image(st.session_state.attached_image, width=100)
    
    # Display active mode
    if retrieval_mode == "mcp":
        st.info(" **Active**: Internet MCP Mode - Queries PubMed, OpenFDA, NIH")
    else:
        st.info(" **Active**: Local RAG Mode - Queries Qdrant Vector DB")
    
    st.markdown("---")
    
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []
    
    # Display chat history
    for message_index, message in enumerate(st.session_state.messages):
        if message["role"] == "assistant":
            avatar = ICON_PATH if Path(ICON_PATH).exists() else ""
        else:
            avatar = "" # Use neutral person icon instead of the red one
            
        with st.chat_message(message["role"], avatar=avatar):
            # Display image if present
            if "image" in message and message["image"]:
                st.image(message["image"], width=200)
            
            # Show thinking if available (for assistant messages)
            if message["role"] == "assistant" and message.get("thinking"):
                with st.expander(" Reasoning Process", expanded=False, icon=":material/psychology:"):
                    st.markdown(message["thinking"])
            
            st.markdown(message["content"])
            if "contexts" in message:
                # Determine if contexts are from RAG or MCP based on structure
                is_mcp = message.get("mode") == "mcp" or (message["contexts"] and "source" in message["contexts"][0])
                context_label = "internet sources" if is_mcp else "contexts"
                
                with st.expander(f" {len(message['contexts'])} {context_label} used"):
                    for i, ctx in enumerate(message["contexts"], 1):
                        if is_mcp:
                            # MCP context structure - show Groq's retrieved data
                            source = ctx.get('source', 'Unknown')
                            url = ctx.get('url', '')
                            pmid = ctx.get('pmid', '')
                            
                            # Display source with link if available
                            if url:
                                display_text = f"{source} (PMID: {pmid})" if pmid else source
                                st.markdown(f"**[{i}]** Source: [{display_text}]({url})")
                            else:
                                st.markdown(f"**[{i}]** Source: {source}")
                            
                            if 'content' in ctx and ctx['content']:
                                st.text_area(
                                    f"Retrieved content {i}",
                                    ctx['content'],
                                    height=100,
                                    key=f"mcp_ctx_{message.get('query_id', 'msg'+str(message_index))}_{i}",
                                    label_visibility="collapsed"
                                )
                            elif 'summary' in ctx:
                                st.text(ctx['summary'][:300] + "...")
                        else:
                            # RAG context structure
                            st.markdown(f"**[{i}]** Score: {ctx.get('score', 0):.3f} | Patient: {ctx.get('patient_id', 'N/A')}")
                            st.text(ctx.get("content", "")[:300] + "...")
    
    # Chat input
    prompt = st.chat_input("Ask MedGemma a clinical question" + (" " if st.session_state.attached_image else ""))
    
    if prompt:
        # Convert image to base64 if attached
        import base64
        from io import BytesIO
        from PIL import Image
        
        image_data = None
        image_for_display = None
        
        if st.session_state.attached_image is not None:
            # Disable RAG when image is attached
            use_rag_for_this = False
            
            # Handle different image sources
            if hasattr(st.session_state.attached_image, 'read'):
                # File upload
                image_bytes = st.session_state.attached_image.getvalue()
                image_for_display = st.session_state.attached_image
            elif isinstance(st.session_state.attached_image, Image.Image):
                # Pasted image
                buffer = BytesIO()
                st.session_state.attached_image.save(buffer, format="PNG")
                image_bytes = buffer.getvalue()
                image_for_display = st.session_state.attached_image
            else:
                # Already bytes
                image_bytes = st.session_state.attached_image
                image_for_display = Image.open(BytesIO(image_bytes))
            
            image_data = base64.b64encode(image_bytes).decode('utf-8')
        else:
            use_rag_for_this = retrieval_mode == "rag"
        
        # Add user message
        user_msg = {"role": "user", "content": prompt}
        if st.session_state.attached_image is not None:
            user_msg["image"] = image_for_display
        
        st.session_state.messages.append(user_msg)
        
        with st.chat_message("user", avatar=""):
            if st.session_state.attached_image is not None:
                st.image(image_for_display, width=200)
            st.markdown(prompt)
        
        # Generate response
        avatar = ICON_PATH if Path(ICON_PATH).exists() else None
        with st.chat_message("assistant", avatar=avatar):
            placeholder = st.empty()
            full_response = ""
            retrieved_contexts = []
            
            try:
                # 1. Call the FastAPI Backend Chat Endpoint with Streaming
                # Adjust URL if running on a different port/host
                backend_url = "http://localhost:8001/chat"
                
                # Prepare clean history for API
                history_for_api = []
                for msg in st.session_state.messages:
                    history_for_api.append({
                        "role": msg["role"],
                        "content": str(msg["content"])  # Ensure string
                    })

                payload = {
                    "query": prompt,
                    "history": history_for_api,
                    "mode": "rag" if use_rag_for_this else "mcp",
                    "top_k": top_k if use_rag_for_this else 5,
                    "temperature": temperature
                }
                
                # Show mode indicator
                if payload["mode"] == "mcp":
                    st.info(" Using Internet MCP: Querying PubMed, OpenFDA...")
                else:
                    st.info(f" Using Local RAG: Searching Qdrant (Top-{payload['top_k']})...")
                
                with requests.post(backend_url, json=payload, stream=True) as response:
                    response.raise_for_status()
                    
                    for line in response.iter_lines():
                        if not line:
                            continue
                        
                        line_str = line.decode("utf-8")
                        if line_str.startswith("data: "):
                            data_content = line_str[6:]
                            
                            if data_content == "[DONE]":
                                break
                            
                            try:
                                chunk = json.loads(data_content)
                                if chunk["type"] == "token":
                                    full_response += chunk["content"]
                                    placeholder.markdown(full_response + "▌")
                                elif chunk["type"] == "context":
                                    retrieved_contexts = chunk["content"]
                                elif chunk["type"] == "error":
                                    st.error(f"Backend Error: {chunk['content']}")
                            except json.JSONDecodeError:
                                continue

                placeholder.markdown(full_response)
                
                # Show contexts if available
                if retrieved_contexts:
                    context_label = "internet sources" if payload["mode"] == "mcp" else "contexts"
                    with st.expander(f" {len(retrieved_contexts)} {context_label} used"):
                        for i, ctx in enumerate(retrieved_contexts, 1):
                            if payload["mode"] == "mcp":
                                # MCP context structure - show Groq's retrieved data
                                source = ctx.get('source', 'Unknown')
                                url = ctx.get('url', '')
                                pmid = ctx.get('pmid', '')
                                
                                # Display source with link if available
                                if url:
                                    st.markdown(f"**[{i}]** Source: [{source} (PMID: {pmid})]({url})")
                                else:
                                    st.markdown(f"**[{i}]** Source: {source}")
                                
                                if 'content' in ctx and ctx['content']:
                                    st.text_area(
                                        f"Retrieved content {i}",
                                        ctx['content'],
                                        height=100,
                                        key=f"live_mcp_ctx_{i}",
                                        label_visibility="collapsed"
                                    )
                            else:
                                # RAG context structure
                                st.markdown(f"**[{i}]** Score: {ctx['score']:.3f} | Patient: {ctx['patient_id']}")
                                st.text(ctx["content"][:300] + "...")
                            st.markdown("---")
                
                # Add to history
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": full_response,
                    "contexts": retrieved_contexts,
                    "mode": payload["mode"]
                })
                
            except Exception as e:
                st.error(f"Connection Error: {e}")
                st.info("Make sure the FastAPI backend is running: `python -m uvicorn src.api.FastAPI_Backend:app --port 8000`")

        
        # Clear attached image after processing
        if st.session_state.attached_image is not None:
            st.session_state.attached_image = None

# Tab 2: Retrieval Test
with tab2:
    st.header("Test Retrieval Only")
    st.markdown("Test vector search without generation")
    
    col1, col2 = st.columns([3, 1])
    
    with col1:
        search_query = st.text_input("Search Query", "diabetes symptoms")
    
    with col2:
        search_top_k = st.number_input("Top-K", 1, 20, 5)
    
    search_patient = st.text_input("Patient ID (optional)", "")
    
    if st.button(" Search"):
        with st.spinner("Searching..."):
            try:
                medgemma_rag.top_k = search_top_k
                contexts = medgemma_rag.retrieve_context(
                    query=search_query,
                    patient_id=search_patient if search_patient else None
                )
                
                st.success(f"Found {len(contexts)} results")
                
                for i, ctx in enumerate(contexts, 1):
                    with st.container():
                        col1, col2, col3 = st.columns([1, 2, 1])
                        with col1:
                            st.metric("Rank", i)
                            st.metric("Score", f"{ctx['score']:.4f}")
                        with col2:
                            st.markdown(f"**ID:** `{ctx['id']}`")
                            st.markdown(f"**Patient:** {ctx['patient_id']}")
                            st.markdown(f"**Type:** {ctx['resource_type']}")
                        with col3:
                            if st.button(" View Full", key=f"view_{i}"):
                                st.session_state[f"show_{i}"] = not st.session_state.get(f"show_{i}", False)
                        
                        st.text_area("Content", ctx["content"], height=150, key=f"content_{i}")
                        
                        if st.session_state.get(f"show_{i}", False):
                            st.json(ctx)
                        
                        st.markdown("---")
                
            except Exception as e:
                st.error(f"Search failed: {e}")

# Tab 3: Data Browser
with tab3:
    st.header("Qdrant Data Browser")
    
    try:
        q_client = qdrant_client.connect()
        collection_name = qdrant_client.collection_name
        
        # Collection info
        col_info = q_client.get_collection(collection_name)
        
        # Handle Hybrid/Named Vectors
        vectors_config = col_info.config.params.vectors
        if hasattr(vectors_config, "size"):
            # Legacy/Single Vector
            vec_size = vectors_config.size
            vec_dist = vectors_config.distance.value
        else:
            # Named Vectors (Dict-like)
            # Try to get "text-dense" or just the first one
            # Note: properties might be accessed slightly differently depending on client version,
            # but usually it's a dict or Pydantic model behaving like dict
            if "text-dense" in vectors_config:
                v_param = vectors_config["text-dense"]
            else:
                 # Get first key
                first_key = list(vectors_config.keys())[0]
                v_param = vectors_config[first_key]
            
            vec_size = f"{v_param.size} (Hybrid)"
            vec_dist = v_param.distance.value
        
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Points", col_info.points_count)
        with col2:
            st.metric("Vector Size", vec_size)
        with col3:
            st.metric("Distance", vec_dist)
        
        st.markdown("---")
        
        # Sample data
        st.subheader("Sample Data")
        
        sample_size = st.slider("Sample Size", 1, 50, 10)
        
        if st.button(" Load Sample"):
            with st.spinner("Loading..."):
                # Scroll through points
                scroll_result = q_client.scroll(
                    collection_name=collection_name,
                    limit=sample_size,
                    with_payload=True,
                    with_vectors=False
                )
                
                points = scroll_result[0]
                
                if points:
                    for i, point in enumerate(points, 1):
                        with st.expander(f"Point {i}: {point.id}"):
                            st.json({
                                "id": str(point.id),
                                "payload": point.payload
                            })
                else:
                    st.warning("No data in collection")
        
        st.markdown("---")
        
        # Search by ID
        st.subheader("Retrieve by ID")
        point_id = st.text_input("Point ID")
        if st.button("Get Point") and point_id:
            try:
                point = q_client.retrieve(
                    collection_name=collection_name,
                    ids=[point_id],
                    with_payload=True,
                    with_vectors=False
                )
                if point:
                    st.json({
                        "id": str(point[0].id),
                        "payload": point[0].payload
                    })
                else:
                    st.warning("Point not found")
            except Exception as e:
                st.error(f"Error: {e}")
        
    except Exception as e:
        st.error(f"Failed to connect to Qdrant: {e}")
        st.info("Make sure Qdrant is running: `docker-compose up -d qdrant`")

# Footer
st.markdown("---")
st.caption("All rights reserved to CFI-Care Team")
