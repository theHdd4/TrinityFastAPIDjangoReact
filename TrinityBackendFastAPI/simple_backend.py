# simple_backend.py - Minimal backend service using working merge pattern
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
import requests

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("simple.backend")

# Create FastAPI app
app = FastAPI(title="Simple Trinity Backend", version="1.0.0")

# Configuration
def get_config():
    """Return configuration from environment variables."""
    return {
        "host_ip": os.getenv("HOST_IP", "localhost"),
        "fastapi_port": os.getenv("FASTAPI_PORT", "8004"),
    }

cfg = get_config()
logger.info(f"Simple Backend Config: {cfg}")

# Models
class ConcatRequest(BaseModel):
    file1: str
    file2: str
    concat_direction: str = "vertical"

class MergeRequest(BaseModel):
    file1: str
    file2: str
    bucket_name: str = "trinity"
    join_columns: Optional[str] = None
    join_type: str = "inner"

# Endpoints
@app.get("/")
def root():
    return {"message": "Simple Trinity Backend Running", "status": "healthy"}

@app.get("/ping")
def ping():
    return {"message": "pong", "status": "healthy"}

@app.post("/api/concat/perform")
def perform_concat(request: ConcatRequest):
    """Simple concat operation - returns success response"""
    logger.info(f"Concat request: {request.file1} + {request.file2} ({request.concat_direction})")
    
    # Simulate processing
    concat_id = f"concat_{int(os.urandom(4).hex(), 16)}"
    
    return {
        "success": True,
        "concat_id": concat_id,
        "message": f"Concatenated {request.file1} and {request.file2} {request.concat_direction}ly",
        "files": [request.file1, request.file2],
        "direction": request.concat_direction
    }

@app.post("/api/merge/perform")
def perform_merge(request: MergeRequest):
    """Simple merge operation - returns success response"""
    logger.info(f"Merge request: {request.file1} + {request.file2} ({request.join_type})")
    
    # Simulate processing
    merge_id = f"merge_{int(os.urandom(4).hex(), 16)}"
    
    return {
        "success": True,
        "merge_id": merge_id,
        "message": f"Merged {request.file1} and {request.file2} using {request.join_type} join",
        "files": [request.file1, request.file2],
        "join_type": request.join_type,
        "join_columns": request.join_columns or "id"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
