# main_concat.py

import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import time
from llm_concat import SmartConcatAgent

# Configuration
LLM_API_URL = "http://10.2.1.65:11434/api/chat"
LLM_MODEL_NAME = "deepseek-r1:32b"
LLM_BEARER_TOKEN = "aakash_api_key"

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
MINIO_PREFIX = os.getenv("MINIO_PREFIX", "data_setss/")

# Initialize app and agent
app = FastAPI(title="Smart Concatenation Agent", version="1.0.0")
agent = SmartConcatAgent(
    LLM_API_URL, LLM_MODEL_NAME, LLM_BEARER_TOKEN,
    MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
    MINIO_BUCKET, MINIO_PREFIX
)

class ConcatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@app.post("/concat")
def concatenate_files(request: ConcatRequest):
    """Smart concatenation endpoint with complete memory"""
    start_time = time.time()
    
    print(f"\n[REQUEST] Prompt: {request.prompt}")
    print(f"[REQUEST] Session: {request.session_id}")
    
    # Process with complete memory context
    result = agent.process_request(request.prompt, request.session_id)
    
    # Add timing
    processing_time = round(time.time() - start_time, 2)
    result["processing_time"] = processing_time
    
    print(f"[RESULT] Success: {result.get('success', False)}")
    print(f"[RESULT] Used Memory: {result.get('used_memory', False)}")
    print(f"[RESULT] Time: {processing_time}s")
    
    return result

@app.get("/history/{session_id}")
def get_complete_history(session_id: str):
    """Get complete session history with all JSON details"""
    history = agent.get_session_history(session_id)
    stats = agent.get_session_stats(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "complete_history": history,
        "session_stats": stats,
        "total_interactions": len(history)
    }

@app.get("/session_details/{session_id}")
def get_session_details(session_id: str):
    """Get detailed session information for debugging"""
    details = agent.get_detailed_session_info(session_id)
    
    return {
        "success": True,
        "session_id": session_id,
        "details": details
    }

@app.get("/files")
def list_available_files():
    """List all available files"""
    files = agent.get_available_files()
    return {
        "success": True,
        "total_files": len(files),
        "files": files
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "smart_concatenation_agent",
        "version": "1.0.0",
        "features": [
            "complete_memory_context",
            "intelligent_suggestions",
            "conversational_responses",
            "user_preference_learning"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
