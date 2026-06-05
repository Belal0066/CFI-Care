import streamlit as st
import json
import sys
import os
import subprocess
import logging

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from src.ui.utils_ui import render_header
from src.shared.db_clients import qdrant_client

# Try to import IngestionService, handle errors gracefully
try:
    from src.ingestion.service import IngestionService
    INGESTION_AVAILABLE = True
except ImportError as e:
    INGESTION_AVAILABLE = False
    IMPORT_ERROR = str(e)

st.set_page_config(page_title="Data Ingestion", page_icon="")

render_header()
st.subheader(" Data Ingestion")

tab1, tab2, tab4, tab3 = st.tabs([" File Upload", " Test Data Seeding", " Remote Redis Sync", "️ Danger Zone"])

with tab1:
    st.markdown("Upload FHIR JSON bundles or lists of resources to ingest into the system.")
    
    if not INGESTION_AVAILABLE:
        st.error(f"Ingestion Service could not be loaded. Error: {IMPORT_ERROR}")
    else:
        uploaded_file = st.file_uploader("Choose a FHIR JSON file", type="json")
        
        if uploaded_file is not None:
            if st.button("Process File"):
                try:
                    data = json.load(uploaded_file)
                    
                    # Check if this is our clinical timeline format (with "nodes" and "eocId")
                    if isinstance(data, dict) and "nodes" in data and "eocId" in data:
                        st.info("📋 Detected Clinical Timeline Format")
                        st.info("💡 **Tip:** This format is best used in the **Clinical Reasoning** tab (Page 4)")
                        st.markdown("---")
                        
                        # Show preview
                        st.markdown("**Preview:**")
                        st.json({
                            "eocId": data["eocId"],
                            "nodes": len(data["nodes"]),
                            "date_range": f"{data['nodes'][0].get('dateIssued', 'N/A')} to {data['nodes'][-1].get('dateIssued', 'N/A')}"
                        })
                        
                        st.warning("⚠️ This tab is for FHIR Bundle ingestion. For clinical timeline analysis, please use **Page 4: Clinical Reasoning**")
                        
                        if st.button("🚀 Go to Clinical Reasoning", type="primary", key="go_to_reasoning"):
                            st.info("Please navigate to **Clinical Reasoning** (Page 4) in the sidebar and upload this file there.")
                    else:
                        # Original FHIR processing logic
                        resources = []
                        if isinstance(data, dict):
                            if data.get("resourceType") == "Bundle" and "entry" in data:
                                resources = [e["resource"] for e in data["entry"] if "resource" in e]
                            else:
                                resources = [data] # Single resource
                        elif isinstance(data, list):
                            resources = data
                        
                        if not resources:
                            st.warning("No resources found to ingest.")
                        else:
                            progress_bar = st.progress(0)
                            status_text = st.empty()
                            success_count = 0
                            
                            for i, res in enumerate(resources):
                                status_text.text(f"Processing {i+1}/{len(resources)}: {res.get('resourceType', 'Unknown')}/{res.get('id', 'Unknown')}")
                                try:
                                    if IngestionService.ingest_resource(res):
                                        success_count += 1
                                except Exception as e:
                                    st.error(f"Failed to ingest resource {i}: {e}")
                                
                                progress_bar.progress((i + 1) / len(resources))
                                
                            st.success(f"Ingestion Complete! Successfully processed {success_count}/{len(resources)} resources.")
                        
                except Exception as e:
                    st.error(f"Error parsing file: {e}")

with tab2:
    st.markdown("Quickly populate the database with synthetic clinical records for testing.")
    
    if st.button(" Seed Sample Data"):
        with st.spinner("Running seed script..."):
            try:
                # Run the script as a subprocess to ensure environment isolation
                script_path = os.path.join(PROJECT_ROOT, "scripts", "seed_sample_data.py")
                result = subprocess.run(
                    ["python3", script_path], 
                    capture_output=True, 
                    text=True, 
                    cwd=PROJECT_ROOT
                )
                
                if result.returncode == 0:
                    st.success("Seeding completed successfully!")
                    with st.expander("View Output"):
                        st.code(result.stdout)
                else:
                    st.error("Seeding failed.")
                    st.error(result.stderr)
                    with st.expander("View Output"):
                        st.code(result.stdout)
            except Exception as e:
                st.error(f"Failed to run script: {e}")

