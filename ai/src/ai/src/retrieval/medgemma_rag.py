"""
MedGemma RAG Integration
Connects MedGemma 1.5 (llama.cpp server) to Qdrant vector store for clinical RAG.
"""
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
import requests
from sentence_transformers import SentenceTransformer
from qdrant_client.models import Filter, FieldCondition, MatchValue

from src.shared.db_clients import qdrant_client
from src.shared.config import config
from src.ingestion.service import IngestionService

logger = logging.getLogger(__name__)


class MedGemmaRAG:
    """
    Simple RAG pipeline: Query -> Qdrant Search -> MedGemma Generation
    """
    
    def __init__(
        self,
        llama_server_url: Optional[str] = None,
        embedding_model: str = "lokeshch19/ModernPubMedBERT",
        top_k: int = 5
    ):
        # If no URL provided, read from config (handles local/lightning switching)
        if llama_server_url is None:
            base = config.active_llm_base_url
            self.llama_server_url = base.rstrip("/")
        else:
            self.llama_server_url = llama_server_url
        self.embedding_model_name = embedding_model
        self.top_k = top_k
        self._embedding_model = None
        self.prompt_path = Path(__file__).parent.parent.parent / "prompts" / "system_instruction.txt"

    def get_default_system_prompt(self) -> str:
        """Read default system prompt from file."""
        if self.prompt_path.exists():
            return self.prompt_path.read_text().strip()
        return (
            "Use the provided context to answer medical questions accurately."
        )

    def parse_response(self, raw_response: str) -> Dict[str, str]:
        """
        Parse response into thinking and clinical output sections.
        
        Args:
            raw_response: Raw model output that may contain thinking process
            
        Returns:
            Dict with 'thinking' and 'clinical_output' keys
        """
        # Primary strategy: Look for CLINICAL SYNTHESIS as the dividing line
        # Everything before it is thinking, everything from it onwards is output
        synthesis_markers = [
            "CLINICAL SYNTHESIS:",
            "CLINICAL SYNTHESIS",
            "Clinical Synthesis:",
        ]
        
        for marker in synthesis_markers:
            if marker in raw_response:
                idx = raw_response.find(marker)
                
                # Everything before is thinking/reasoning
                thinking = raw_response[:idx].strip()
                
                # Clean up thinking section - remove redundant headers/metadata
                # Remove common metadata patterns at the end
                thinking_lines = thinking.split('\n')
                cleaned_thinking = []
                
                for line in thinking_lines:
                    # Skip metadata/constraint lines
                    if any(skip in line.lower() for skip in ['constraint checklist', 'confidence score:', 'part 2:', '**']):
                        continue
                    cleaned_thinking.append(line)
                
                thinking = '\n'.join(cleaned_thinking).strip()
                
                # Everything from marker onwards is clinical output
                clinical_output = raw_response[idx:].strip()
                
                # Remove duplicate content from clinical output
                lines = clinical_output.split('\n')
                seen_lines = set()
                unique_lines = []
                
                for line in lines:
                    # Normalize line for comparison
                    normalized = ' '.join(line.split()).lower()
                    # Skip empty or very short lines in deduplication
                    if not normalized or len(normalized) < 5:
                        unique_lines.append(line)
                        continue
                    
                    if normalized not in seen_lines:
                        seen_lines.add(normalized)
                        unique_lines.append(line)
                
                clinical_output = '\n'.join(unique_lines)
                
                return {
                    "thinking": thinking,
                    "clinical_output": clinical_output
                }
        
        # Fallback: If no CLINICAL SYNTHESIS marker found, return everything as output
        logger.warning("No CLINICAL SYNTHESIS marker found in response")
        return {
            "thinking": "",
            "clinical_output": raw_response.strip()
        }
    
    def retrieve_context(
        self, 
        query: str, 
        patient_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant context from Qdrant.
        
        Args:
            query: User query
            patient_id: Optional patient filter
            
        Returns:
            List of retrieved documents with metadata
        """
        logger.info(f"Retrieving context for query: '{query}'")
        
        # 1. Embed query (CPU via FastEmbed)
        vector = IngestionService.get_embedding(query)
        
        # 2. Search Qdrant
        q_client = qdrant_client.connect()
        
        search_params = {
            "collection_name": qdrant_client.collection_name,
            "query_vector": vector,
            "limit": self.top_k
        }
        
        # Add patient filter if provided
        if patient_id:
            search_params["query_filter"] = Filter(
                must=[
                    FieldCondition(
                        key="patient_id",
                        match=MatchValue(value=patient_id)
                    )
                ]
            )
        
        try:
            search_results = q_client.search(**search_params)
        except Exception as e:
            logger.error(f"Qdrant search failed: {e}")
            return []
        
        # 3. Format results
        contexts = []
        for hit in search_results:
            contexts.append({
                "id": str(hit.id),
                "content": hit.payload.get("toon_content", ""),
                "score": hit.score,
                "patient_id": hit.payload.get("patient_id", "unknown"),
                "resource_type": hit.payload.get("resource_type", "unknown")
            })
            
        logger.info(f"Retrieved {len(contexts)} contexts")
        return contexts
    
    def generate_response(
        self, 
        query: str, 
        contexts: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        image_data: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate response using MedGemma with RAG context and optional image.
        
        Args:
            query: User query
            contexts: Retrieved context documents
            system_prompt: Optional system prompt override
            image_data: Optional base64-encoded image
            
        Returns:
            Response dict with content and metadata
        """
        # Build RAG-augmented prompt
        if system_prompt is None:
            system_prompt = self.get_default_system_prompt()
        
        # Format context
        context_str = "\n\n".join([
            f"[CONTEXT {i+1}] (Score: {ctx['score']:.3f})\n{ctx['content']}"
            for i, ctx in enumerate(contexts)
        ])
        
        # Build message content
        user_message_content = f"CONTEXT:\n{context_str}\n\nQuery: {query}"
        
        # Prepare messages
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add user message with optional image
        if image_data:
            # Image format for llama.cpp with vision models
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": user_message_content},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                ]
            })
        else:
            messages.append({
                "role": "user",
                "content": user_message_content
            })
        
        # Call llama.cpp server
        try:
            response = requests.post(
                f"{self.llama_server_url}/v1/chat/completions",
                json={
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 2048,
                    "stream": False
                },
                timeout=60
            )
            response.raise_for_status()
            result = response.json()
            
            # Parse the response into thinking and clinical output
            raw_content = result["choices"][0]["message"]["content"]
            parsed = self.parse_response(raw_content)
            
            # Debug logging
            logger.info(f"Raw content length: {len(raw_content)}")
            logger.info(f"Thinking length: {len(parsed['thinking'])}")
            logger.info(f"Clinical output length: {len(parsed['clinical_output'])}")
            
            return {
                "content": parsed["clinical_output"],
                "thinking": parsed["thinking"],
                "raw_content": raw_content,  # Keep raw for debugging
                "model": result.get("model", "medgemma-1.5-4b"),
                "contexts_used": len(contexts),
                "contexts": contexts,
                "usage": result.get("usage", {})
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"LLM generation failed: {e}")
            return {
                "content": f"Error: Failed to generate response - {str(e)}",
                "error": str(e),
                "contexts_used": len(contexts),
                "contexts": contexts
            }
    
    def query(
        self, 
        query: str, 
        patient_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        image_data: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        End-to-end RAG query: Retrieve + Generate.
        
        Args:
            query: User question
            patient_id: Optional patient filter
            system_prompt: Optional system prompt
            image_data: Optional base64-encoded image
            
        Returns:
            Complete response with answer and metadata
        """
        logger.info(f"RAG Query: '{query}' (Patient: {patient_id or 'all'}, Image: {'Yes' if image_data else 'No'})")
        
        # Step 1: Retrieve
        contexts = self.retrieve_context(query, patient_id)
        
        if not contexts:
            logger.warning("No contexts retrieved, generating without RAG")
        
        # Step 2: Generate
        response = self.generate_response(query, contexts, system_prompt, image_data)
        
        return response


# Singleton instance
medgemma_rag = MedGemmaRAG()
