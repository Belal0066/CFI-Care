import os
import json
from typing import Annotated, TypedDict, Union, List, Dict, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from dotenv import load_dotenv

load_dotenv()

from adapters.pubmed import search_pubmed, search_pubmed_interactions
from adapters.openfda import get_drug_interactions
from adapters.medlineplus import search_medlineplus

class GraphState(TypedDict):
    query: str
    classification: str
    entities: List[str]
    raw_data: List[Dict[str, str]]
    structured_response: Optional[Dict]
    conflicts: List[str]
    error: Optional[str]

CATEGORIES = {
    "A": "General Medical Query",
    "B": "Reference Ranges",
    "C": "Drug Interactions",
    "D": "Treatment Guidelines",
    "E": "Differential Diagnosis",
    "F": "Patient Education",
    "G": "Insufficient Evidence / Off-topic / Harmful"
}

# LLM setup
llm_api_key = os.getenv("LLAMACPP_API_KEY", os.getenv("GROQ_API_KEY", "sk-no-token"))
llm_base_url = os.getenv("LLAMACPP_API_BASE")
llm_model = os.getenv("MODEL_NAME", "llama-3.3-70b-versatile")

if llm_base_url:
    llm = ChatOpenAI(model=llm_model, openai_api_key=llm_api_key, openai_api_base=llm_base_url, temperature=0.1)
else:
    from langchain_groq import ChatGroq
    llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=os.getenv("GROQ_API_KEY", "dummy"))

async def guardrail_node(state: GraphState):
    q = state["query"].lower()
    for k in ["homeopathy", "chakra", "crystal healing"]:
        if k in q: return {"classification": "G", "error": f"Guardrail: {k}"}
    return {"error": None}

async def classification_node(state: GraphState):
    if state.get("classification") == "G" or not llm: return {}
    
    prompt = (
        "You are an expert medical search optimizer. Analyze the query and extract precise search parameters.\n"
        "1. Classify the query into ONE category (A-G).\n"
        "2. Extract 'search_keywords': A list of 2-3 specific medical terms for PubMed search. Avoid natural language.\n"
        "3. Rewrite the query into an 'optimized_query' string suitable for broad medical search engines.\n"
        "4. Extract 'drug_names': A list of generic drug names if this is an interaction query.\n\n"
        "Categories:\n"
        "A: General Medical\n"
        "B: Reference Ranges\n"
        "C: Drug Interactions\n"
        "D: Clinical Guidelines\n"
        "E: Differential Diagnosis\n"
        "F: Patient Education\n"
        "G: Harmful / Pseudoseince\n\n"
        f"Query: {state['query']}\n\n"
        "Respond in strict JSON format:\n"
        "{\n"
        '  "classification": "Letter",\n'
        '  "search_keywords": ["term1", "term2"],\n'
        '  "optimized_query": "medical condition treatment guidelines",\n'
        '  "drug_names": []\n'
        "}"
    )
    try:
        res = llm.invoke([SystemMessage(content="You are a medical classifier."), HumanMessage(content=prompt)])
        import re
        m = re.search(r'\{.*\}', res.content, re.DOTALL)
        data = json.loads(m.group(0)) if m else {"classification": "A", "search_keywords": [], "drug_names": [], "optimized_query": state["query"]}
        
        # Map fields to state
        classification = data.get("classification", "A").upper()
        # Use drug_names for Class C, otherwise search_keywords
        entities = data.get("drug_names", []) if classification == "C" else data.get("search_keywords", [])
        
        return {
            "classification": classification, 
            "entities": entities,
            "query": data.get("optimized_query", state["query"]) # Updated query for downstream use
        }
    except Exception as e:
        return {"classification": "G", "error": f"Classification Error: {str(e)}"}

async def summarizer_node(state: GraphState):
    """
    Summarizes specific content for each retrieved link relative to the original query.
    """
    raw_data = state.get("raw_data", [])
    if not raw_data: return {}

    query = state["query"]
    
    # Process only items that have substantial content (skip simple link placeholders if they have no abstract)
    # We'll enable parallel summarization if needed, but for now sequential is safer for rate limits
    processed_data = []
    
    for item in raw_data:
        content = item.get("content", "")
        # Skip if content is very short or just a title
        if len(content) < 100:
            processed_data.append(item)
            continue
            
        prompt = (
            f"Summarize the following medical content in 2-3 sentences, specifically addressing the query: '{query}'.\n"
            "Focus on clinical findings, guidelines, or recommendations.\n\n"
            f"Content:\n{content[:4000]}" # Truncate to avoid context limits
        )
        
        try:
             # Fast summarization
            res = llm.invoke([SystemMessage(content="You are a medical summarizer."), HumanMessage(content=prompt)])
            summary = res.content.strip()
            item["summary"] = summary
            # We treat the 'summary' as the new display content, but keep original full content in 'full_text' if needed
            # For the UI, we might want to show the summary. 
            # Let's append the summary to the content for visibility.
            item["content"] = f"**Summary:** {summary}\n\n**Source Detail:**\n{content}"
        except Exception:
            # If summarization fails, keep original
            pass
            
        processed_data.append(item)
    
    return {"raw_data": processed_data}

