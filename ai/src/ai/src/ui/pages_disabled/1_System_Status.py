import streamlit as st
import pandas as pd
import time
import sys
import os

# Add parent directory to path to allow importing utils_ui
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils_ui import get_system_status, render_header

st.set_page_config(page_title="System Status", page_icon="")

render_header()

st.subheader("📊 Service Health Monitor")

if st.button("Refresh Status"):
    st.rerun()

from src.shared.db_clients import qdrant_client
st.sidebar.markdown(f"**Qdrant Collection:** `{qdrant_client.collection_name}`")

status_df = get_system_status()

# Display as metrics
cols = st.columns(3)
for idx, row in status_df.iterrows():
    col = cols[idx % 3]
    with col:
        st.metric(
            label=row["Service"], 
            value=row["Status"], 
            delta="Running" if row["is_up"] else "Down",
            delta_color="normal" if row["is_up"] else "inverse"
        )

st.dataframe(status_df[["Service", "Address", "Status"]], use_container_width=True)
