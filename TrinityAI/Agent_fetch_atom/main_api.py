import uvicorn
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, TypedDict, List, Optional
import wikipedia
import numpy as np
from langgraph.graph import StateGraph, END

from llm1 import QueryEnhancer
from llm2 import LLM2Enhancer
from rag import RAGRetriever

class AgentState(TypedDict):
    original_query: str
    enhanced_query: str
    rag_results: List[Dict]
    wikipedia_info: str
    analysis_result: Dict
    final_response: str
    error: Optional[str]
    step_logs: List[str]
    domain_reason: str

def convert_numpy(obj):
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(i) for i in obj]
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj

def initialize_systems_for_api():
    try:
        enhancer = QueryEnhancer(
            api_url="http://10.2.1.65:11434/api/chat",
            model_name="deepseek-r1:32b",
            bearer_token="aakash_api_key"
        )
        llm2_enhancer = LLM2Enhancer(
            api_url="http://10.2.1.65:11434/api/chat",
            model_name="deepseek-r1:32b",
            bearer_token="aakash_api_key"
        )
        rag_retriever = RAGRetriever()
        return enhancer, llm2_enhancer, rag_retriever
    except Exception as e:
        print(f"System initialization error: {e}")
        return None, None, None

enhancer, llm2_enhancer, rag_retriever = initialize_systems_for_api()

def node_query_enhance(state: AgentState) -> AgentState:
    try:
        enhance_result = enhancer.enhance_query(state["original_query"])
        if enhance_result.get("domain_status") == "out_of_domain":
            return {**state, "analysis_result": enhance_result, "final_response": "", "error": None, "domain_reason": enhance_result.get("domain_reason", "")}
        return {**state, "enhanced_query": enhance_result.get("enhanced_query", state["original_query"]), "domain_reason": enhance_result.get("domain_reason", "")}
    except Exception as e:
        return {**state, "error": f"Enhancement error: {e}", "enhanced_query": state["original_query"], "domain_reason": ""}

def node_rag(state: AgentState) -> AgentState:
    try:
        rag_results = rag_retriever.retrieve_relevant_atoms(state["enhanced_query"], top_k=5)
        return {**state, "rag_results": rag_results}
    except Exception as e:
        return {**state, "error": f"RAG error: {e}", "rag_results": []}

def node_wikipedia(state: AgentState) -> AgentState:
    wiki_info = ""
    atom_name = None
    if state.get("rag_results"):
        atom_name = state["rag_results"][0].get("atom")
    if atom_name:
        try:
            wiki_info = wikipedia.summary(atom_name, sentences=2, auto_suggest=False)
        except Exception as e:
            wiki_info = f"(No Wikipedia info found: {e})"
    return {**state, "wikipedia_info": wiki_info}

def node_llm2(state: AgentState) -> AgentState:
    try:
        tools_used = []
        if state.get("rag_results"):
            tools_used.append("RAG")
        if state.get("wikipedia_info"):
            tools_used.append("Wikipedia")
        analysis_result = llm2_enhancer.analyze_multi_atom_scenario(
            state["original_query"],
            state["enhanced_query"],
            state["rag_results"],
            threshold=0.3,
            wikipedia_info=state.get("wikipedia_info", ""),
            domain_reason=state.get("domain_reason", "")
        )
        analysis_result["tools_used"] = tools_used
        analysis_result["processing_steps"] = state.get("step_logs", [])
        return {**state, "analysis_result": analysis_result}
    except Exception as e:
        return {**state, "error": f"LLM2 error: {e}", "analysis_result": {}}

def create_langgraph_agent():
    workflow = StateGraph(AgentState)
    workflow.add_node("query_enhance", node_query_enhance)
    workflow.add_node("rag", node_rag)
    workflow.add_node("wikipedia", node_wikipedia)
    workflow.add_node("llm2", node_llm2)
    workflow.set_entry_point("query_enhance")
    workflow.add_edge("query_enhance", "rag")
    def rag_to_next(state: AgentState) -> str:
        if isinstance(state.get("analysis_result"), dict) and state["analysis_result"].get("domain_status") == "out_of_domain":
            return END
        if state.get("rag_results") and len(state["rag_results"]) > 0:
            return "wikipedia"
        else:
            return "llm2"
    workflow.add_conditional_edges("rag", rag_to_next, {"wikipedia": "wikipedia", "llm2": "llm2", END: END})
    workflow.add_edge("wikipedia", "llm2")
    workflow.add_edge("llm2", END)
    return workflow.compile()

app_graph = create_langgraph_agent()

class QueryRequest(BaseModel):
    query: str

app = FastAPI(
    title="LangGraph Atom Chatbot API",
    description="API endpoint for LangGraph-powered chatbot",
    version="1.0"
)

# Allow the React frontend to call this API from a different origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_endpoint(request: QueryRequest):
    try:
        result = app_graph.invoke({
            "original_query": request.query,
            "enhanced_query": "",
            "rag_results": [],
            "wikipedia_info": "",
            "analysis_result": {},
            "final_response": "",
            "error": None,
            "step_logs": [],
            "domain_reason": ""
        })
        if isinstance(result.get("analysis_result"), dict) and result["analysis_result"].get("domain_status") == "out_of_domain":
            return jsonable_encoder(result["analysis_result"])
        clean_result = convert_numpy(result["analysis_result"])
        return clean_result
    except Exception as e:
        return {"error": str(e), "domain_status": "failed"}

@app.get("/health")
async def health():
    return {"domain_status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main_api:app", host="0.0.0.0", port=8002, reload=True)
