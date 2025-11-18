"""
Trinity AI API - WebSocket Endpoint
===================================

Provides WebSocket endpoint for Trinity AI sequential execution.
Follows the Trinity AI streaming pattern for proper card and result handling.
"""

import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("trinity.trinityai.api")

# Create router
router = APIRouter(prefix="/streamai", tags=["TrinityAI"])

# Initialize components (will be set by main_api.py)
rag_engine = None
parameter_generator = None


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Trinity AI WebSocket"
    }


@router.websocket("/execute-ws")
async def execute_workflow_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time workflow execution.
    Implements the Trinity AI streaming pattern with events for card creation and result handling.
    
    Events sent to frontend:
    - connected: WebSocket ready
    - plan_generated: Workflow plan created
    - workflow_started: Execution began
    - step_started: Step execution started
    - card_created: Card created (frontend adds to Laboratory)
    - agent_executed: Atom executed with results (frontend calls atom handler)
    - step_completed: Step finished
    - workflow_completed: All steps done
    - error: Error occurred
    """
    await websocket.accept()
    logger.info("🔌 WebSocket connection accepted")
    
    try:
        # Import components
        from STREAMAI.websocket_orchestrator import StreamWebSocketOrchestrator
        from STREAMAI.result_storage import get_result_storage
        from STREAMAI.stream_rag_engine import get_stream_rag_engine
        
        # Get instances
        result_storage = get_result_storage()
        rag_engine_inst = get_stream_rag_engine()
        
        # Initialize orchestrator
        ws_orchestrator = StreamWebSocketOrchestrator(
            workflow_planner=None,  # Orchestrator has its own planner
            parameter_generator=parameter_generator,
            result_storage=result_storage,
            rag_engine=rag_engine_inst
        )
        
        # Wait for initial message from client
        message_data = await websocket.receive_text()
        message = json.loads(message_data)
        
        logger.info(f"📨 Received WebSocket message: {message.get('message', '')[:100]}...")
        
        # Extract parameters
        user_prompt = message.get("message", "")
        available_files = message.get("available_files", [])
        project_context = message.get("project_context", {})
        user_id = message.get("user_id", "default_user")
        session_id = message.get("session_id", None)  # Frontend chat session ID
        chat_id = message.get("chat_id", None)  # Frontend chat ID
        history_summary = message.get("history_summary")
        mentioned_files = message.get("mentioned_files") or []
        
        # 🔧 CRITICAL FIX: Extract project context from file paths if not provided or contains 'default' values
        # Check if project_context is missing, empty, or contains 'default' values
        has_valid_context = (
            project_context and 
            project_context.get("client_name") and 
            project_context.get("client_name") != "default" and
            project_context.get("app_name") and 
            project_context.get("app_name") != "default" and
            project_context.get("project_name") and 
            project_context.get("project_name") != "default"
        )
        
        if not has_valid_context:
            logger.warning("⚠️ No valid project_context provided (missing or contains 'default' values). Attempting to extract from file paths...")
            # Try to extract from available_files
            for file_path in available_files:
                if isinstance(file_path, str) and "/" in file_path:
                    parts = file_path.split("/")
                    if len(parts) >= 3:
                        extracted_client = parts[0]
                        extracted_app = parts[1]
                        extracted_project = parts[2]
                        project_context = {
                            "client_name": extracted_client,
                            "app_name": extracted_app,
                            "project_name": extracted_project
                        }
                        logger.info(f"✅ Extracted project context from file path: client={extracted_client}, app={extracted_app}, project={extracted_project}")
                        break
            
            # If still empty or contains 'default', try environment variables
            # Re-check validity after extraction attempt
            has_valid_context_after_extraction = (
                project_context and 
                project_context.get("client_name") and 
                project_context.get("client_name") != "default" and
                project_context.get("app_name") and 
                project_context.get("app_name") != "default" and
                project_context.get("project_name") and 
                project_context.get("project_name") != "default"
            )
            
            if not has_valid_context_after_extraction:
                import os
                env_client = os.getenv("CLIENT_NAME", "")
                env_app = os.getenv("APP_NAME", "")
                env_project = os.getenv("PROJECT_NAME", "")
                if env_client or env_app or env_project:
                    project_context = {
                        "client_name": env_client,
                        "app_name": env_app,
                        "project_name": env_project
                    }
                    logger.info(f"✅ Using project context from environment variables: client={env_client}, app={env_app}, project={env_project}")
                else:
                    logger.error("❌ Could not determine project context from message, files, or environment variables!")
                    logger.error(f"📦 Available files: {available_files}")
                    logger.error(f"📦 Message keys: {list(message.keys())}")
        
        logger.info(f"🔧 Final project_context: client={project_context.get('client_name', 'N/A')}, app={project_context.get('app_name', 'N/A')}, project={project_context.get('project_name', 'N/A')}")
        if isinstance(mentioned_files, str):
            mentioned_files = [mentioned_files]
        elif isinstance(mentioned_files, list):
            cleaned_files = []
            for entry in mentioned_files:
                if isinstance(entry, str):
                    cleaned_files.append(entry)
                elif isinstance(entry, bytes):
                    cleaned_files.append(entry.decode("utf-8", "ignore"))
            mentioned_files = cleaned_files
        else:
            mentioned_files = []
        
        logger.info(f"🔑 Session ID: {session_id}, Chat ID: {chat_id}")
        
        # Execute workflow with real-time events
        await ws_orchestrator.execute_workflow_with_websocket(
            websocket=websocket,
            user_prompt=user_prompt,
            available_files=available_files,
            project_context=project_context,
            user_id=user_id,
            frontend_session_id=session_id,
            frontend_chat_id=chat_id,
            history_override=history_summary,
            chat_file_names=mentioned_files,
        )
        
    except WebSocketDisconnect:
        logger.info("🔌 WebSocket disconnected")
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "error": str(e),
                "message": "Workflow execution failed"
            }))
        except:
            pass


def initialize_stream_ai_components(param_gen, rag):
    """Initialize Stream AI components for API endpoints"""
    global parameter_generator, rag_engine
    parameter_generator = param_gen
    rag_engine = rag
    logger.info("✅ Stream AI WebSocket components initialized")


# Export router
__all__ = ["router", "initialize_stream_ai_components"]
