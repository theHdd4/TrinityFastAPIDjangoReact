"""
Trinity AI API - WebSocket Endpoint
===================================

Provides WebSocket endpoint for Trinity AI sequential execution.
Follows the Trinity AI streaming pattern for proper card and result handling.
"""

import logging
import json
import uuid
from dataclasses import asdict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("trinity.trinityai.api")

# Create router
router = APIRouter(prefix="/streamai", tags=["TrinityAI"])


async def _safe_close_websocket(websocket: WebSocket, code: int = 1000, reason: str = "") -> None:
    """Close websocket with a status code while swallowing close errors."""
    try:
        # Skip if already closing/closed
        if getattr(websocket, "close_code", None):
            return
        if hasattr(websocket, "client_state") and websocket.client_state.name == "DISCONNECTED":
            return
        if hasattr(websocket, "application_state") and websocket.application_state.name == "DISCONNECTED":
            return

        await websocket.close(code=code, reason=reason[:120])
    except Exception as close_error:  # pragma: no cover - defensive
        logger.debug(f"WebSocket close failed (code={code}, reason={reason}): {close_error}")

# Initialize components (will be set by main_api.py)
rag_engine = None
parameter_generator = None

# Intent routing service (laboratory mode)
try:
    from STREAMAI.intent_service import intent_service
