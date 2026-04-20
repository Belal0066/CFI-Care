import os
import time
import requests
import json
import base64
import streamlit as st
import pandas as pd

GATEWAY_URL = os.environ.get("DOC2FHIR_GATEWAY_URL", "http://127.0.0.1:8001")
OCR_API_URL = os.environ.get("DOC2FHIR_OCR_API_URL", "http://127.0.0.1:7862")
MAPPER_URL = os.environ.get("DOC2FHIR_MAPPER_URL", "http://127.0.0.1:8080")

st.set_page_config(
    page_title="DOC2FHIR Pipeline",
    page_icon="🏥",
    layout="wide",
)

st.title("DOC2FHIR Pipeline")
st.markdown("Upload medical documents to digitize and map them to FHIR resources. Inspect each pipeline stage as it runs.")

# --- Service Health ---
st.subheader("Service Connections")
col1, col2, col3 = st.columns(3)

def ping_service(url, label, endpoint="/v1/health"):
    try:
        r = requests.get(f"{url.rstrip('/')}{endpoint}", timeout=2)
        if r.status_code == 200:
            return f"Online"
        return f"HTTP {r.status_code}"
    except Exception:
        return f"Offline"

with col1:
    st.metric("Gateway API", ping_service(GATEWAY_URL, "Gateway", "/v1/health"))
with col2:
    st.metric("OCR Service", ping_service(OCR_API_URL, "OCR", "/status"))
with col3:
    st.metric("Mapper Service", ping_service(MAPPER_URL, "Mapper", "/v1/models"))

st.divider()

# --- Upload ---
st.subheader("New Document Job")

col_left, col_right = st.columns([2, 1])
with col_left:
    uploaded_file = st.file_uploader("Select a PDF or Image", type=["pdf", "png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"])
with col_right:
    metadata_json = st.text_area("Metadata (JSON)", value='{"patient_id": "P123"}', height=80)

