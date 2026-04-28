"""
Unified Clinical Assistant - Data + RAG + LLM + MCP
Integrates deterministic reasoning (Tickets 4-10) with LLM enhancement
"""
import os
import streamlit as st
import sys
from pathlib import Path
import requests
import json

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.retrieval.medgemma_rag import medgemma_rag
from src.shared.db_clients import qdrant_client

# Import deterministic reasoning pipeline (Tickets 4-10)
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder
from src.retrieval.query_understanding import IntentClassifier, QueryRewriter, QueryContext, QueryIntent
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner, ClinicalResponse

# Import shared UI components
sys.path.append(str(project_root / "src" / "ui"))
from utils_ui import render_header

# Icon path
ICON_PATH = project_root / "src" / "icon" / "icon.png"

# Page config
st.set_page_config(
    page_title="Clinical Assistant",
    page_icon=str(ICON_PATH) if ICON_PATH.exists() else "",
    layout="wide"
)

# Title
render_header()
st.subheader("Interactive Clinical Agent - Unified RAG + LLM + MCP")

# Initialize session state for patient data
if 'patient_data_loaded' not in st.session_state:
    st.session_state.patient_data_loaded = False
if 'normalized_nodes' not in st.session_state:
    st.session_state.normalized_nodes = None
if 'patient_state' not in st.session_state:
    st.session_state.patient_state = None
