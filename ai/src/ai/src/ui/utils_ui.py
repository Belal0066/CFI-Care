import os
import requests
import socket
import streamlit as st
import pandas as pd

# LLM Backend — check env var set by launch.sh or fall back to config
LLM_BACKEND = os.getenv("LLM_BACKEND", "local")
LIGHTNING_BASE_URL = os.getenv("LIGHTNING_BASE_URL", "").rstrip("/")

# Service Configuration
SERVICES = [
    {"name": "API Backend", "host": "localhost", "port": 8001, "type": "api", "url": "http://localhost:8001/doc_count"},
    {"name": "Qdrant (Vector DB)", "host": "localhost", "port": 6333, "type": "db"},
    {"name": "HAPI FHIR", "host": "localhost", "port": 8080, "type": "db"},
    {"name": "MCP Server", "host": "localhost", "port": 8002, "type": "mcp"},
]

# Add the active LLM service
if LLM_BACKEND == "lightning" and LIGHTNING_BASE_URL:
    SERVICES.insert(1, {
        "name": "MedGemma 27B (Lightning)",
        "host": LIGHTNING_BASE_URL.split("://")[1].split(":")[0] if "://" in LIGHTNING_BASE_URL else "localhost",
        "port": int(LIGHTNING_BASE_URL.split(":")[-1].split("/")[0]) if ":" in LIGHTNING_BASE_URL else 443,
        "type": "api",
        "url": f"{LIGHTNING_BASE_URL}/../health"
    })
else:
    SERVICES.insert(1, {
        "name": "MedGemma 4B (llama.cpp)",
        "host": "localhost",
        "port": 8000,
        "type": "api",
        "url": "http://localhost:8000/health"
    })

def check_port(host, port):
    """Check if a TCP port is open."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, int(port)))
        sock.close()
        return result == 0
    except Exception:
        return False

def check_http(url):
    """Check if an HTTP endpoint returns 200."""
    try:
        response = requests.get(url, timeout=2)
        return response.status_code == 200
    except:
        return False

def get_system_status():
    """Returns a DataFrame with service status."""
    status_data = []
    for service in SERVICES:
        is_up = False
        if "url" in service and service["type"] == "api":
            is_up = check_http(service["url"])
            # Fallback to port check if specific health check fails but port might be open
            if not is_up:
                is_up = check_port(service["host"], service["port"])
        else:
            is_up = check_port(service["host"], service["port"])
            
        status_data.append({
            "Service": service["name"],
            "Address": f"{service['host']}:{service['port']}",
            "Status": " Online" if is_up else " Offline",
            "is_up": is_up
        })
    return pd.DataFrame(status_data)

def render_header():
    st.image("https://img.icons8.com/color/48/heart-monitor.png", width=50)
    st.title("MedGemma AI System Dashboard")
    st.markdown("---")
