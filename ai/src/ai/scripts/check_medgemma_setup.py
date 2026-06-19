#!/usr/bin/env python3
"""
Quick sanity check for MedGemma RAG setup
Verifies all components are accessible.
"""
import sys
import requests
from typing import Dict

def check_qdrant() -> Dict[str, str]:
    """Check Qdrant connection."""
    try:
        response = requests.get("http://localhost:6333/collections", timeout=5)
        if response.status_code == 200:
            collections = response.json()
            return {
                "status": "",
                "message": f"Connected ({len(collections.get('result', {}).get('collections', []))} collections)"
            }
        else:
            return {"status": "️", "message": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"status": "", "message": str(e)}


def check_llm_backend() -> Dict[str, str]:
    """Check the active LLM backend."""
    import os
    backend = os.getenv("LLM_BACKEND", "local")
    if backend == "lightning":
        base_url = os.getenv("LIGHTNING_BASE_URL", "").rstrip("/")
        health_url = f"{base_url}/../health" if base_url else ""
        if not health_url:
            return {"status": "", "message": "LIGHTNING_BASE_URL not set"}
        try:
            response = requests.get(health_url, timeout=10)
            if response.status_code == 200:
                return {"status": "", "message": "Lightning AI 27B running"}
            return {"status": "️", "message": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"status": "", "message": f"Lightning AI unreachable: {str(e)[:50]}"}
    else:
        try:
            response = requests.get("http://localhost:8000/health", timeout=5)
            if response.status_code == 200:
                return {"status": "", "message": "llama.cpp server running"}
            return {"status": "️", "message": f"HTTP {response.status_code}"}
        except requests.exceptions.ConnectionError:
            return {"status": "", "message": "Not running"}
        except Exception as e:
            return {"status": "", "message": str(e)}


def check_embedding_model() -> Dict[str, str]:
    """Check if embedding model is accessible."""
    try:
        from sentence_transformers import SentenceTransformer
        # Try to initialize (will download if not cached)
        model = SentenceTransformer("lokeshch19/ModernPubMedBERT")
        return {"status": "", "message": "Model loaded"}
    except Exception as e:
        return {"status": "️", "message": "Will download on first use"}


def check_dependencies() -> Dict[str, str]:
    """Check Python dependencies."""
    required = [
        "qdrant_client",
        "sentence_transformers",
        "requests",
        "pydantic",
        "fastapi"
    ]
    
    missing = []
    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    
    if missing:
        return {"status": "", "message": f"Missing: {', '.join(missing)}"}
    else:
        return {"status": "", "message": "All installed"}


def main():
    print(" MedGemma RAG Sanity Check")
    print("=" * 60)
    
    # Determine label based on backend
    import os
    backend_label = "Lightning AI 27B" if os.getenv("LLM_BACKEND") == "lightning" else "llama.cpp 4B"
    
    checks = [
        ("Python Dependencies", check_dependencies()),
        ("Qdrant Vector Store", check_qdrant()),
        (f"LLM ({backend_label})", check_llm_backend()),
        ("Embedding Model", check_embedding_model()),
    ]
    
    max_label_len = max(len(label) for label, _ in checks)
    
    all_ok = True
    for label, result in checks:
        status = result["status"]
        message = result["message"]
        print(f"{label:<{max_label_len}} : {status} {message}")
        if status == "":
            all_ok = False
    
    print("=" * 60)
    
    if all_ok:
        print(" All checks passed! Ready to use MedGemma RAG.")
        print("\nQuick start:")
        print("  • python examples/medgemma_rag_example.py")
        print("  • python scripts/test_medgemma_rag.py --interactive")
        print("  • ./scripts/start_medgemma_api.sh")
        return 0
    else:
        print("️  Some checks failed. See messages above.")
        print("\nTroubleshooting:")
        print("  • Qdrant: docker-compose up -d qdrant")
        print("  • Local LLM: ./launch.sh --local")
        print("  • Lightning AI: ./launch.sh --lightning")
        print("  • Dependencies: pip install -r requirements.txt")
        return 1


if __name__ == "__main__":
    sys.exit(main())