if 'rag_documents' not in st.session_state:
    st.session_state.rag_documents = None

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
    
    # Patient Data Loading Section
    st.subheader("📁 Patient Data")
    
    col1, col2 = st.columns(2)
    with col1:
        if st.button("📁 Load Default", use_container_width=True):
            try:
                data_file = project_root / "Data" / "data.json"
                with open(data_file) as f:
                    data = json.load(f)
                
                with st.spinner("Processing patient data..."):
                    # Run preprocessing pipeline (Tickets 4-6)
                    preprocessor = ClinicalPreprocessor()
                    result = preprocessor.preprocess_timeline(data)
                    nodes = result['timeline']
                    
                    # Compile patient state
                    patient_state = PatientStateCompiler.compile_state(nodes, result['eoc_id'])
                    
                    # Build documents for RAG
                    documents = DocumentBuilder.build_document_collection(nodes)
                    
                    # Store in session state
                    st.session_state.normalized_nodes = nodes
                    st.session_state.patient_state = patient_state
                    st.session_state.rag_documents = documents
                    st.session_state.patient_data_loaded = True
                
                st.success(f"✅ Loaded {len(nodes)} encounters")
                st.rerun()
            except Exception as e:
                st.error(f"Failed to load data: {e}")
    
    with col2:
        uploaded_file = st.file_uploader("Upload JSON", type=['json'], label_visibility="collapsed")
        if uploaded_file is not None:
            try:
                data = json.load(uploaded_file)
                with st.spinner("Processing..."):
                    preprocessor = ClinicalPreprocessor()
                    result = preprocessor.preprocess_timeline(data)
                    nodes = result['timeline']
                    patient_state = PatientStateCompiler.compile_state(nodes, result['eoc_id'])
                    documents = DocumentBuilder.build_document_collection(nodes)
                    
                    st.session_state.normalized_nodes = nodes
                    st.session_state.patient_state = patient_state
                    st.session_state.rag_documents = documents
                    st.session_state.patient_data_loaded = True
                
                st.success(f"✅ Loaded {len(nodes)} encounters")
                st.rerun()
            except Exception as e:
                st.error(f"Upload failed: {e}")
    
    # Show patient state if loaded
    if st.session_state.patient_data_loaded:
        ps = st.session_state.patient_state
        
        with st.expander("📊 Patient State", expanded=False):
            st.caption(f"**EOC**: {ps.eoc_id[:20]}...")
            if ps.first_encounter_date and ps.last_encounter_date:
                st.caption(f"**Timeline**: {ps.first_encounter_date[:10]} to {ps.last_encounter_date[:10]} ({ps.total_encounters} encounters)")
            
            if ps.active_diagnosis:
                st.markdown("**Active Diagnoses:**")
                for diag in ps.active_diagnosis:
                    st.markdown(f"  • {diag}")
            
            if ps.allergies:
                st.markdown("**Allergies:**")
                for allergy in ps.allergies:
                    st.markdown(f"  ⚠️ {allergy}")
            
            if ps.recent_medications:
                st.markdown("**Recent Medications:**")
                for med in ps.recent_medications:
                    st.markdown(f"  • {med}")
            
            st.caption(f"**Clinical Status**: {ps.clinical_status}")
    else:
        st.info("ℹ️ Load patient data to enable deterministic reasoning")
    
    st.markdown("---")
    
    # Reasoning Mode Selection
    st.subheader("🧠 Reasoning Mode")
    
    # 1. High Level Architecture Selection
    architecture_mode = st.radio(
        "Select Architecture:",
        ["Agentic RAG", "Deterministic Reasoning (Legacy)"],
        index=0,
        help="Agentic: AI Graph with Mode Switching. Deterministic: Strict Rule-Based RAG (No LLM)."
    )
    
    use_agentic = (architecture_mode == "Agentic RAG")
    use_deterministic = (architecture_mode == "Deterministic Reasoning (Legacy)")

    # 2. Agentic Sub-Modes (The 4 Options)
    agent_mode = "auto" # Default
    if use_agentic:
        st.subheader("⚙️ Agent Strategy")
        
        mode_selection = st.radio(
            "Operation Mode:",
            ["Auto-Pilot", "Local RAG (Patient Data)", "Internet MCP (External)", "Chat Only (MedGemma)"],
            index=0,
            help="Control how the agent sources information."
        )
        
        # Map selection to internal mode string
        mode_map = {
            "Auto-Pilot": "auto",
            "Local RAG (Patient Data)": "local",
            "Internet MCP (External)": "mcp",
            "Chat Only (MedGemma)": "chat"
        }
        agent_mode = mode_map[mode_selection]
        
        # Visual cues for the selected mode
        if agent_mode == "auto":
            st.info("🤖 **Auto**: Dynamically switches between Local RAG and MCP based on query intent.")
        elif agent_mode == "local":
            st.warning("🏠 **Local**: Forces retrieval from Patient Record only. Ignores Internet.")
        elif agent_mode == "mcp":
            st.warning("🌐 **MCP**: Forces Internet Search (PubMed/FDA). Ignores Patient Record.")
        elif agent_mode == "chat":
            st.success("💬 **Chat**: Disables RAG. General conversation only.")

    if use_deterministic:
        st.success("🔒 **Deterministic**: Strict rules, exact citations. No LLM Hallucination.")
    
    st.markdown("---")
    
    # Settings based on mode
    if use_agentic and agent_mode == "mcp":
        st.subheader("MCP Settings")
        st.caption("Internet retrieval automatically classifies queries and fetches from authoritative sources")
        top_k = 5
        patient_filter = ""
    elif use_agentic and agent_mode == "chat":
        st.subheader("Chat Settings")
        top_k = 0 # Irrelevant
        patient_filter = ""
    else:
        # Local RAG or Auto or Deterministic
        st.subheader("RAG Settings")
        top_k = st.slider("Top-K Contexts", 1, 10, 5)
        medgemma_rag.top_k = top_k
        patient_filter = st.text_input("Patient ID Filter (optional)", "")
    
    temperature = st.slider("Temperature", 0.0, 1.0, 0.7 if agent_mode == 'chat' else 0.1, 0.1)
    
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
    st.caption(f"**Active Mode**: {agent_mode.upper() if use_agentic else 'DETERMINISTIC'}")

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
    if use_agentic:
        if agent_mode == "mcp":
             st.info(" **Active**: Internet MCP Mode - Queries PubMed, OpenFDA, NIH")
        elif agent_mode == "local":
             st.info(" **Active**: Local RAG Mode - Queries Qdrant Vector DB")
        elif agent_mode == "chat":
             st.info(" **Active**: Chat Only - No Retrieval")
        else:
             st.info(" **Active**: Auto-Pilot - Intelligent Routing")
    else:
        st.success(" **Active**: Deterministic Reasoning (Legacy Mode)")
    
    st.markdown("---")
    
    # Chat controls row
    ctrl_col1, ctrl_col2, ctrl_col3 = st.columns([2, 1, 1])
    with ctrl_col1:
        st.markdown("### 💬 Conversation")
    with ctrl_col2:
        if st.button("🗑️ Clear Chat", use_container_width=True, help="Clear conversation history"):
            st.session_state.messages = []
            st.rerun()
    with ctrl_col3:
        if st.button("🔄 Reset Agent", use_container_width=True, help="Reset agent state completely"):
            st.session_state.messages = []
            # Clear any cached agent state
            if 'agent_state' in st.session_state:
                del st.session_state.agent_state
            st.success("Agent reset complete")
            st.rerun()
    
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []
    
    # Display chat history
    for message_index, message in enumerate(st.session_state.messages):
        if message["role"] == "assistant":
            avatar = ICON_PATH if Path(ICON_PATH).exists() else None
        else:
            avatar = None # Fixed: "" causes StreamlitAPIException
            
        with st.chat_message(message["role"], avatar=avatar):
            # Display image if present
            if "image" in message and message["image"]:
                st.image(message["image"], width=200)
            
            # Show mode badge for assistant
            if message["role"] == "assistant":
                mode_badges = []
                if message.get("mode") == "deterministic":
                    mode_badges.append(f"🔒 Deterministic")
                    if "intent" in message:
                        mode_badges.append(f"Intent: {message['intent']}")
                    if "confidence" in message:
                        mode_badges.append(f"Confidence: {message['confidence']:.2f}")
                elif message.get("mode") == "mcp":
                    mode_badges.append("🌐 Internet MCP")
                else:
                    mode_badges.append("🤖 Local RAG")
                
                if mode_badges:
                    st.caption(" | ".join(mode_badges))
            
            # Show thinking if available (for assistant messages)
            if message["role"] == "assistant" and message.get("thinking"):
                with st.expander(" Reasoning Process", expanded=False, icon=":material/psychology:"):
                    st.markdown(message["thinking"])
            
            st.markdown(message["content"])
            
            # Feedback UI for RLHF data collection
            if message["role"] == "assistant":
                feedback_key = f"feedback_{message_index}"
                if feedback_key not in st.session_state:
                    st.session_state[feedback_key] = {"rating": None, "comment": ""}
                
                col1, col2, col3, col4 = st.columns([1, 1, 3, 1])
                with col1:
                    if st.button("👍", key=f"like_{message_index}", use_container_width=True):
                        st.session_state[feedback_key]["rating"] = "positive"
                        st.toast("Feedback saved: 👍 Helpful", icon="✅")
                with col2:
                    if st.button("👎", key=f"dislike_{message_index}", use_container_width=True):
                        st.session_state[feedback_key]["rating"] = "negative"
                        st.toast("Feedback saved: 👎 Not helpful", icon="📝")
                
                # Show feedback status
                if st.session_state[feedback_key]["rating"]:
                    with col4:
                        st.caption(f"{'👍' if st.session_state[feedback_key]['rating'] == 'positive' else '👎'} Rated")
                
                # Optional comment box (shown after rating or on expansion)
                if st.session_state[feedback_key]["rating"] or st.session_state.get(f"show_comment_{message_index}", False):
                    with st.expander("💬 Add comment (optional for RLHF)", expanded=st.session_state[feedback_key]["rating"] is not None):
                        comment = st.text_area(
                            "What could be improved?",
                            value=st.session_state[feedback_key]["comment"],
                            height=80,
                            key=f"comment_{message_index}",
                            placeholder="E.g., Missing key information, incorrect citation, hallucination detected..."
                        )
                        if st.button("Save Comment", key=f"save_comment_{message_index}"):
                            st.session_state[feedback_key]["comment"] = comment
                            
                            # Save feedback to JSON file for later RLHF training
                            feedback_data = {
                                "message_index": message_index,
                                "query": st.session_state.messages[message_index - 1]["content"] if message_index > 0 else "",
                                "response": message["content"],
                                "mode": message.get("mode", "unknown"),
                                "rating": st.session_state[feedback_key]["rating"],
                                "comment": comment,
                                "timestamp": str(Path(__file__).parent.parent.parent.parent / "Data" / "feedback.jsonl"),
                                "contexts": message.get("contexts", [])
                            }
                            
                            # Append to feedback file
                            feedback_file = Path(__file__).parent.parent.parent.parent / "Data" / "feedback.jsonl"
                            with open(feedback_file, "a") as f:
                                f.write(json.dumps(feedback_data) + "\n")
                            
                            st.success("💾 Feedback saved for RLHF training")
                else:
                    if st.button("💬 Add comment", key=f"show_comment_btn_{message_index}"):
                        st.session_state[f"show_comment_{message_index}"] = True
                        st.rerun()
            
            # Show citations (deterministic mode only)
            if "citations" in message and message["citations"]:
                with st.expander(f"{len(message['citations'])} Citations", expanded=False):
                    for i, cit in enumerate(message['citations'], 1):
                        st.markdown(f"**[{i}]** {cit['claim']}")
                        st.caption(f"🔗 Sources: {', '.join(cit['sources'][:3])}")
                        if cit.get('temporal'):
                            st.caption(f"📅 {cit['temporal']}")
                        st.markdown("---")
            
            # Show contexts
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
            use_rag_for_this = (agent_mode == "local" or agent_mode == "auto") if use_agentic else True
        
        # Add user message
        user_msg = {"role": "user", "content": prompt}
        if st.session_state.attached_image is not None:
            user_msg["image"] = image_for_display
        
        st.session_state.messages.append(user_msg)
        
        with st.chat_message("user"):
            if st.session_state.attached_image is not None:
                st.image(image_for_display, width=200)
            st.markdown(prompt)
        
        # Generate response
        avatar = ICON_PATH if Path(ICON_PATH).exists() else None
        with st.chat_message("assistant", avatar=avatar):
            placeholder = st.empty()
            full_response = ""
            retrieved_contexts = []
            citations = []
            
            try:
                # MODE 0: Agentic Graph (New)
                if use_agentic:
                    with st.spinner("🤖 Agent is thinking (Graph Execution)..."):
                        # Force reload modules to pick up changes during dev
                        import importlib
                        import src.agent.graph.state
                        import src.agent.graph.nodes
                        import src.agent.graph.workflow
                        importlib.reload(src.agent.graph.state)
                        importlib.reload(src.agent.graph.nodes)
                        importlib.reload(src.agent.graph.workflow)
                        
                        from src.agent.graph.workflow import app
                        from langchain_core.messages import HumanMessage
                        
                        # Convert PatientState to dict if needed
                        p_state = None
                        docs_list = []
                        if st.session_state.patient_state:
                           p_state = st.session_state.patient_state.dict()
                        if hasattr(st.session_state, 'rag_documents') and st.session_state.rag_documents:
                           docs_list = st.session_state.rag_documents
                        
                        # Check if we have patient data loaded
                        if not p_state or not docs_list:
                            st.warning("⚠️ No patient data loaded. Agentic RAG requires patient context. Loading will use MCP fallback.")
                        
                        # Build full message history for context-aware query optimization
                        from langchain_core.messages import AIMessage
                        message_history = []
                        for msg in st.session_state.messages:
                            if msg["role"] == "user":
                                message_history.append(HumanMessage(content=msg["content"]))
                            else:
                                message_history.append(AIMessage(content=msg["content"]))
                        # Add current prompt
                        message_history.append(HumanMessage(content=prompt))
                        
                        state_input = {
                            "messages": message_history,  # Full chat history for context
                            "patient_state": p_state,
                            "documents": docs_list,
                            "patient_id": st.session_state.patient_state.eoc_id if st.session_state.patient_state else None,
                            "intent": "",
                            "rewritten_query": None,
                            "retrieved_docs": [],
                            "internet_evidence": [],
                            "clinical_response": None,
                            "needs_drug_check": False,
                            "needs_guidelines": False,
                            "is_mcp_query": (agent_mode == "mcp"),
                            "mode": agent_mode
                        }
                        
                        path_desc = "Classify → Retrieve → Reason → Generate"
                        if agent_mode == "chat":
                            path_desc = "Classify → Generate (No Retrieval)"
                        elif agent_mode == "mcp":
                            path_desc = "Classify → MCP Search → Generate"
                        elif agent_mode == "local":
                            path_desc = "Classify → Local RAG → Reason → Generate"
                            
                        st.caption(f"🔄 Running LangGraph workflow ({agent_mode.upper()}): {path_desc}")
                        
                        result = app.invoke(state_input)
                        
                        # Get final response
                        if result.get("messages"):
                            full_response = result["messages"][-1].content
                        else:
                            full_response = "No response generated."
                        
                        placeholder.markdown(full_response)
                        
                        # Show debug info in expander
                        with st.expander("🔍 Agent Execution Details", expanded=False):
                            st.write(f"**Intent Detected:** {result.get('intent', 'N/A')}")
                            st.write(f"**Retrieved Docs:** {len(result.get('retrieved_docs', []))}")
                            if result.get('clinical_response'):
                                st.write(f"**Reasoning Generated:** Yes")
                            mcp_ev = result.get('internet_evidence', [])
                            if mcp_ev:
                                st.write(f"**MCP Evidence:** {len(mcp_ev)} items")
                                for ev in mcp_ev:
                                    if isinstance(ev, dict):
                                        # Show query optimization
                                        if 'optimized_query' in ev:
                                            st.info(f"🔄 **Query Optimized:** `{ev.get('original_query', 'N/A')}` → `{ev.get('optimized_query', 'N/A')}`")
                                        # Full MCP response structure
                                        if 'raw_data' in ev:
                                            st.write(f"  - Classification: {ev.get('classification', 'N/A')}")
                                            st.write(f"  - Entities: {ev.get('entities', [])}")
                                            st.write(f"  - Sources: {len(ev.get('raw_data', []))} PubMed articles")
                                        elif 'error' in ev:
                                            st.error(f"MCP Error: {ev['error']}")
                        
                        # Add to history
                        st.session_state.messages.append({"role": "assistant", "content": full_response})

                # MODE 1: Deterministic Reasoning (Tickets 4-10)
                # Only runs when deterministic is enabled AND not using MCP mode
                elif use_deterministic and st.session_state.patient_data_loaded and not st.session_state.attached_image:
                    with st.spinner("🔒 Running deterministic reasoning..."):
                        # Step 1: Query Understanding (Ticket 7)
                        classifier = IntentClassifier()
                        intent, confidence = classifier.classify(prompt)
                        
                        query_context = QueryContext(
                            original_query=prompt,
                            intent=intent,
                            confidence=confidence,
                            query_normalized=prompt.lower(),
                            rewritten_query=prompt
                        )
                        
                        # Show intent
                        st.caption(f"🎯 Intent: {intent.value} | Confidence: {confidence:.2f}")
                        
                        # Step 2: Context Retrieval (Ticket 8)
                        retriever = ContextRetriever(
                            st.session_state.rag_documents,
                            st.session_state.patient_state
                        )
                        retrieved_docs = retriever.retrieve(query_context, max_docs=top_k)
                        
                        # Wrap in RetrievalContext
                        retrieval_context = RetrievalContext(
                            query_context=query_context,
                            retrieved_documents=retrieved_docs,
                            patient_state=st.session_state.patient_state
                        )
                        
                        # Step 3: Clinical Reasoning (Ticket 9)
                        reasoner = ClinicalReasoner(retrieval_context)
                        response = reasoner.reason()
                        
                        # Extract citations first
                        citations = [
                            {
                                'claim': claim.claim,
                                'sources': claim.source_node_ids,
                                'temporal': claim.temporal_context
                            }
                            for claim in response.claims
                        ]
                        
                        # Display deterministic response directly (no LLM enhancement)
                        full_response = response.explanation
                        
                        # Ensure strict citations
                        if not response.claims:
                           full_response += "\n\n(No specific claims cited)"
                        
                        placeholder.markdown(full_response)
                        
                        # Show citations
                        if citations:
                            with st.expander(f"{len(citations)} Citations", expanded=False):
                                for i, cit in enumerate(citations, 1):
                                    st.markdown(f"**[{i}]** {cit['claim']}")
                                    st.caption(f"🔗 Sources: {', '.join(cit['sources'][:3])}")
                                    if cit.get('temporal'):
                                        st.caption(f"📅 {cit['temporal']}")
                                    st.markdown("---")
                        
                        # Show retrieved contexts
                        if retrieved_docs:
                            with st.expander(f"🔍 {len(retrieved_docs)} Retrieved Contexts"):
                                for i, doc in enumerate(retrieved_docs, 1):
                                    st.markdown(f"**[{i}]** {doc.event_tag} - {doc.date_issued[:10]}")
                                    st.text_area(
                                        f"Context {i}",
                                        doc.content_primary + "\n" + (doc.content_details if doc.content_details else ""),
                                        height=100,
                                        key=f"det_ctx_{len(st.session_state.messages)}_{i}",
                                        label_visibility="collapsed"
                                    )
                                    st.markdown("---")
                        
                        # Store in history
                        st.session_state.messages.append({
                            "role": "assistant",
                            "content": full_response,
                            "mode": "deterministic",
                            "intent": intent.value,
                            "confidence": confidence,
                            "citations": citations,
                            "contexts": [
                                {
                                    'content': doc.content_primary,
                                    'date': doc.date_issued[:10],
                                    'tag': doc.event_tag,
                                    'score': 1.0
                                }
                                for doc in retrieved_docs
                            ]
                        })

            except Exception as e:
                st.error(f"Error: {str(e)}")
                import traceback
                st.code(traceback.format_exc())
        
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
