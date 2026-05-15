"""
Prompt Templates for Clinical Reasoning Agent (Ticket 2.2).
Versioned prompts for experimentation and reproducibility.
"""

DDX_SYSTEM_PROMPT_V1 = """You are a clinical reasoning assistant specialized in differential diagnosis.

Your task is to analyze patient clinical data and generate exactly 3 differential diagnoses ranked by likelihood.

CRITICAL RULES:
1. Only use information explicitly provided in the context
2. Cite specific UUIDs from the context for each claim
3. Do not fabricate lab values, symptoms, or patient history
4. Express uncertainty appropriately

Output Format (strict JSON):
{
  "differentials": [
    {
      "diagnosis": "Full condition name (ICD-10 preferred)",
      "confidence": 0.85,
      "supporting_evidence": ["Evidence 1 from context", "Evidence 2 from context"],
      "cited_ids": ["uuid-1", "uuid-2"]
    }
  ],
  "reasoning": "Brief explanation of clinical logic and why these diagnoses are most likely"
}"""

DDX_USER_PROMPT_TEMPLATE_V1 = """Patient ID: {patient_id}
Clinical Query: {query}

=== Retrieved Clinical Context ===
{context_str}
=== End Context ===

Generate 3 differential diagnoses with supporting evidence. Only reference information from the context above.
"""

def format_contexts_for_prompt(contexts: list) -> str:
    """
    Format retrieved contexts into a readable string for the LLM.
    
    Args:
        contexts: List of RetrievedContext objects
        
    Returns:
        Formatted string with numbered contexts
    """
    if not contexts:
        return "(No clinical context retrieved)"
    
    formatted = []
    for i, ctx in enumerate(contexts, 1):
        formatted.append(f"[Context {i}] ID: {ctx.anchor_id}")
        formatted.append(f"Score: {ctx.score:.3f}")
        formatted.append(f"Content: {ctx.anchor_content}")
        
        if ctx.graph_context:
            formatted.append(f"Graph Context: {len(ctx.graph_context)} related nodes")
        
        formatted.append("")  # Blank line
    
    return "\n".join(formatted)

def build_ddx_prompt(patient_id: str, query: str, contexts: list, version: str = "v1") -> str:
    """
    Build the complete prompt for DDx generation.
    
    Args:
        patient_id: Patient identifier
        query: Clinical query/question
        contexts: List of RetrievedContext objects
        version: Prompt version (for experimentation)
        
    Returns:
        Complete prompt string (system + user)
    """
    if version == "v1":
        context_str = format_contexts_for_prompt(contexts)
        user_prompt = DDX_USER_PROMPT_TEMPLATE_V1.format(
            patient_id=patient_id,
            query=query,
            context_str=context_str
        )
        
        # Combine system and user for Ollama
        return f"{DDX_SYSTEM_PROMPT_V1}\n\n{user_prompt}"
    else:
        raise ValueError(f"Unknown prompt version: {version}")
