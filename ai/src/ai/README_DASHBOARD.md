# MedGemma Clinical AI System

A highly sophisticated, end-to-end Clinical Decision Support System (CDSS) powered by **MedGemma 1.5 4B**. This system implements a vector-based RAG (Retrieval-Augmented Generation) architecture, combining local hybrid vector search with real-time internet medical evidence.

## 🚀 Quick Start

### 1. Launch All Services
Run the main launch script to start the Backend, LLM Server, and MCP Internet Engine:
```bash
./launch.sh
```

### 2. Start the Dashboard
In a new terminal, launch the unified control panel:
```bash
./launch_dashboard.sh
```
Access the UI at: **[http://localhost:8511](http://localhost:8511)**

---

## 🛠️ System Modules

### 📊 System Status
Monitor the health of your clinical infrastructure in real-time.
*   **API Backend**: Orchestrates RAG and query rewriting.
*   **MedGemma LLM**: The core inference engine (llama.cpp).
*   **Qdrant**: Vector Database for patient snapshots.
*   **MCP Server**: Internet retrieval engine for PubMed/FDA.

### 📥 Data Ingestion
The system requires clinical data to provide context-aware answers.
*   **Remote Redis Sync**: The primary production path. Pulls data from the Cloud Redis instance and indexes it locally.
*   **File Upload**: Drag and drop FHIR JSON bundles directly into the system.
*   **Test Seeding**: Populate the system with synthetic clinical records for testing purposes.
*   **Danger Zone**: Wipe and reset the Vector database collections.

### 💬 Clinical Assistant
The interactive interface for medical professional assistance.
*   **Local RAG Mode**: Retrieves context from your indexed patient records.
*   **Internet MCP Mode**: Queries PubMed, OpenFDA, and NIH for the latest medical guidelines and drug interactions.
*   **Vision Support**: Attach medical images (X-rays, Scans) to chat queries for multimodal analysis.

---

## 🌐 Remote Access (Tailscale Funnel)
The system is configured to be securely reachable via Tailscale Funnel.
*   **Public URL**: [https://bws.taild935b3.ts.net/chat](https://bws.taild935b3.ts.net/chat)
*   **Config**: Ensure Tailscale is serving port **8511**.

---

## 📁 Project Structure
*   [src/api/](src/api/): FastAPI backend orchestrator.
*   [src/ui/](src/ui/): Multi-page Streamlit dashboard.
*   [src/ingestion/](src/ingestion/): Clinical data normalization and indexing logic.
*   [mcps/](mcps/): Internet retrieval agent (PubMed/FDA).
*   [models/](models/): Model weights and configuration.
*   [scripts/](scripts/): Utility scripts for setup and testing.

---

## ⚠️ Troubleshooting
*   **DNS Failures**: If the MCP engine reports "Temporary failure in name resolution", check your system's DNS settings (`/etc/resolv.conf`).
*   **Model Not Found**: Ensure you have downloaded the MedGemma GGUF file into the `models/` directory.
*   **Port Conflicts**: If the dashboard fails to start, ensure port `8511` is not occupied by another process.

---
*Built for clinical excellence by the BWS AI Team.*
