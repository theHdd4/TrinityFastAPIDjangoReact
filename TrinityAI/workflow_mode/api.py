"""
Workflow Mode API
Separate from SuperAgent API - handles workflow composition requests
Following the same pattern as merge/concat main_app.py
"""

import os
import sys
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
import json
from pathlib import Path

# Add parent directory to path
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from workflow_mode.llm_workflow_agent import get_workflow_composition_agent
from workflow_mode.workflow_agent import get_workflow_agent


def get_llm_config() -> Dict[str, str]:
    """Return LLM configuration using environment variables.

    Duplicated here to avoid importing from main_api, which would create a
    circular dependency when main_api wants to include this router.
    """

    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

logger = logging.getLogger("trinity.workflow_api")

# Initialize workflow composition agent
config = get_llm_config()
workflow_agent = get_workflow_composition_agent(
    api_url=config["api_url"],
    model_name=config["model_name"],
    bearer_token=config["bearer_token"]
)

# Create router for Workflow Mode endpoints
router = APIRouter(prefix="/workflow", tags=["Workflow Mode"])


class WorkflowRequest(BaseModel):
    """Request model for workflow composition"""
    message: str
    session_id: Optional[str] = None
    workflow_context: Optional[Dict[str, Any]] = None


class WorkflowResponse(BaseModel):
    """Response model for workflow composition"""
    success: bool
    session_id: str
    message: str
    molecules: list = []
    workflow_suggestions: dict = {}
    mode: str = "workflow_composition"


class MoleculeHelpRequest(BaseModel):
    """Request for molecule creation help"""
    molecule_description: str


@router.post("/compose")
async def compose_workflow(request: WorkflowRequest):
    """
    Workflow composition endpoint
    Returns molecule suggestions, does NOT execute agents
    
    This is SEPARATE from SuperAgent - it only helps design workflows
    Following the same pattern as merge/concat endpoints
    """
    try:
        logger.info(f"🔧 Workflow composition request: {request.message[:100]}...")
        logger.info(f"Session ID: {request.session_id}")
        logger.info(f"Workflow Context: {request.workflow_context}")
        
        # Process request using workflow composition agent
        result = workflow_agent.process_request(
            user_prompt=request.message,
            session_id=request.session_id,
            workflow_context=request.workflow_context
        )
        
        logger.info(f"✅ Workflow composition result: success={result.get('success')}")
        
        # Extract molecules if present
        molecules = []
        if result.get('success') and result.get('workflow_composition'):
            molecules = result['workflow_composition'].get('molecules', [])
        
        return {
            "success": result.get('success', False),
            "session_id": result.get('session_id'),
            "message": result.get('message', ''),
            "smart_response": result.get('smart_response', ''),
            "molecules": molecules,
            "workflow_suggestions": result.get('workflow_composition', {}) if result.get('success') else {},
            "auto_create": True,  # Flag to automatically create molecules
            "execution_plan": result.get('execution_plan', []),  # Step-by-step execution plan
            "mode": "workflow_composition"
        }
        
    except Exception as e:
        logger.error(f"❌ Error in workflow composition: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Workflow composition failed: {str(e)}"
        )


