"""
Clinical Assistant - Integrated RAG Pipeline (Tickets 4-10)
Streamlit interface for the complete clinical reasoning system
"""
import streamlit as st
import sys
import json
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

# Import complete pipeline
from src.ingestion.preprocessor import ClinicalPreprocessor
from src.ingestion.patient_state import PatientStateCompiler
from src.retrieval.indexing import DocumentBuilder
from src.retrieval.query_understanding import IntentClassifier, QueryRewriter, QueryContext, QueryIntent
from src.retrieval.context_retrieval import ContextRetriever, RetrievalContext
from src.agent.clinical_reasoning import ClinicalReasoner, ClinicalResponse

# Import shared UI components
sys.path.append(str(project_root / "src" / "ui"))
from utils_ui import render_header

# Page config
st.set_page_config(
    page_title="Clinical Reasoning Assistant",
    page_icon="🏥",
    layout="wide"
)

# Initialize session state
if 'patient_data' not in st.session_state:
    st.session_state.patient_data = None
if 'normalized_nodes' not in st.session_state:
    st.session_state.normalized_nodes = None
if 'patient_state' not in st.session_state:
    st.session_state.patient_state = None
if 'documents' not in st.session_state:
    st.session_state.documents = None
if 'chat_history' not in st.session_state:
    st.session_state.chat_history = []

# Header
render_header()
st.title("🏥 Clinical Reasoning Assistant")
st.markdown("**Deterministic, Citation-Backed Clinical Analysis**")

# Sidebar - Configuration & Patient Data
with st.sidebar:
    st.header("⚙️ Configuration")
    
    # Data loading section
    st.subheader("📂 Patient Data")
    
    # Option 1: Load from default file
    if st.button("📁 Load Default Data", use_container_width=True):
        try:
            data_path = project_root / "Data" / "data.json"
            with open(data_path, 'r') as f:
                raw_data = json.load(f)
            
            # Preprocess
            with st.spinner("Processing patient data..."):
                preprocessor = ClinicalPreprocessor()
                result = preprocessor.preprocess_timeline(raw_data)
                
                st.session_state.normalized_nodes = result['timeline']
                st.session_state.eoc_id = result['eoc_id']
                
                # Compile patient state
                compiler = PatientStateCompiler()
                st.session_state.patient_state = compiler.compile_state(
                    st.session_state.normalized_nodes,
                    st.session_state.eoc_id
                )
                
                # Build document collection
                doc_builder = DocumentBuilder()
                st.session_state.documents = doc_builder.build_document_collection(
                    st.session_state.normalized_nodes
                )
                
                st.success(f"✅ Loaded {len(st.session_state.normalized_nodes)} events")
                st.rerun()
        
        except Exception as e:
            st.error(f"Error loading data: {str(e)}")
    
    # Option 2: Upload custom file
    uploaded_file = st.file_uploader(
        "Or upload custom FHIR JSON",
        type=['json'],
        help="Upload a patient timeline JSON file"
    )
    
    if uploaded_file is not None:
        try:
            raw_data = json.load(uploaded_file)
            
            with st.spinner("Processing uploaded data..."):
                preprocessor = ClinicalPreprocessor()
                result = preprocessor.preprocess_timeline(raw_data)
                
                st.session_state.normalized_nodes = result['timeline']
                st.session_state.eoc_id = result['eoc_id']
                
                compiler = PatientStateCompiler()
                st.session_state.patient_state = compiler.compile_state(
                    st.session_state.normalized_nodes,
                    st.session_state.eoc_id
                )
                
                doc_builder = DocumentBuilder()
                st.session_state.documents = doc_builder.build_document_collection(
                    st.session_state.normalized_nodes
                )
                
                st.success(f"✅ Loaded {len(st.session_state.normalized_nodes)} events")
        
        except Exception as e:
            st.error(f"Error processing upload: {str(e)}")
    
    # Display patient state if loaded
    if st.session_state.patient_state is not None:
        st.markdown("---")
        st.subheader("👤 Patient State")
        
        ps = st.session_state.patient_state
        
        st.markdown(f"**EOC ID:** `{ps.eoc_id[:16]}...`")
        st.markdown(f"**Total Encounters:** {ps.total_encounters}")
        st.markdown(f"**Date Range:** {ps.first_encounter_date[:10]} → {ps.last_encounter_date[:10]}")
        
        if ps.active_diagnosis:
            st.markdown("**🔴 Active Diagnoses:**")
            for dx in ps.active_diagnosis:
                st.markdown(f"  • {dx}")
        
        if ps.allergies:
            st.markdown("**⚠️ Allergies:**")
            for allergy in ps.allergies:
                st.markdown(f"  • {allergy}")
        
        if ps.recent_medications:
            st.markdown("**💊 Recent Medications:**")
            for med in ps.recent_medications:
                st.markdown(f"  • {med}")
        
        st.markdown(f"**Clinical Status:** {ps.clinical_status}")
    
    st.markdown("---")
    
    # Clear history
    if st.button("🗑️ Clear Chat History", use_container_width=True):
        st.session_state.chat_history = []
        st.rerun()

