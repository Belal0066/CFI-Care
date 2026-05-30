"""
Query Rewriter utilizing Groq (or configured LLM) to resolve conversational context.
"""
import os
import logging
from typing import List, Dict, Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

class QueryRewriter:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.base_url = "https://api.groq.com/openai/v1"
        self.model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        
        if not self.api_key:
            logger.warning("GROQ_API_KEY not found. Query rewriting will be skipped.")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                base_url=self.base_url,
                api_key=self.api_key
            )

    async def rewrite(self, query: str, history: List[Dict[str, str]]) -> str:
        """
        Rewrite the query based on chat history to resolve entities.
        
        Args:
            query: The current user query.
            history: List of message dicts (role, content).
            
        Returns:
            Rewritten query or original query if rewrite fails/not needed.
        """
        if not self.client or not history:
            return query
            
        # Filter logic: trigger only if pronouns or coreference markers appear
        # Simple heuristic to save tokens
        trigger_words = ["she", "he", "her", "his", "him", "it", "they", "them", "patient", "previously"]
        if not any(w in query.lower().split() for w in trigger_words):
            return query

        # Extract recent relevant history (last 4 turns) to avoid context bloat
        # History format from Streamlit: [{"role": "user", "content": ...}, ...]
        recent_history = history[-4:] 
        
        system_prompt = (
            "You are a clinical query assistant. Rewrite the user's latest query to be standalone "
            "by resolving pronouns (e.g., 'her', 'treatment') to specific patients or conditions mentions in the history.\n"
            "History usually contains Patient ID, Name, Age, Gender.\n"
            "Example:\n"
            "History: User: Find info on Pat-001. Asst: Pat-001 is John Doe, 45M...\n"
            "Query: what drugs is he on?\n"
            "Rewritten: what drugs is John Doe (Pat-001) on?\n\n"
            "Return ONLY the rewritten query text. Do not answer the question."
        )
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add history
        for msg in recent_history:
            role = msg.get("role")
            content = msg.get("content")
            # Skip large context blocks or non-text content if possible, but here we just take content
            if role in ["user", "assistant"] and isinstance(content, str):
                messages.append({"role": role, "content": content[:500]}) # Truncate long messages
                
        messages.append({"role": "user", "content": query})
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=100
            )
            rewritten = response.choices[0].message.content.strip()
            # Safety check: if rewritten is empty or too different/garbage, return original
            if not rewritten:
                return query
                
            logger.info(f"Query Rewriter: '{query}' -> '{rewritten}'")
            return rewritten
        except Exception as e:
            logger.error(f"Query rewriting failed: {e}")
            return query

# Singleton
query_rewriter = QueryRewriter()