except ImportError:
    try:
        from .intent_service import intent_service
    except Exception:
        intent_service = None  # type: ignore


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
    - status: Status updates (Analyzing, Processing, Thinking)
    - text_reply: Direct text answer for general questions
    - complete: Request completed
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
    logger.info("=" * 80)
    logger.info("🔌 NEW WebSocket connection accepted")
    logger.info("=" * 80)

    close_code = 1000
    close_reason = "workflow_complete"

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
        logger.info("⏳ Waiting for message from client...")
        message_data = await websocket.receive_text()
        logger.info(f"📥 Raw message received (length: {len(message_data)} chars)")
        
        message = json.loads(message_data)
        logger.info(f"📦 Parsed message keys: {list(message.keys())}")
        
        # Extract user prompt first
        user_prompt = message.get("message", "")
        logger.info("=" * 80)
        logger.info(f"📨 NEW REQUEST RECEIVED: {user_prompt}")
        logger.info(f"📨 Full message: {json.dumps(message, indent=2)}")
        logger.info("=" * 80)
        
        # Step 1: Send "Analyzing the query..." message immediately
        await websocket.send_text(json.dumps({
            "type": "status",
            "message": "Analyzing the query...",
            "status": "analyzing"
        }))
        
        # Step 2: Intent Detection (BEFORE any workflow processing)
        try:
            from STREAMAI.main_app import _detect_intent_simple, _generate_text_reply_direct
        except ImportError:
            try:
                from .main_app import _detect_intent_simple, _generate_text_reply_direct
            except ImportError:
                # Fallback: define simple functions
                async def _detect_intent_simple(prompt):
                    return {"intent": "workflow", "confidence": 0.5}

                async def _generate_text_reply_direct(prompt):
                    return "I apologize, but I couldn't process your request."

        # Extract session_id early for intent caching
        session_id = message.get("session_id", None)  # Frontend chat session ID
        chat_id = message.get("chat_id", None)  # Frontend chat ID
        if not session_id:
            session_id = f"ws_{uuid.uuid4().hex[:8]}"
        available_files = message.get("available_files", [])

        # Laboratory intent routing
        intent_record = None
        decision = None
        policy_flip = False
        routing_payload = None
        if intent_service:
            previous_record = intent_service._intent_cache.get(session_id)
            intent_record = intent_service.infer_intent(
                user_prompt,
                session_id=session_id,
                available_files=available_files,
                mode="laboratory",
            )
            decision = intent_service.build_atom_binding(
                session_id,
                intent_record,
                available_files=available_files,
            )
            policy_flip = intent_service.detect_policy_flip(
                session_id, decision, previous_record=previous_record, available_files=available_files
            )

            routing_snapshot = {
                "path": decision.path,
                "rationale": decision.rationale,
                "goal_type": intent_record.goal_type,
                "required_tools": sorted(intent_record.required_tools),
                "output_format": intent_record.output_format,
            }
            logger.info("🧭 Intent routing snapshot: %s", routing_snapshot)

            routing_payload = asdict(decision)
            routing_payload["intent_record"] = intent_record.to_dict()
            routing_payload["session_id"] = session_id
            routing_payload["routing_snapshot"] = routing_snapshot
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "intent_debug",
                        "path": decision.path,
                        "intent_record": intent_record.to_dict(),
                        "rationale": decision.rationale,
                    }
                )
            )

            if decision.clarifications:
                await websocket.send_text(json.dumps({
                    "type": "clarification_required",
                    "message": "Please confirm: " + "; ".join(decision.clarifications),
                    "intent_record": intent_record.to_dict(),
                }))
                await websocket.close()
                return

            if policy_flip:
                await websocket.send_text(json.dumps({
                    "type": "policy_shift",
                    "message": "Detected a change in execution path; please confirm before continuing.",
                }))
                await websocket.close()
                return

            if decision.requires_files and not available_files:
                await websocket.send_text(json.dumps({
                    "type": "clarification_required",
                    "message": "I need a dataset or file to run Atom Agents. Upload a file and try again.",
                    "intent_record": intent_record.to_dict(),
                }))
                await websocket.close()
                return

        # Step 2: Intent Detection (ONCE at the start - like 28_NOV)
        # This is the ONLY place intent detection should happen for this WebSocket request
        # Use session_id for caching to prevent repeated detection
        logger.info("=" * 80)
        logger.info(f"🔍 STARTING INTENT DETECTION (ONCE at start)")
        logger.info(f"   User prompt: {user_prompt}")
        logger.info(f"   Session ID: {session_id} (for caching)")
        logger.info("=" * 80)

        intent_result = await _detect_intent_simple(user_prompt, session_id=session_id, use_cache=True)
        intent = intent_result.get("intent", "workflow")
        if decision:
            intent = "text_reply" if decision.path == "llm_only" else "workflow"

        if intent_service and decision:
            intent_service.update_scratchpad(session_id, f"Routing via {decision.path}: {decision.rationale}")

        logger.info("=" * 80)
        logger.info(f"✅ INTENT DETECTION RESULT (will NOT be called again):")
        logger.info(f"   Intent: {intent}")
        logger.info(f"   Confidence: {intent_result.get('confidence', 0.5):.2f}")
        logger.info(f"   Reasoning: {intent_result.get('reasoning', 'N/A')}")
        logger.info(f"🔒 Intent detection CACHED for session {session_id} - will NOT be called again")
        if intent_record:
            logger.info(
                "📘 Intent record: goal=%s tools=%s output=%s", intent_record.goal_type, intent_record.required_tools, intent_record.output_format
            )
        logger.info("=" * 80)
        
        # Step 3: Route based on intent
        # If text_reply -> return immediately (no workflow execution)
        if intent == "text_reply":
            # Handle as text reply - direct LLM response
            logger.info("📝 Routing to text reply handler")
            
            # Send "Generating answer..." message
            await websocket.send_text(json.dumps({
                "type": "status",
                "message": "Generating answer...",
                "status": "thinking"
            }))
            
            # Generate text reply
            text_response = await _generate_text_reply_direct(user_prompt)
            logger.info(f"✅ Generated text reply: {text_response[:100]}...")

            if intent_service:
                intent_service.update_scratchpad(session_id, "Answered via LLM-only path (websocket)")
            
            # Send the answer
            await websocket.send_text(json.dumps({
                "type": "text_reply",
                "message": text_response,
                "intent": "text_reply",
                "session_id": message.get("session_id", "unknown")
            }))
            
            # Send completion
            await websocket.send_text(json.dumps({
                "type": "complete",
                "status": "completed",
                "intent": "text_reply"
            }))
            
            logger.info("✅ Text reply sent, closing connection")
            await websocket.close()
            return
        
        # Step 4: Handle as workflow (intent already detected above - no need to detect again)
        logger.info("🔄 Routing to workflow handler")
        logger.info("ℹ️ Intent detection already done - proceeding with workflow execution (will NOT detect intent again)")
        
        # Send "Processing workflow..." message
        await websocket.send_text(json.dumps({
            "type": "status",
            "message": "Processing workflow...",
            "status": "processing"
        }))
        
        # Extract remaining parameters for workflow
        # Note: session_id and chat_id already extracted above for intent caching
        available_files = message.get("available_files", [])
        project_context = message.get("project_context", {})
        user_id = message.get("user_id", "default_user")
        history_summary = message.get("history_summary")
        mentioned_files = message.get("mentioned_files") or []
        
        # 🔧 CRITICAL FIX: Extract project context from file paths if not provided or contains 'default' values
        # Check if project_context is missing, empty, or contains 'default' values
        has_valid_context = (
            project_context and 
            isinstance(project_context, dict) and
            project_context.get("client_name") and 
            project_context.get("client_name") != "default" and
            project_context.get("app_name") and 
            project_context.get("app_name") != "default" and
            project_context.get("project_name") and 
            project_context.get("project_name") != "default"
        )
        
        if not has_valid_context:
            logger.warning("⚠️ No valid project_context provided (missing or contains 'default' values). Attempting to extract from file paths...")
            logger.info(f"📦 Current project_context: {project_context}")
            logger.info(f"📦 Available files: {available_files}")
            
            # Try to extract from available_files
            extracted_context = None
            for file_path in available_files:
                if isinstance(file_path, str) and "/" in file_path:
                    # Handle both forward and backslash paths
                    normalized_path = file_path.replace("\\", "/")
                    parts = normalized_path.split("/")
                    logger.info(f"🔍 Parsing file path: {file_path} -> {parts}")
                    
                    if len(parts) >= 3:
                        extracted_client = parts[0]
                        extracted_app = parts[1]
                        extracted_project = parts[2]
                        extracted_context = {
                            "client_name": extracted_client,
                            "app_name": extracted_app,
                            "project_name": extracted_project,
                            "available_files": available_files  # Preserve available_files
                        }
                        logger.info(f"✅ Extracted project context from file path '{file_path}':")
                        logger.info(f"   client_name: {extracted_client}")
                        logger.info(f"   app_name: {extracted_app}")
                        logger.info(f"   project_name: {extracted_project}")
                        break
            
            if extracted_context:
                project_context = extracted_context
            else:
                # If still empty or contains 'default', try environment variables
                import os
                env_client = os.getenv("CLIENT_NAME", "")
                env_app = os.getenv("APP_NAME", "")
                env_project = os.getenv("PROJECT_NAME", "")
                if env_client or env_app or env_project:
                    project_context = {
                        "client_name": env_client,
                        "app_name": env_app,
                        "project_name": env_project,
                        "available_files": available_files
                    }
                    logger.info(f"✅ Using project context from environment variables: client={env_client}, app={env_app}, project={env_project}")
                else:
                    logger.error("❌ Could not determine project context from message, files, or environment variables!")
                    logger.error(f"📦 Available files: {available_files}")
                    logger.error(f"📦 Message keys: {list(message.keys())}")
                    # Set empty context but preserve available_files
                    project_context = {
                        "client_name": "",
                        "app_name": "",
                        "project_name": "",
                        "available_files": available_files
                    }
        
        # Ensure available_files is included in project_context
        if "available_files" not in project_context:
            project_context["available_files"] = available_files
        
        logger.info(f"🔧 Final project_context: client={project_context.get('client_name', 'N/A')}, app={project_context.get('app_name', 'N/A')}, project={project_context.get('project_name', 'N/A')}")
        logger.info(f"📦 Final available_files count: {len(project_context.get('available_files', []))}")
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
        
        if routing_payload is not None:
            project_context["intent_routing"] = routing_payload

        logger.info(f"🔑 Session ID: {session_id}, Chat ID: {chat_id}")
        
        # Execute workflow with real-time events (intent detection already done above - NOT called again)
        try:
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
                intent_route=routing_payload,
            )
        except Exception as workflow_error:
            error_msg = str(workflow_error)
            logger.warning(f"⚠️ Workflow execution failed: {error_msg}")
            close_code = 1011
            close_reason = error_msg[:120] or "workflow_error"

            # Check if it's because the request can't be handled as a workflow
            if ("atom_id" in error_msg.lower() and "null" in error_msg.lower()) or \
               "outside the scope" in error_msg.lower() or \
               "cannot be fulfilled" in error_msg.lower() or \
               "cannot infer atom_id" in error_msg.lower():
                # Fallback to text reply
                logger.info("⚠️ Workflow cannot handle request, falling back to text reply")
                
                await websocket.send_text(json.dumps({
                    "type": "status",
                    "message": "Generating answer...",
                    "status": "thinking"
                }))
                
                text_response = await _generate_text_reply_direct(user_prompt)
                
                await websocket.send_text(json.dumps({
                    "type": "text_reply",
                    "message": text_response,
                    "intent": "text_reply",
                    "session_id": session_id
                }))
                
                await websocket.send_text(json.dumps({
                    "type": "complete",
                    "status": "completed",
                    "intent": "text_reply"
                }))
                close_code = 1000
                close_reason = "fallback_text_reply"
            else:
                # Real error - send error message
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"I encountered an error: {error_msg}",
                    "error": error_msg
                }))
                close_code = 1011
                close_reason = "workflow_error"
        
    except WebSocketDisconnect as ws_exc:
        logger.info("🔌 WebSocket disconnected")
        close_code = ws_exc.code or close_code
        close_reason = ws_exc.reason or "client_disconnected"
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        close_code = 1011
        close_reason = str(e)[:120] or "websocket_error"
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "error": str(e),
                "message": "Workflow execution failed"
            }))
        except:
            pass
    finally:
        await _safe_close_websocket(websocket, code=close_code, reason=close_reason)


def initialize_stream_ai_components(param_gen, rag):
    """Initialize Stream AI components for API endpoints"""
    global parameter_generator, rag_engine
    parameter_generator = param_gen
    rag_engine = rag
    logger.info("✅ Stream AI WebSocket components initialized")


# Export router
__all__ = ["router", "initialize_stream_ai_components"]