# Main area - Tabs
tab1, tab2, tab3 = st.tabs(["💬 Clinical Chat", "📊 Patient Timeline", "🔍 Query Analysis"])

# Tab 1: Clinical Chat
with tab1:
    st.header("Clinical Question & Answer")
    
    if st.session_state.patient_state is None:
        st.warning("⚠️ Please load patient data from the sidebar to begin.")
    else:
        # Quick query buttons
        st.markdown("**Quick Questions:**")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            if st.button("What diagnoses were considered?", use_container_width=True):
                st.session_state.current_query = "What diagnoses were considered?"
        
        with col2:
            if st.button("What medications were prescribed?", use_container_width=True):
                st.session_state.current_query = "What medications were prescribed?"
        
        with col3:
            if st.button("What was the final outcome?", use_container_width=True):
                st.session_state.current_query = "What was the final outcome?"
        
        # Query input
        query = st.text_input(
            "Ask a clinical question:",
            value=st.session_state.get('current_query', ''),
            placeholder="e.g., Why was Mycoplasma Pneumonia diagnosed over Bronchitis?"
        )
        
        col1, col2 = st.columns([1, 5])
        with col1:
            submit = st.button("🔍 Analyze", type="primary", use_container_width=True)
        
        if submit and query:
            try:
                with st.spinner("Analyzing clinical data..."):
                    # Step 1: Query Understanding
                    intent_classifier = IntentClassifier()
                    query_rewriter = QueryRewriter()
                    
                    intent, confidence = intent_classifier.classify(query)
                    
                    query_context = QueryContext(
                        original_query=query,
                        intent=intent,
                        confidence=confidence,
                        rewritten_query=query
                    )
                    
                    rewritten = query_rewriter.rewrite_for_intent(
                        query,
                        query_context,
                        st.session_state.patient_state
                    )
                    query_context.rewritten_query = rewritten
                    
                    # Step 2: Context Retrieval
                    retriever = ContextRetriever(
                        st.session_state.documents,
                        st.session_state.patient_state
                    )
                    retrieved_docs = retriever.retrieve(query_context)
                    
                    # Wrap in RetrievalContext
                    retrieval_context = RetrievalContext(
                        query_context=query_context,
                        retrieved_documents=retrieved_docs,
                        patient_state=st.session_state.patient_state
                    )
                    
                    # Step 3: Clinical Reasoning
                    reasoner = ClinicalReasoner(retrieval_context)
                    response = reasoner.reason()
                    
                    # Add to chat history
                    st.session_state.chat_history.append({
                        'query': query,
                        'intent': intent.value,
                        'confidence': confidence,
                        'response': response,
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    st.rerun()
            
            except Exception as e:
                st.error(f"Error processing query: {str(e)}")
                import traceback
                st.code(traceback.format_exc())
        
        # Display chat history
        if st.session_state.chat_history:
            st.markdown("---")
            st.subheader("📜 Conversation History")
            
            for i, entry in enumerate(reversed(st.session_state.chat_history)):
                with st.expander(
                    f"**Q{len(st.session_state.chat_history)-i}:** {entry['query'][:80]}... | Intent: {entry['intent']}",
                    expanded=(i == 0)
                ):
                    resp: ClinicalResponse = entry['response']
                    
                    # Metadata
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric("Intent", entry['intent'].replace('_', ' ').title())
                    with col2:
                        st.metric("Confidence", f"{entry['confidence']:.0%}")
                    with col3:
                        st.metric("Citations", len(resp.claims))
                    
                    # Response
                    st.markdown("**Clinical Analysis:**")
                    st.markdown(resp.explanation)
                    
                    # Temporal context
                    if resp.temporal_summary:
                        with st.expander("📅 Timeline View"):
                            st.code(resp.temporal_summary)
                    
                    # Citations
                    if resp.claims:
                        with st.expander(f"Citations ({len(resp.claims)} claims)"):
                            for j, claim in enumerate(resp.claims, 1):
                                st.markdown(f"**{j}. {claim.claim}**")
                                st.caption(f"📍 {claim.temporal_context}")
                                st.caption(f"🔗 Sources: {', '.join(claim.source_node_ids)}")
                                st.markdown("")
                    
                    # Safety flags
                    if resp.has_insufficient_data or resp.contains_speculation:
                        st.warning("⚠️ Safety Flags:")
                        if resp.has_insufficient_data:
                            st.markdown("- Insufficient data for complete analysis")
                        if resp.contains_speculation:
                            st.markdown("- Response contains speculative reasoning")

# Tab 2: Patient Timeline
with tab2:
    st.header("Patient Timeline Visualization")
    
    if st.session_state.normalized_nodes is None:
        st.warning("⚠️ Please load patient data from the sidebar.")
    else:
        nodes = st.session_state.normalized_nodes
        
        # Statistics
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Events", len(nodes))
        with col2:
            diagnosis_count = sum(1 for n in nodes if n.is_diagnosis)
            st.metric("Diagnoses", diagnosis_count)
        with col3:
            med_count = sum(1 for n in nodes if n.event_tag == "Medication")
            st.metric("Medications", med_count)
        with col4:
            symptom_count = sum(1 for n in nodes if n.event_tag == "Symptom")
            st.metric("Symptoms", symptom_count)
        
        st.markdown("---")
        
        # Timeline display
        st.subheader("Chronological Timeline")
        
        for node in sorted(nodes, key=lambda n: n.date_issued):
            with st.container():
                col1, col2 = st.columns([1, 5])
                
                with col1:
                    st.markdown(f"**{node.date_issued.date()}**")
                    st.caption(node.event_tag)
                
                with col2:
                    # Icon based on event type
                    icon = {
                        'Diagnosis': '🔴',
                        'Symptom': '💭',
                        'Medication': '💊',
                        'Allergy/Adverse': '⚠️',
                        'Investigation': '🔬',
                        'FollowUp/Outcome': '✅'
                    }.get(node.event_tag, '📝')
                    
                    st.markdown(f"{icon} **{node.text_primary}**")
                    if node.details:
                        st.caption(node.details)
                    
                    # Diagnosis details
                    if node.is_diagnosis:
                        badge_color = {
                            'Final': '🟢',
                            'Provisional': '🟡',
                            'Differential': '🟠',
                            'None': '⚪'
                        }.get(node.diagnosis_type, '⚪')
                        st.caption(f"{badge_color} {node.diagnosis_type}")
                
                st.markdown("---")

# Tab 3: Query Analysis
with tab3:
    st.header("Query Understanding Analysis")
    
    if st.session_state.patient_state is None:
        st.warning("⚠️ Please load patient data from the sidebar.")
    else:
        st.markdown("Test how the system classifies and processes different query types.")
        
        # Sample queries
        sample_queries = [
            "What diagnoses were considered?",
            "Why was Mycoplasma Pneumonia diagnosed?",
            "What medications were prescribed?",
            "Are there any allergies?",
            "How did symptoms change over time?",
            "What was the final outcome?",
            "Show me the timeline of events",
            "Explain the rationale for the diagnosis"
        ]
        
        st.markdown("**Sample Queries:**")
        selected_query = st.selectbox("Select a query to analyze:", sample_queries)
        
        if st.button("🔍 Analyze Query", use_container_width=False):
            try:
                # Classify
                intent_classifier = IntentClassifier()
                intent, confidence = intent_classifier.classify(selected_query)
                
                query_context = QueryContext(
                    original_query=selected_query,
                    intent=intent,
                    confidence=confidence,
                    rewritten_query=selected_query
                )
                
                # Rewrite
                query_rewriter = QueryRewriter()
                rewritten = query_rewriter.rewrite_for_intent(
                    selected_query,
                    query_context,
                    st.session_state.patient_state
                )
                
                # Retrieve
                retriever = ContextRetriever(
                    st.session_state.documents,
                    st.session_state.patient_state
                )
                retrieval_context = retriever.retrieve(query_context)
                
                # Display results
                col1, col2 = st.columns(2)
                
                with col1:
                    st.subheader("Query Understanding")
                    st.metric("Intent", intent.value.replace('_', ' ').title())
                    st.metric("Confidence", f"{confidence:.0%}")
                    
                    if rewritten != selected_query:
                        st.markdown("**Rewritten Query:**")
                        st.info(rewritten)
                
                with col2:
                    st.subheader("Context Retrieval")
                    st.metric("Documents Retrieved", len(retrieval_context.retrieved_documents))
                    st.metric("Date Range", f"{retrieval_context.date_range[0][:10]} → {retrieval_context.date_range[1][:10]}")
                    
                    st.markdown("**Event Distribution:**")
                    for event_type, count in retrieval_context.event_counts.items():
                        st.markdown(f"- {event_type}: {count}")
                
                # Show retrieved documents
                st.markdown("---")
                st.subheader("Retrieved Documents")
                
                for doc in retrieval_context.retrieved_documents:
                    with st.expander(f"{doc.date_issued[:10]} | {doc.event_tag} | {doc.content_primary[:60]}..."):
                        st.markdown(f"**Primary:** {doc.content_primary}")
                        if doc.content_secondary:
                            st.markdown(f"**Secondary:** {doc.content_secondary}")
                        st.caption(f"Node ID: `{doc.node_id}`")
                        st.caption(f"Diagnosis: {doc.is_diagnosis} | Medication: {doc.is_medication} | Allergy: {doc.is_allergy}")
            
            except Exception as e:
                st.error(f"Error: {str(e)}")

# Footer
st.markdown("---")
st.caption("🏥 Clinical Reasoning Assistant | Tickets 4-10 Integrated Pipeline")
st.caption("Deterministic • Citation-Backed • No Hallucinations")