if st.button("Start Pipeline", type="primary", use_container_width=True):
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

    st.success(f"Job Created: `{job_id}`")
    st.divider()

    # --- Polling ---
    progress_bar = st.progress(0, text="Queued...")
    status_text = st.empty()

    is_terminal = False
    last_state = ""

    while not is_terminal:
        time.sleep(2)
        try:
            poll_res = requests.get(f"{GATEWAY_URL}/v1/document/result/{job_id}")
            poll_res.raise_for_status()
            data = poll_res.json()

            job = data.get("job", {})
            state = job.get("state", "unknown")
            detail = job.get("detail", "")
            progress = job.get("progress", 0)
            events = data.get("events", [])

            if state in ("COMPLETED", "FAILED", "SERVER_BUSY"):
                is_terminal = True

            if state != last_state:
                last_state = state

            progress_bar.progress(progress / 100.0, text=f"{state}: {detail}")

        except Exception as e:
            st.error(f"Polling failed: {e}")
            break

    # --- Show Results ---
    final_res = requests.get(f"{GATEWAY_URL}/v1/document/result/{job_id}").json()
    job = final_res["job"]
    events = final_res.get("events", [])
    ocr_output = final_res.get("ocr_output")
    fhir_bundle = final_res.get("fhir_bundle")
    fhir_validation = final_res.get("fhir_validation", {})
    stage_metrics = final_res.get("stage_metrics", {})

    st.divider()

    # Pipeline stages visual
    st.subheader("Pipeline Stages")

    stages = [
        {"key": "upload", "label": "Upload", "icon": "📄", "done": True},
        {"key": "ocr", "label": "OCR", "icon": "🔍", "done": any(e["state"] in ("OCR_PROCESSING",) for e in events)},
        {"key": "mapping", "label": "Mapping", "icon": "🧠", "done": any(e["state"] in ("MAPPING",) for e in events)},
        {"key": "delivery", "label": "Delivery", "icon": "📤", "done": job["state"] == "COMPLETED"},
    ]

    cols = st.columns(len(stages))
    for i, stage in enumerate(stages):
        with cols[i]:
            if stage["done"]:
                st.success(f"{stage['icon']} {stage['label']}")
            elif i > 0 and not stages[i - 1]["done"]:
                st.info(f"{stage['icon']} {stage['label']}")
            else:
                st.warning(f"{stage['icon']} {stage['label']}")
            if i < len(stages) - 1:
                if stage["done"]:
                    st.markdown("→", unsafe_allow_html=True)

    # Stage outputs
    st.divider()
    st.subheader("Stage Outputs")

    tab_ocr, tab_fhir, tab_events, tab_metrics = st.tabs([
        "OCR Output",
        "FHIR Bundle",
        "Event Timeline",
        "Metrics",
    ])

    with tab_ocr:
        if ocr_output:
            extracted_text = ocr_output.get("extracted_text", "")
            processing_time = ocr_output.get("processing_time_sec", 0)
            layouts = ocr_output.get("layouts", [])

            st.metric("OCR Processing Time", f"{processing_time:.1f}s")
            st.metric("Text Length", f"{len(extracted_text)} characters")

            ocr_tab_text, ocr_tab_raw, ocr_tab_layouts = st.tabs(["Extracted Text", "Raw OCR JSON", "Layouts"])

            with ocr_tab_text:
                st.text_area("Extracted Text", value=extracted_text, height=400, disabled=True)

            with ocr_tab_raw:
                st.json(ocr_output)

            with ocr_tab_layouts:
                if layouts:
                    for idx, layout in enumerate(layouts):
                        with st.expander(f"Layout {idx + 1}"):
                            st.json(layout)
                else:
                    st.info("No layout data available")
        else:
            st.info("OCR output not yet available")

    with tab_fhir:
        if fhir_bundle:
            val = fhir_validation or {}
            is_valid = val.get("valid", False)
            errors = val.get("errors", [])
            resource_count = val.get("resource_count", 0)

            col_v1, col_v2, col_v3 = st.columns(3)
            col_v1.metric("FHIR Valid", "Yes" if is_valid else "No")
            col_v2.metric("Resources", resource_count)
            col_v3.metric("Validation Issues", len([e for e in errors if "FAIL" in str(e)]))

            if errors:
                with st.expander("Validation Details", expanded=not is_valid):
                    for err in errors:
                        if "FAIL" in str(err):
                            st.error(err)
                        else:
                            st.success(err)

            fhir_tab_view, fhir_tab_raw = st.tabs(["Formatted", "Raw JSON"])
            with fhir_tab_view:
                if isinstance(fhir_bundle, dict) and "entry" in fhir_bundle:
                    resources = []
                    for entry in fhir_bundle.get("entry", []):
                        res = entry.get("resource", {})
                        resources.append({
                            "Type": res.get("resourceType", "unknown"),
                            "ID": res.get("id", ""),
                        })
                    if resources:
                        st.dataframe(pd.DataFrame(resources), use_container_width=True)
                else:
                    st.json(fhir_bundle)
            with fhir_tab_raw:
                st.json(fhir_bundle)

            st.divider()
            st.subheader("Actions")

            col_dl, col_push = st.columns(2)
            with col_dl:
                json_str = json.dumps(fhir_bundle, indent=2)
                st.download_button(
                    label="Download FHIR Bundle",
                    data=json_str,
                    file_name=f"{job_id}_fhir.json",
                    mime="application/json",
                    use_container_width=True,
                )

            with col_push:
                if job["state"] != "COMPLETED":
                    if st.button("Push to HAPI FHIR", type="primary", use_container_width=True):
                        with st.spinner("Pushing to HAPI FHIR..."):
                            try:
                                push_res = requests.post(
                                    f"{GATEWAY_URL}/v1/document/{job_id}/push-to-hapi",
                                    timeout=120,
                                )
                                push_data = push_res.json()
                                if push_data.get("success"):
                                    st.success("Successfully delivered to HAPI FHIR!")
                                    st.metric("Status", f"HTTP {push_data['status_code']}")
                                    st.metric("Delivery Time", f"{push_data['delivery_time_sec']:.1f}s")
                                    created = push_data.get("created_resources", [])
                                    if created:
                                        st.markdown("**Created Resources:**")
                                        for loc in created:
                                            st.code(loc)
                                    st.json(push_data.get("response_body", {}))
                                else:
                                    st.error(f"Push failed: {push_data.get('error', 'Unknown error')}")
                                    st.json(push_data)
                            except Exception as e:
                                st.error(f"Failed to push: {e}")
        else:
            st.info("FHIR bundle not yet available (mapping stage not reached or failed)")

    with tab_events:
        if events:
            for e in events:
                state = e.get("state", "")
                detail = e.get("detail", "")
                ts = e.get("created_at", "")
                payload = e.get("payload", {})

                icon = "✅" if "completed" in detail.lower() or state == "COMPLETED" else "⏳"
                if "fail" in detail.lower() or state == "FAILED":
                    icon = "❌"

                with st.expander(f"{icon} {state} — {detail}", expanded=state in ("FAILED",)):
                    st.caption(ts)
                    if payload:
                        st.json(payload)
        else:
            st.info("No events recorded")

    with tab_metrics:
        if stage_metrics:
            st.json(stage_metrics)
        else:
            st.info("No metrics available")

    # Final state
    st.divider()
    if job["state"] == "COMPLETED":
        st.success("Pipeline completed successfully")
    else:
        st.warning(f"Pipeline ended in state: {job['state']}")
        if job.get("error_message"):
            st.error(f"Error: {job['error_message']}")
        if job.get("error_code"):
            st.code(f"Error code: {job['error_code']}")
        if fhir_bundle and job["state"] == "FAILED":
            st.info("FHIR bundle was generated but delivery failed. Use the 'Push to HAPI FHIR' button above to test delivery manually.")