with tab4:
    st.markdown("### 🔄 Sync from Remote Redis")
    st.write("Trigger the API backend to pull data from the configured Redis instance and index it into the Vector Database.")
    
    col_sync, col_seed = st.columns(2)
    
    with col_sync:
        st.markdown("**1. Import to Local System**")
        sync_url = "http://localhost:8001/ingest"
        
        if st.button("🚀 Start Redis Sync"):
            with st.spinner("Requesting sync from backend..."):
                try:
                    import requests
                    response = requests.post(sync_url, timeout=30)
                    
                    if response.status_code == 200:
                        result = response.json()
                        st.success(f"Sync Successful! Processed {result.get('processed_count', 0)} clinical resources.")
                        if result.get("errors"):
                            with st.expander("Show Errors"):
                                for err in result["errors"]:
                                    st.error(err)
                    else:
                        st.error(f"Sync failed with status code {response.status_code}")
                        st.json(response.json())
                except Exception as e:
                    st.error(f"Connection error: Could not reach backend at {sync_url}. Is the FastAPI server running?")

    with col_seed:
        st.markdown("**2. Seed Remote Cloud Redis**")
        st.write("If the remote Redis is empty, use this to push sample patient data into the cloud instance.")
        
        if st.button("🛰️ Push Sample to Cloud"):
            with st.spinner("Connecting to Cloud Redis..."):
                try:
                    import redis
                    # Use the same credentials as the backend
                    REDIS_HOST = os.getenv("REDIS_HOST", "redis-19534.c275.us-east-1-4.ec2.cloud.redislabs.com") 
                    REDIS_PORT = int(os.getenv("REDIS_PORT", 19534))
                    REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "yIFQU6QWucdTKlfNsy9hbVKDNBkXSdbl")
                    
                    r = redis.Redis(
                        host=REDIS_HOST, 
                        port=REDIS_PORT, 
                        password=REDIS_PASSWORD,
                        username="default",
                        decode_responses=True
                    )
                    
                    # Sample Patient Bundle
                    sample_patient = {
                        "resourceType": "Patient",
                        "id": f"cloud-patient-{os.getpid()}",
                        "name": [{"family": "Cloud", "given": ["Test", "User"]}],
                        "gender": "male",
                        "birthDate": "1980-01-01"
                    }
                    
                    r.set(f"fhir:patient:{sample_patient['id']}", json.dumps(sample_patient))
                    st.success("✅ Successfully pushed 1 Patient record to Cloud Redis!")
                except Exception as e:
                    st.error(f"Failed to seed cloud Redis: {e}")

with tab3:
    st.markdown("### ️ Dangerous Operations")
    st.warning("These actions are irreversible. Proceed with caution.")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("**Clear Vector Database**")
        st.write("Deletes all storage in Qdrant. IDs and Embeddings will be lost.")
        
        if st.button("️ Delete All Qdrant Data", type="primary"):
            try:
                # Connect ensures client is initialized
                client = qdrant_client.connect()
                collection_name = qdrant_client.collection_name
                
                with st.spinner(f"Deleting collection '{collection_name}'..."):
                    # Delete the collection
                    client.delete_collection(collection_name)
                    
                    # Re-initialize it (empty)
                    qdrant_client._ensure_collection()
                    
                st.success(f" Application state reset: Collection '{collection_name}' cleared and recreated.")
                
            except Exception as e:
                st.error(f"Failed to clear Qdrant: {e}")

    with col2:
        st.write("*(More destructive actions can be added here)*")

