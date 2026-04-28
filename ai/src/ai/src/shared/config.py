"""
Configuration Management for Clinical Infrastructure.
Implements strict typing and environment-based configuration.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
import os


class InfraConfig(BaseSettings):
    """
    Infrastructure configuration following Clinical Core rules:
    - Strict Typing (Pydantic V2)
    - Environment-based configuration
    """
    
    # FHIR Server
    fhir_base_url: str = Field(default="http://localhost:8080/fhir", description="HAPI FHIR base URL")
    
    # Qdrant Configuration
    qdrant_host: str = Field(default="localhost", description="Qdrant host")
    qdrant_port: int = Field(default=6333, description="Qdrant REST port")
    qdrant_grpc_port: int = Field(default=6334, description="Qdrant GRPC port")
    qdrant_collection_name: str = Field(default="clinical_snapshots", description="Qdrant collection name")
    
    # Embedding Configuration (Ticket 2.1)
    embedding_dimension: int = Field(default=768, description="Vector dimension (BAAI/bge-base-en-v1.5)")
    embedding_model: str = Field(default="BAAI/bge-base-en-v1.5", description="Embedding model name (used by IngestionService)")
    
    # Ollama (MedGemma) Configuration (Epic 2)
    ollama_base_url: str = Field(default="http://localhost:11434", description="Ollama API base URL")
    ollama_model: str = Field(default="medgemma-local:latest", description="Ollama model name")
    
    # External APIs (Epic 2)
    groq_api_key: str = Field(default="", description="Groq API key for non-medical agents")
    hf_token: str = Field(default="", description="Hugging Face token")
    
    # SGLang Configuration (Alternative to Ollama)
    use_sglang: bool = Field(default=False, description="Use SGLang instead of Ollama")
    sglang_base_url: str = Field(default="http://localhost:30000", description="SGLang API base URL")
    sglang_model: str = Field(default="/home/belal/AI_System/models/medgemma-1.5-4b-it", description="SGLang model path")
    
    # LLM Backend Selector (local or lightning)
    llm_backend: str = Field(default="local", description="LLM backend: 'local' for llama.cpp 4B, 'lightning' for Lightning AI 27B")

    # llama.cpp Configuration (Local 4B model)
    llamacpp_base_url: str = Field(default="http://localhost:8000", description="llama.cpp server URL")
    llamacpp_model: str = Field(default="medgemma-1.5-4b-it-Q6_K.gguf", description="llama.cpp model name")

    # Lightning AI Configuration (Remote 27B model)
    lightning_base_url: str = Field(default="", description="Lightning AI API base URL (e.g., https://<id>-8000.<region>.studios.lightning.ai/v1)")
    lightning_model_name: str = Field(default="google/medgemma-27b-it", description="Lightning AI model name")
    lightning_access_token: str = Field(default="", description="Lightning AI access token (only if port is Private)")

    @property
    def active_llm_base_url(self) -> str:
        """Return the active LLM base URL based on backend selection.
        Strips trailing slashes so downstream path joins don't double up."""
        if self.llm_backend == "lightning":
            return self.lightning_base_url.rstrip("/")
        return self.llamacpp_base_url.rstrip("/")

    @property
    def active_llm_api_key(self) -> str:
        """Return the active LLM API key based on backend selection."""
        if self.llm_backend == "lightning":
            return self.lightning_access_token or "EMPTY"
        return "sk-no-key"

    @property
    def active_llm_model(self) -> str:
        """Return the active LLM model name based on backend selection."""
        if self.llm_backend == "lightning":
            return self.lightning_model_name
        return self.llamacpp_model

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")
    
    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
        case_sensitive = False
        extra = "ignore"


# Singleton instance
config = InfraConfig()
