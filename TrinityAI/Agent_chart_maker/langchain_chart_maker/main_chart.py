from fastapi import FastAPI
from pydantic import BaseModel
from llm1 import RAGChartPropertyExtractor
from chart_rag import get_chart_schema, validate_extracted_properties, fill_defaults
from typing import Dict
import uuid

LLM_API_URL = "http://10.2.1.65:11434/api/chat"
LLM_MODEL_NAME = "deepseek-r1:32b"
LLM_BEARER_TOKEN = "aakash_api_key"

app = FastAPI()
extractor = RAGChartPropertyExtractor(LLM_API_URL, LLM_MODEL_NAME, LLM_BEARER_TOKEN)

# In-memory session store for chart state and memory (history)
SESSION_STORE: Dict[str, dict] = {}

class ChartRequest(BaseModel):
    prompt: str
    session_id: str = None  # Optional: client can send their session_id, else we assign one

def detect_chart_type(prompt: str) -> str:
    prompt = prompt.lower()
    if "histogram" in prompt: return "histogram"
    if "pie" in prompt: return "pie"
    if "bar" in prompt: return "bar"
    if "line" in prompt: return "line"
    if "waterfall" in prompt: return "waterfall"
    if "distplot" in prompt: return "distplot"
    if "scatter" in prompt: return "scatter"
    if "area" in prompt: return "area"
    return "line"

def recursive_merge(old, new):
    # Merge new fields into old, preserving old unless overwritten
    for k, v in new.items():
        if isinstance(v, dict) and k in old and isinstance(old[k], dict):
            old[k] = recursive_merge(old[k], v)
        else:
            old[k] = v
    return old

@app.post("/generate_chart_json")
def generate_chart_json(request: ChartRequest):
    session_id = request.session_id or str(uuid.uuid4())
    # Retrieve or initialize session state and memory
    if session_id in SESSION_STORE:
        prev_state = SESSION_STORE[session_id].get("state", {})
        memory = SESSION_STORE[session_id]["memory"]
    else:
        prev_state = {}
        memory = []
        SESSION_STORE[session_id] = {"state": prev_state, "memory": memory}

    user_prompt = request.prompt
    chart_type = detect_chart_type(user_prompt)

    # Add user message to memory
    memory.append({"role": "user", "content": user_prompt})

    # Extract properties using previous state and full memory
    extraction = extractor.extract_properties(
        user_prompt,
        chart_type,
        prev_state=prev_state,
        memory=memory
    )
    enhanced_prompt = extraction.get("enhanced_prompt")
    extracted = extraction.get("extracted")
    llm_response = extraction.get("llm_response", "")

    # Add assistant message (the LLM's raw response) to memory
    memory.append({"role": "assistant", "content": llm_response})

    # Merge new extracted fields into previous state
    merged = recursive_merge(prev_state.copy(), extracted)

    # Validate required fields
    missing = validate_extracted_properties(chart_type, merged)
    if missing:
        # Save merged state and updated memory for next turn
        SESSION_STORE[session_id]["state"] = merged
        SESSION_STORE[session_id]["memory"] = memory
        return {
            "success": False,
            "message": (
                f"⚠️ Missing required fields for {chart_type} chart: {', '.join(missing)}.\n"
                "Please specify these fields in your next message."
            ),
            "enhanced_prompt": enhanced_prompt,
            "extracted_so_far": merged,
            "session_id": session_id
        }

    # All required fields present: clear session (or keep for further edits)
    SESSION_STORE.pop(session_id, None)
    template = get_chart_schema(chart_type)["template"]
    result = fill_defaults(template, merged)
    return {
        "success": True,
        "message": "Chart JSON generated successfully.",
        "enhanced_prompt": enhanced_prompt,
        "extracted": merged,
        "chart_json": result,
        "session_id": session_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
