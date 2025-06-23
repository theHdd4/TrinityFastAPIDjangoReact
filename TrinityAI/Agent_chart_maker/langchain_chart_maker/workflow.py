# workflow.py

from langgraph.graph import StateGraph, END, START
from typing import TypedDict, Optional
from llm1 import RAGChartPropertyExtractor
from chart_rag import get_chart_schema, validate_extracted_properties, fill_defaults

# --- State definition ---
class ChartAgentState(TypedDict):
    prompt: str
    enhanced_prompt: Optional[str]
    chart_type: Optional[str]
    extracted: Optional[dict]
    validated: Optional[bool]
    missing: Optional[list]
    result: Optional[dict]
    error_message: Optional[str]

# --- Instantiate your extractor ---
LLM_API_URL = "http://10.2.1.65:11434/api/chat"
LLM_MODEL_NAME = "deepseek-r1:32b"
LLM_BEARER_TOKEN = "aakash_api_key"
extractor = RAGChartPropertyExtractor(LLM_API_URL, LLM_MODEL_NAME, LLM_BEARER_TOKEN)

# --- Workflow Nodes ---
def enhance_prompt_node(state: ChartAgentState):
    enhanced = extractor.enhance_query(state["prompt"])
    return {**state, "enhanced_prompt": enhanced}

def detect_chart_type_node(state: ChartAgentState):
    prompt = state["enhanced_prompt"].lower()
    if "histogram" in prompt:
        chart_type = "histogram"
    elif "pie" in prompt:
        chart_type = "pie"
    elif "line" in prompt:
        chart_type = "line"
    else:
        chart_type = "line"
    return {**state, "chart_type": chart_type}

def extract_properties_node(state: ChartAgentState):
    extracted = extractor.extract_properties(state["enhanced_prompt"], state["chart_type"])
    return {**state, "extracted": extracted}

def validate_node(state: ChartAgentState):
    extracted = state["extracted"]
    if "error" in extracted:
        return {**state, "validated": False, "error_message": extracted["error"]}
    missing = validate_extracted_properties(state["chart_type"], extracted)
    if missing:
        error_msg = f"Missing required fields: {', '.join(missing)}"
        return {**state, "validated": False, "error_message": error_msg}
    return {**state, "validated": True}

def fill_defaults_node(state: ChartAgentState):
    template = get_chart_schema(state["chart_type"])["template"]
    result = fill_defaults(template, state["extracted"])
    return {**state, "result": result}

def handle_errors_node(state: ChartAgentState):
    return {**state, "result": {"error": state.get("error_message", "Unknown error occurred.")}}

# --- Build the LangGraph workflow ---
graph_builder = StateGraph(ChartAgentState)
graph_builder.add_node("enhance_prompt", enhance_prompt_node)
graph_builder.add_node("detect_chart_type", detect_chart_type_node)
graph_builder.add_node("extract_properties", extract_properties_node)
graph_builder.add_node("validate", validate_node)
graph_builder.add_node("fill_defaults", fill_defaults_node)
graph_builder.add_node("handle_errors", handle_errors_node)

graph_builder.add_edge(START, "enhance_prompt")
graph_builder.add_edge("enhance_prompt", "detect_chart_type")
graph_builder.add_edge("detect_chart_type", "extract_properties")
graph_builder.add_edge("extract_properties", "validate")
graph_builder.add_conditional_edges(
    "validate",
    lambda state: "fill_defaults" if state.get("validated") else "handle_errors",
    {
        "fill_defaults": "fill_defaults",
        "handle_errors": "handle_errors"
    }
)
graph_builder.add_edge("fill_defaults", END)
graph_builder.add_edge("handle_errors", END)

chart_agent_graph = graph_builder.compile()

# --- Optional: visualize or debug the workflow here ---
if __name__ == "__main__":
    user_prompt = "Draw a pie chart of sales by region"
    state = {"prompt": user_prompt}
    final_state = chart_agent_graph.invoke(state)
    print(final_state["result"])

    # Export workflow graph as PNG (correct usage)
    chart_agent_graph.get_graph().draw_mermaid_png(output_file_path="workflow.png")
    print("Workflow diagram saved as workflow.png")