async def retriever_node(state: GraphState):
    c = state["classification"]
    q = state["query"]
    entities = state.get("entities", [])
    if c == "G": return {}
    raw_data = []
    
    try:
        # Standard Search Path (PubMed + MedlinePlus)
        if c in ["A", "D", "E", "F"]:
            # 1. PubMed Search
            search_query = " AND ".join(entities) if entities else q
            results = await search_pubmed(search_query, max_results=5)
            
            found_pubmed = False
            for r in results:
                title = r.get("title", "")
                if "No direct authoritative guidelines" in title: continue
                found_pubmed = True
                
                abstract = r.get("abstract", "") if isinstance(r, dict) else ""
                content = f"{title}\n\nAbstract: {abstract}" if abstract else title
                
                raw_data.append({
                    "source": "PubMed",
                    "content": content,
                    "url": r.get("url", "") if isinstance(r, dict) else "",
                    "pmid": r.get("pmid", "") if isinstance(r, dict) else "",
                    "abstract": abstract
                })
            
            # 2. MedlinePlus Search (Parallel Resource)
            # Add if explicitly educational (F) or general (A), or as fallback
            if c in ["A", "F"] or not found_pubmed or len(raw_data) < 3:
                # Use the optimized query for the search link
                mpl_results = await search_medlineplus(q)
                raw_data.extend([{"source": "NIH/MedlinePlus", **res} for res in mpl_results])

        elif c == "B":
             # Reference Ranges -> MedlinePlus is primary
            mpl_results = await search_medlineplus(q)
            raw_data.extend([{"source": "NIH/MedlinePlus", **res} for res in mpl_results])
            
        elif c == "C":
            # 1. OpenFDA (Interactions)
            terms = entities if entities else [q]
            for term in terms:
                res = await get_drug_interactions(term)
                if isinstance(res, dict):
                    raw_data.append({"source": "OpenFDA", "content": json.dumps(res)})
                elif isinstance(res, str) and "Error" in res:
                    raw_data.append({"source": "OpenFDA Error", "content": res})
            
            # 2. PubMed Fallback for Interactions
            if not any(d["source"] == "OpenFDA" for d in raw_data) or len(terms) >= 2:
                pm_query = f"{terms[0]} AND {terms[1]} AND Drug Interactions" if len(terms) >= 2 else f"{terms[0]} interactions"
                pm_results = await search_pubmed(pm_query, max_results=3)
                for r in pm_results:
                     raw_data.append({"source": "PubMed Interaction", "content": str(r)})
                     
    except Exception as e:
        return {"error": f"Retrieval Error: {str(e)}"}
    return {"raw_data": raw_data}

async def synthesizer_node(state: GraphState):
    if not state["raw_data"] or state["classification"] == "G": return {}
    prompt = (
        "Synthesize the following medical data into a structured response.\n"
        "FIELDS: clinical_summary, evidence_level, recommendation, confidence_score, references, warnings, notes\n"
        f"DATA:\n{json.dumps(state['raw_data'], indent=2)}\n\n"
        f"QUERY: {state['query']}\n"
        "JSON ONLY."
    )
    try:
        res = llm.invoke([SystemMessage(content="You are a medical synthesizer."), HumanMessage(content=prompt)])
        import re
        m = re.search(r'\{.*\}', res.content, re.DOTALL)
        return {"structured_response": json.loads(m.group(0))} if m else {"error": "Synthesis failed to produce JSON"}
    except Exception as e:
        return {"error": f"Synthesis Error: {str(e)}"}

async def validator_node(state: GraphState):
    if len(state["raw_data"]) < 2: return {}
    # Simplified validator to save tokens/time
    return {}

def get_medical_graph():
    workflow = StateGraph(GraphState)
    workflow.add_node("guardrail", guardrail_node)
    workflow.add_node("classifier", classification_node)
    workflow.add_node("retriever", retriever_node)
    workflow.add_node("summarizer", summarizer_node)
    
    workflow.set_entry_point("guardrail")
    workflow.add_conditional_edges("guardrail", lambda x: "end" if x.get("classification") == "G" else "continue", {"end": END, "continue": "classifier"})
    workflow.add_edge("classifier", "retriever")
    workflow.add_edge("retriever", "summarizer")
    workflow.add_edge("summarizer", END)
    return workflow.compile()

medical_app = get_medical_graph()

async def run_medical_flow(query: str) -> Dict:
    return await medical_app.ainvoke({"query": query, "classification": "", "raw_data": [], "structured_response": None, "conflicts": [], "error": None})
