"""
Ollama Client for MedGemma Integration (Ticket 2.2).
Provides a simple interface to the local Ollama API.
"""
import httpx
import logging
from typing import Dict, Any, Optional
from src.shared.config import config

logger = logging.getLogger(__name__)

class OllamaClient:
    """
    Client for Ollama API with support for structured output.
    """
    
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = base_url or config.ollama_base_url
        self.model = model or config.ollama_model
        
    def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        format: str = "json",
        temperature: float = 0.7,
        timeout: float = 120.0
    ) -> Dict[str, Any]:
        """
        Generate completion from Ollama.
        
        Args:
            prompt: The prompt to send
            model: Model name (defaults to config.ollama_model)
            format: Output format ("json" for structured output, "" for plain text)
            temperature: Sampling temperature [0-1]
            timeout: Request timeout in seconds
            
        Returns:
            Response dict containing 'response' field and metadata
        """
        model = model or self.model
        
        logger.info(f"Calling Ollama API: {self.base_url}, model={model}, format={format}")
        
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "format": format,
                        "stream": False,
                        "options": {
                            "temperature": temperature
                        }
                    }
                )
                response.raise_for_status()
                result = response.json()
                
                logger.info(f"Ollama response received: {len(result.get('response', ''))} chars")
                return result
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama API error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Ollama client error: {e}")
            raise
    
    def health_check(self) -> bool:
        """Check if Ollama is running and model is available."""
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                
                if self.model in models:
                    logger.info(f"✓ Ollama health check passed: {self.model} available")
                    return True
                else:
                    logger.warning(f"✗ Model {self.model} not found. Available: {models}")
                    return False
                    
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

# Singleton instance
ollama_client = OllamaClient()