@router.post("/molecule-help")
async def get_molecule_help(request: MoleculeHelpRequest):
    """
    Get help creating a specific molecule
    Suggests which atoms to include
    """
    try:
        # Use the LLM agent to get intelligent suggestions
        result = workflow_agent.process_request(
            user_prompt=f"What atoms should I include in a molecule for: {request.molecule_description}",
            session_id=None
        )
        return result
    except Exception as e:
        logger.error(f"❌ Error getting molecule help: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def validate_workflow(molecules: list):
    """
    Validate workflow structure
    Checks if molecules are properly sequenced
    """
    try:
        agent = get_workflow_agent()
        result = agent.validate_workflow_structure(molecules)
        return result
    except Exception as e:
        logger.error(f"❌ Error validating workflow: {e}")
        return {
            "valid": False,
            "issues": [str(e)],
            "suggestions": []
        }


@router.websocket("/compose-ws")
async def compose_workflow_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time workflow composition
    Provides streaming responses for molecule suggestions
    Same pattern as SuperAgent WebSocket but for workflow composition
    """
    await websocket.accept()
    logger.info("🔌 Workflow composition WebSocket connected")
    
    try:
        # Receive message from client
        data = await websocket.receive_text()
        request_data = json.loads(data)
        
        message = request_data.get("message", "")
        session_id = request_data.get("session_id", None)
        workflow_context = request_data.get("workflow_context", None)
        
        # Extract project context for MinIO path resolution
        client_name = request_data.get("client_name", "")
        app_name = request_data.get("app_name", "")
        project_name = request_data.get("project_name", "")
        
        # If context is empty, use get_minio_config() (SIMPLER, SAME AS CONCAT ACTUALLY USES)
        if not client_name and not app_name and not project_name:
            logger.info("🔍 No context in request, using get_minio_config() to get current path...")
            try:
                from main_api import get_minio_config
                minio_config = get_minio_config()
                prefix = minio_config.get('prefix', '')
                
                logger.info(f"✅ MinIO config prefix: {prefix}")
                
                # Extract client/app/project from prefix
                if prefix and prefix != "":
                    parts = prefix.rstrip('/').split('/')
                    if len(parts) >= 3:
                        client_name = parts[0]
                        app_name = parts[1]
                        project_name = parts[2]
                        logger.info(f"✅ Extracted from prefix: {client_name}/{app_name}/{project_name}")
                    else:
                        logger.warning(f"⚠️ Prefix format unexpected: {prefix}")
                else:
                    logger.warning(f"⚠️ Empty prefix from get_minio_config()")
                
            except Exception as e:
                logger.warning(f"⚠️ Failed to get minio config: {e}")
                import traceback
                traceback.print_exc()
        
        logger.info(f"📨 WS Workflow request: {message[:100]}...")
        logger.info(f"🔧 Project context FINAL: {client_name}/{app_name}/{project_name}")
        
        # Set context on FileHandler before processing (if available)
        if hasattr(workflow_agent, 'file_handler') and workflow_agent.file_handler:
            try:
                logger.info(f"🔧 Setting FileHandler context with: {client_name}/{app_name}/{project_name}")
                workflow_agent.file_handler.set_context(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                logger.info("✅ Set FileHandler context for workflow agent")
                
            except Exception as e:
                logger.warning(f"⚠️ Failed to set FileHandler context: {e}")
                import traceback
                traceback.print_exc()
        
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to Workflow Composition Assistant"
        })
        
        # Send thinking status
        await websocket.send_json({
            "type": "thinking",
            "message": "Analyzing your workflow request and searching for matching patterns..."
        })
        
        # Process request using LLM agent
        result = workflow_agent.process_request(
            user_prompt=message,
            session_id=session_id,
            workflow_context=workflow_context
        )
        
        logger.info(f"✅ Workflow composition result: success={result.get('success')}")
        
        # Send molecule suggestions if successful
        if result.get('success') and result.get('workflow_composition'):
            molecules = result['workflow_composition'].get('molecules', [])
            
            await websocket.send_json({
                "type": "molecules_suggested",
                "molecules": molecules,
                "workflow_name": result['workflow_composition'].get('workflow_name'),
                "total_molecules": result['workflow_composition'].get('total_molecules'),
                "business_value": result['workflow_composition'].get('business_value')
            })
        
        # Send smart response (the main chat message)
        await websocket.send_json({
            "type": "message",
            "role": "assistant",
            "content": result.get('smart_response', result.get('message', '')),
            "timestamp": request_data.get("timestamp", "")
        })
        
        # Send final response with all data - ensure all keys are present
        response_data = {
            "type": "response",
            "success": result.get('success', False),
            "session_id": result.get('session_id', ''),
            "workflow_composition": result.get('workflow_composition', None),
            "smart_response": result.get('smart_response', ''),
            "reasoning": result.get('reasoning', ''),
            "suggestions": result.get('suggestions', []),
            "message": result.get('message', ''),
            "auto_create": result.get('auto_create', False),  # Flag to automatically create molecules
            "execution_plan": result.get('execution_plan', []),  # Step-by-step execution plan
            "mode": "workflow_composition"
        }
        
        # Add 'answer' field if present (for direct answers to questions when success=false)
        if 'answer' in result:
            response_data['answer'] = result['answer']
        
        # Add 'error' field if present (for error cases)
        if 'error' in result:
            response_data['error'] = result['error']
        
        await websocket.send_json(response_data)
        
        # Send completion
        await websocket.send_json({
            "type": "complete",
            "message": "Workflow composition complete"
        })
        
    except WebSocketDisconnect:
        logger.info("🔌 Workflow WebSocket disconnected")
    except Exception as e:
        logger.error(f"❌ Workflow WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e),
                "message": "An error occurred while processing your workflow request"
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass


@router.get("/health")
async def health_check():
    """Health check for Workflow Mode API"""
    return {
        "status": "healthy",
        "service": "Workflow Composition Agent",
        "mode": "workflow_design",
        "message": "Workflow Agent is ready to help design workflows"
    }


@router.get("/use-cases")
async def list_use_cases():
    """
    List all available use case workflows
    Returns predefined workflows like MMM, churn prediction, etc.
    """
    try:
        use_cases = workflow_agent.rag.use_case_workflows.get('use_case_workflows', {})
        
        use_case_list = []
        for key, data in use_cases.items():
            use_case_list.append({
                "key": key,
                "name": data['name'],
                "description": data['description'],
                "industry": data.get('industry', ''),
                "total_molecules": len(data.get('molecules', [])),
                "business_value": data.get('business_value', '')
            })
        
        return {
            "success": True,
            "use_cases": use_case_list,
            "total": len(use_case_list)
        }
    except Exception as e:
        logger.error(f"❌ Error listing use cases: {e}")
        return {
            "success": False,
            "error": str(e),
            "use_cases": []
        }


@router.get("/use-cases/{use_case_key}")
async def get_use_case_details(use_case_key: str):
    """
    Get detailed molecule composition for a specific use case
    """
    try:
        use_case = workflow_agent.rag.get_use_case_workflow(use_case_key)
        
        if not use_case:
            return {
                "success": False,
                "error": f"Use case '{use_case_key}' not found"
            }
        
        return {
            "success": True,
            "use_case": use_case
        }
    except Exception as e:
        logger.error(f"❌ Error getting use case: {e}")
        return {
            "success": False,
            "error": str(e)
        }

