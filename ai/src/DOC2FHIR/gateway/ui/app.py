import os
import time
import requests
import json
import base64
import streamlit as st
import pandas as pd

# URLs
GATEWAY_URL = os.environ.get("DOC2FHIR_GATEWAY_URL", "http://127.0.0.1:8001")
OCR_API_URL = os.environ.get("DOC2FHIR_OCR_API_URL", "http://127.0.0.1:7862")
MAPPER_URL = os.environ.get("DOC2FHIR_MAPPER_URL", "http://127.0.0.1:8080")

st.set_page_config(
    page_title="DOC2FHIR Pipeline",
    page_icon="🏥",
    layout="wide",
)

st.title("🏥 DOC2FHIR End-to-End Pipeline")
st.markdown("Upload medical documents to automatically digitize and map them to FHIR resources using GPU-accelerated Local Models.")

# --- 1. Service Health (Direct connections) ---
st.subheader("📡 Service Connections")
col1, col2, col3 = st.columns(3)

def ping_service(url, label, endpoint="/v1/health"):
    try:
        r = requests.get(f"{url.rstrip('/')}{endpoint}", timeout=2)
        if r.status_code == 200:
            return f"🟢 {label}: Online"
        return f"🟡 {label}: {r.status_code}"
    except Exception:
        return f"🔴 {label}: Offline or Unreachable"

with col1:
    st.info(ping_service(GATEWAY_URL, "Gateway API", "/v1/health"))
with col2:
    st.info(ping_service(OCR_API_URL, "OCR Service", "/status"))
with col3:
    st.info(ping_service(MAPPER_URL, "Mapper Service", "/v1/models"))

st.divider()

# --- 2. Upload and Process ---
st.subheader("📄 New Document Job")

upload_method = st.radio("Ingestion Method", ["File Upload", "Simulate SQS Message"])
uploaded_file = st.file_uploader("Select a PDF or Image", type=["pdf", "png", "jpg", "jpeg"])

metadata_json = st.text_area("Optional Metadata (JSON)", value='{"patient_id": "P123", "org": "clinic"}')
if st.button("🚀 Start Pipeline", type="primary", use_container_width=True):
    if not uploaded_file:
        st.warning("Please upload a file first.")
        st.stop()
        
    try:
        metadata = json.loads(metadata_json)
    except json.JSONDecodeError:
        st.error("Invalid JSON metadata!")
        st.stop()

    job_id = None
    with st.spinner("Submitting to Gateway..."):
        if upload_method == "File Upload":
            files = {"file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
            data = {"metadata": json.dumps(metadata)}
            try:
                res = requests.post(f"{GATEWAY_URL}/v1/document/upload", files=files, data=data)
                res.raise_for_status()
                job_id = res.json()["job_id"]
            except Exception as e:
                st.error(f"Upload failed: {e}")
                if hasattr(e, "response") and getattr(e, "response") is not None:
                    st.json(e.response.json())
                st.stop()
        else:
            pdf_b64 = base64.b64encode(uploaded_file.getvalue()).decode("utf-8")
            payload = {
                "message_id": f"msg_{int(time.time())}",
                "filename": uploaded_file.name,
                "pdf_base64": pdf_b64,
                "metadata": metadata
            }
            try:
                res = requests.post(f"{GATEWAY_URL}/v1/document/sqs/ingest", json=payload)
                res.raise_for_status()
                job_id = res.json()["job_id"]
            except Exception as e:
                st.error(f"SQS Ingest failed: {e}")
                if hasattr(e, "response") and getattr(e, "response") is not None:
                    st.json(e.response.json())
                st.stop()

    # --- 3. Progress Tracking ---
    st.success(f"Job Created: `{job_id}`")
    
    progress_container = st.empty()
    status_text = st.empty()
    tracker = st.empty()

    is_terminal = False
    
    while not is_terminal:
        time.sleep(2)
        try:
            poll_res = requests.get(f"{GATEWAY_URL}/v1/document/result/{job_id}")
            poll_res.raise_for_status()
            data = poll_res.json()
            
            job = data.get("job", {})
            state = job.get("state", "unknown").lower()
            detail = job.get("detail", "")
            events = data.get("events", [])
            
            
            if state in ["completed", "failed", "server_busy", "downstream_error", "timeout"]:
                is_terminal = True

            with tracker.container():
                st.subheader(f"Status: {state.upper()}")
                st.write(detail)

            # Auto advance progress bar based on state
            prog_val = 0.05
            if state == "queued": prog_val = 0.1
            if "ocr" in state: prog_val = 0.3
            if "mapper" in state: prog_val = 0.6
            if "downstream" in state: prog_val = 0.9
            if is_terminal: prog_val = 1.0

            progress_container.progress(prog_val, text=f"Stage: {state.upper()}...")
            
            # Simple timeline display
            with status_text.container():
                st.markdown("**Timeline:**")
                for e in events:
                    st.text(f"[{e.get('created_at', '...')}] {e.get('state')} - {e.get('detail')}")
            
        except Exception as e:
            st.error(f"Polling failed: {e}")
            break

    # Once terminal
    if is_terminal:
        st.divider()
        final_res = requests.get(f"{GATEWAY_URL}/v1/document/result/{job_id}").json()
        job = final_res["job"]
        final_state = job["state"].lower()
        if final_state == "completed":
            st.success("✅ Workflow Completed Successfully!")
            
            tab1, tab2, tab3 = st.tabs(["🏥 FHIR Output", "✅ Validation", "📊 Metrics"])
            with tab1:
                st.json(final_res.get("fhir_bundle", {}))
            with tab2:
                st.json(final_res.get("fhir_validation", {}))
            with tab3:
                st.json(final_res.get("stage_metrics", {}))
        else:
            st.error(f"❌ Workflow Error: {final_state}")
            st.warning(f"Reason: {job.get('error_message')}")
            st.json(final_res.get("stage_metrics", {}))
