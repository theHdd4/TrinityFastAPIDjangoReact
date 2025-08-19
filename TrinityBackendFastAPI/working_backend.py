# working_backend.py - Backend service using working merge pattern
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import time
import logging

# Set up logging - EXACTLY like merge agent
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("working.backend")

# Create FastAPI app
app = FastAPI(title="Working Trinity Backend", version="1.0.0")

# Configuration - EXACTLY like merge agent
def get_config():
    """Return configuration from environment variables."""
    return {
        "host_ip": os.getenv("HOST_IP", "localhost"),
        "fastapi_port": os.getenv("FASTAPI_PORT", "8004"),
    }

cfg = get_config()
logger.info(f"WORKING BACKEND INITIALIZATION:")
logger.info(f"Config: {cfg}")

# Models - EXACTLY like merge agent
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

# Endpoints - EXACTLY like merge agent pattern
@app.get("/")
def root():
    return {"message": "Working Trinity Backend Running", "status": "healthy"}

@app.get("/ping")
def ping():
    return {"message": "pong", "status": "healthy"}

@app.post("/api/concat/perform")
def perform_concat(request: ConcatRequest):
    """Concat operation using merge agent pattern"""
    start_time = time.time()
    
    logger.info(f"CONCAT REQUEST RECEIVED:")
    logger.info(f"File1: {request.file1}")
    logger.info(f"File2: {request.file2}")
    logger.info(f"Direction: {request.concat_direction}")
    
    try:
        # Simulate processing
        concat_id = f"concat_{int(os.urandom(4).hex(), 16)}"
        processing_time = round(time.time() - start_time, 2)
        
        result = {
            "success": True,
            "concat_id": concat_id,
            "message": f"Concatenated {request.file1} and {request.file2} {request.concat_direction}ly",
            "files": [request.file1, request.file2],
            "direction": request.concat_direction,
            "processing_time": processing_time
        }
        
        logger.info(f"CONCAT REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")
        
        return result
        
    except Exception as e:
        logger.error(f"CONCAT REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2)
        }
        return error_result

@app.post("/api/merge/perform")
def perform_merge(request: MergeRequest):
    """Merge operation using merge agent pattern"""
    start_time = time.time()
    
    logger.info(f"MERGE REQUEST RECEIVED:")
    logger.info(f"File1: {request.file1}")
    logger.info(f"File2: {request.file2}")
    logger.info(f"Join Type: {request.join_type}")
    
    try:
        # Simulate processing
        merge_id = f"merge_{int(os.urandom(4).hex(), 16)}"
        processing_time = round(time.time() - start_time, 2)
        
        result = {
            "success": True,
            "merge_id": merge_id,
            "message": f"Merged {request.file1} and {request.file2} using {request.join_type} join",
            "files": [request.file1, request.file2],
            "join_type": request.join_type,
            "join_columns": request.join_columns or "id",
            "processing_time": processing_time
        }
        
        logger.info(f"MERGE REQUEST COMPLETED:")
        logger.info(f"Success: {result.get('success', False)}")
        logger.info(f"Processing Time: {processing_time}s")
        
        return result
        
    except Exception as e:
        logger.error(f"MERGE REQUEST FAILED: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "processing_time": round(time.time() - start_time, 2)
        }
        return error_result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)

