"""
Trinity AI Streaming Application
================================

FastAPI router for Trinity AI streaming endpoints.
Provides chat interface, sequence generation, execution, and status monitoring.
"""

import logging
import sys
import json
import uuid
import re
import aiohttp
from dataclasses import asdict
from typing import Dict, Any, Optional, List
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("trinity.trinityai")

# Add parent directory to path
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

# Import Trinity AI components
try:
    from STREAMAI.react_workflow_orchestrator import get_react_orchestrator
    from STREAMAI.stream_orchestrator import get_orchestrator
    from STREAMAI.result_storage import get_result_storage
    from STREAMAI.intent_service import intent_service
    STREAMAI_AVAILABLE = True
    REACT_AVAILABLE = True
    logger.info("✅ Trinity AI components imported successfully")
except ImportError as e:
    try:
        # Try relative imports first (Docker), then absolute (local dev)
        try:
            from .react_workflow_orchestrator import get_react_orchestrator
            from .stream_orchestrator import get_orchestrator
            from .result_storage import get_result_storage
            from .intent_service import intent_service
            STREAMAI_AVAILABLE = True
            REACT_AVAILABLE = True
            logger.info("✅ Trinity AI components imported successfully (relative)")
        except ImportError:
            try:
                from STREAMAI.react_workflow_orchestrator import get_react_orchestrator
                from STREAMAI.stream_orchestrator import get_orchestrator
                from STREAMAI.result_storage import get_result_storage
                from STREAMAI.intent_service import intent_service
                STREAMAI_AVAILABLE = True
                REACT_AVAILABLE = True
                logger.info("✅ Trinity AI components imported successfully (absolute)")
            except ImportError:
                # Fallback: direct imports (if in same directory)
                try:
                    from react_workflow_orchestrator import get_react_orchestrator
                    from stream_orchestrator import get_orchestrator
                    from result_storage import get_result_storage
                    from intent_service import intent_service
                    STREAMAI_AVAILABLE = True
                    REACT_AVAILABLE = True
                    logger.info("✅ Trinity AI components imported successfully (direct)")
                except ImportError as e3:
                    logger.error(f"❌ Trinity AI components not available: {e3}")
                    STREAMAI_AVAILABLE = False
                    REACT_AVAILABLE = False
                    # Create stub functions
                    def get_react_orchestrator():
                        return None
                    def get_orchestrator():
                        return None
                    def get_result_storage():
                        return None
    except Exception as e2:
        STREAMAI_AVAILABLE = False
        REACT_AVAILABLE = False
        logger.error(f"❌ Trinity AI components not available: {e} | {e2}")

# Create router for HTTP endpoints (ONCE - removed duplicate)
router = APIRouter(prefix="/streamai", tags=["TrinityAI"])


# Request/Response models
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    file_context: Optional[Dict[str, Any]] = None


class GenerateSequenceRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    file_context: Optional[Dict[str, Any]] = None


class ExecuteSequenceRequest(BaseModel):
    sequence: Dict[str, Any]
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    sequence: Optional[Dict[str, Any]] = None


class SequenceResponse(BaseModel):
    success: bool
    sequence: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    session_id: str


class ExecutionResponse(BaseModel):
    success: bool
    session_id: str
    execution_result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class StatusResponse(BaseModel):
    success: bool
    session_id: str
    status: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ResultsResponse(BaseModel):
    success: bool
    session_id: str
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# Session-level intent cache to prevent repeated intent detection
# Once intent is detected for a session, it's cached and never called again
_intent_cache: Dict[str, Dict[str, Any]] = {}

def clear_intent_cache(session_id: Optional[str] = None):
    """
    Clear intent detection cache.
    
    Args:
        session_id: If provided, clear only this session's cache. 
                   If None, clear all cached intents.
    """
    if session_id:
        if session_id in _intent_cache:
            del _intent_cache[session_id]
            logger.info(f"🗑️ Cleared intent cache for session {session_id}")
    else:
        _intent_cache.clear()
        logger.info("🗑️ Cleared all intent cache")

# Helper functions for intent detection and text replies
async def _detect_intent_simple(user_prompt: str, session_id: Optional[str] = None, use_cache: bool = True) -> Dict[str, Any]:
    """
    Simple intent detection using LLM.
    Returns intent classification.
    
    Args:
        user_prompt: User's prompt to classify
        session_id: Optional session ID for caching (prevents repeated detection)
        use_cache: Whether to use cached result if available (default: True)
    
    Returns:
        Dict with intent, confidence, and reasoning
    """
    # Check cache first if session_id provided and caching enabled
    if use_cache and session_id and session_id in _intent_cache:
        cached_result = _intent_cache[session_id]
        logger.info(f"✅ Using CACHED intent detection result for session {session_id}: {cached_result.get('intent')}")
        return cached_result
    try:
        # Use centralized settings
        try:
            from BaseAgent.config import settings
            config = settings.get_llm_config()
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.config import settings
                config = settings.get_llm_config()
            except ImportError:
                # Fallback
                from main_api import get_llm_config
                config = get_llm_config()
        
        api_url = config["api_url"]
        model_name = config["model_name"]
        bearer_token = config["bearer_token"]
        
        intent_prompt = f"""You are an intelligent intent classifier for Trinity AI.

**USER PROMPT**: "{user_prompt}"

## Your Task:

Classify the user's intent into one of two categories:

1. **"text_reply"**: Simple questions, explanations, general knowledge, or conversational queries that can be answered with text only. Examples:
   - "What is machine learning?"
   - "How does data analysis work?"
   - "What is the capital of India?"
   - "Explain regression"
   - General knowledge questions
   - Questions that don't require data processing

2. **"workflow"**: Data science tasks, data processing, analysis, transformations, or operations that require:
   - Working with data files
   - Data transformations
   - Data analysis
   - Creating charts/visualizations
   - Data cleaning or processing
   - Statistical operations
   - Machine learning operations
   - Any task that needs to process or analyze data

## Output Format:

Return ONLY a valid JSON object (no other text):

```json
{{
  "intent": "text_reply" or "workflow",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this classification"
}}
```

Now classify the intent:"""
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {bearer_token}"
        }
        
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": intent_prompt}],
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 500
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                api_url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                response.raise_for_status()
                result = await response.json()
                message_content = result.get("message", {}).get("content", "")
                
                if not message_content:
                    logger.warning("⚠️ Empty LLM response for intent detection, defaulting to workflow")
                    result = {"intent": "workflow", "confidence": 0.5, "reasoning": "Empty response"}
                    # Cache the result if session_id provided
                    if session_id:
                        _intent_cache[session_id] = result
                        logger.info(f"💾 Cached intent detection result (empty response) for session {session_id}")
                    return result
                
                # Extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', message_content)
                if json_match:
                    intent_result = json.loads(json_match.group(0))
                    intent = intent_result.get("intent", "workflow")
                    if intent not in ["workflow", "text_reply"]:
                        intent = "workflow"
                    result = {
                        "intent": intent,
                        "confidence": float(intent_result.get("confidence", 0.5)),
                        "reasoning": intent_result.get("reasoning", "No reasoning provided")
                    }
                    # Cache the result if session_id provided
                    if session_id:
                        _intent_cache[session_id] = result
                        logger.info(f"💾 Cached intent detection result for session {session_id}: {intent}")
                    return result
                else:
                    logger.warning("⚠️ Could not parse intent JSON, defaulting to workflow")
                    result = {"intent": "workflow", "confidence": 0.5, "reasoning": "Parse error"}
                    # Cache the result if session_id provided
                    if session_id:
                        _intent_cache[session_id] = result
                        logger.info(f"💾 Cached intent detection result for session {session_id}")
                    return result
                    
    except Exception as e:
        logger.error(f"❌ Error in intent detection: {e}")
        result = {"intent": "workflow", "confidence": 0.5, "reasoning": f"Error: {str(e)}"}
        # Cache the result if session_id provided
        if session_id:
            _intent_cache[session_id] = result
            logger.info(f"💾 Cached intent detection result (error case) for session {session_id}")
        return result


async def _generate_text_reply_direct(user_prompt: str) -> str:
    """
    Generate direct text reply using LLM for general questions.
    """
    try:
        # Use centralized settings
        try:
            from BaseAgent.config import settings
            config = settings.get_llm_config()
        except ImportError:
            try:
                from TrinityAgent.BaseAgent.config import settings
                config = settings.get_llm_config()
            except ImportError:
                # Fallback
                from main_api import get_llm_config
                config = get_llm_config()
        
        api_url = config["api_url"]
        model_name = config["model_name"]
        bearer_token = config["bearer_token"]
        
        prompt = f"""You are a helpful AI assistant. Answer the user's question clearly and concisely.

**User Question**: "{user_prompt}"

Provide a clear, helpful answer to this question. Be informative and friendly."""
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {bearer_token}"
        }
        
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": 0.7,
                "num_predict": 2000
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                api_url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                response.raise_for_status()
                result = await response.json()
                message_content = result.get("message", {}).get("content", "")
                
                if not message_content:
                    return "I apologize, but I couldn't generate a response. Please try rephrasing your question."
                
                return message_content
                
    except Exception as e:
        logger.error(f"❌ Error generating text reply: {e}")
        return f"I apologize, but I encountered an error while processing your question: {str(e)}"


# Initialize components
react_orchestrator = None
orchestrator = None
result_storage = None

if STREAMAI_AVAILABLE:
    try:
        # Initialize ReAct orchestrator (primary)
        if REACT_AVAILABLE:
            try:
                react_orchestrator = get_react_orchestrator()
                logger.info("✅ ReAct orchestrator initialized")
            except Exception as e:
                logger.error(f"❌ Could not initialize ReAct orchestrator: {e}")
                REACT_AVAILABLE = False
        
        # Initialize supporting components
        orchestrator = get_orchestrator()
        result_storage = get_result_storage()
        logger.info("✅ Trinity AI components initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Trinity AI components: {e}")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Chat interface for Trinity AI.
    Uses intent detection to route to appropriate handler:
    - text_reply: Direct LLM response
    - workflow: ReAct workflow orchestrator
    
    Args:
        request: Chat request with message
        
    Returns:
        Chat response with results
    """
    if not STREAMAI_AVAILABLE:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"💬 Trinity AI chat request: {request.message[:100]}...")

    try:
        # Generate session ID if not provided
        session_id = request.session_id or f"stream_{uuid.uuid4().hex[:16]}"

        # Laboratory-mode intent extraction and routing (persists per session)
        file_list = None
        if request.file_context and isinstance(request.file_context, dict):
            file_list = request.file_context.get("files") or request.file_context.get("available_files")
        previous_record = intent_service._intent_cache.get(session_id)
        intent_record = intent_service.infer_intent(
            request.message,
            session_id=session_id,
            available_files=file_list or [],
            mode="laboratory",
        )
        decision = intent_service.build_atom_binding(
            session_id,
            intent_record,
            available_files=file_list or [],
        )
        policy_flip = intent_service.detect_policy_flip(
            session_id,
            decision,
            previous_record=previous_record,
            available_files=file_list or [],
        )

        # Ask for clarification before executing high-impact actions
        if decision.clarifications:
            clarification_msg = "I need to confirm a couple of details before running this: " + "; ".join(decision.clarifications)
            logger.info("⚠️ Clarification needed before proceeding: %s", clarification_msg)
            intent_service.update_scratchpad(session_id, f"Clarification requested: {clarification_msg}")
            return ChatResponse(response=clarification_msg, session_id=session_id, sequence=None)

        if policy_flip:
            flip_msg = (
                "Your latest message changes the execution path. Confirm if you want me to switch tools before proceeding."
            )
            intent_service.update_scratchpad(session_id, "Policy flip detected; awaiting confirmation")
            return ChatResponse(response=flip_msg, session_id=session_id, sequence=None)

        # Step 1: Intent Detection (ONCE at the start - like 28_NOV)
        # This is the ONLY place intent detection should happen for this request
        # Use session_id for caching to prevent repeated detection
        intent = "text_reply" if decision.path == "llm_only" else "workflow"
        logger.info(
            "✅ Intent record built for session %s | path=%s | goal=%s | tools=%s",
            session_id,
            decision.path,
            intent_record.goal_type,
            ",".join(sorted(intent_record.required_tools)) or "none",
        )
        logger.info("🔒 Intent record persisted for session %s", session_id)

        intent_route = None

        # Step 2: Route based on intent
        # If text_reply -> return immediately (no workflow execution)
        if intent == "text_reply":
            # Handle as text reply - direct LLM response
            logger.info("📝 Handling as text reply")
            text_response = await _generate_text_reply_direct(request.message)

            intent_service.update_scratchpad(session_id, "Answered via LLM-only path")
            return ChatResponse(
                response=text_response,
                session_id=session_id,
                sequence=None
            )

        # Step 3: Handle as workflow (intent already detected above - no need to detect again)
        logger.info("🔄 Handling as workflow - routing to ReAct orchestrator")
        logger.info("ℹ️ Intent detection already done - proceeding with workflow execution")

        if decision:
            intent_route = asdict(decision)
            intent_route["intent_record"] = intent_record.to_dict()
            intent_route["session_id"] = session_id
            intent_service.update_scratchpad(session_id, f"Executing via {decision.path} with goal {intent_record.goal_type}")
        
        # Use ReAct orchestrator if available, otherwise fallback
        if REACT_AVAILABLE and react_orchestrator:
            # Execute ReAct workflow (intent detection NOT called here - already done above)
            result = await react_orchestrator.execute_workflow(
                user_prompt=request.message,
                session_id=session_id,
                file_context=request.file_context,
                intent_route=intent_route,
            )
            
            if not result.get("success"):
                return ChatResponse(
                    response=f"I encountered an error: {result.get('error', 'Unknown error')}",
                    session_id=session_id,
                    sequence=None
                )
            
            # Build response message from workflow result
            execution_results = result.get("execution_results", [])
            final_insight = result.get("final_insight", "")
            workflow_record = result.get("workflow_record", {})
            
            # Check if workflow failed or couldn't execute
            if not result.get("success") or not execution_results:
                error_msg = result.get("error", "Workflow execution failed")
                # Check if it's because the request can't be handled as a workflow
                if "outside the scope" in error_msg.lower() or "cannot be fulfilled" in error_msg.lower():
                    # Fallback to text reply
                    logger.info("⚠️ Workflow cannot handle request, falling back to text reply")
                    text_response = await _generate_text_reply_direct(request.message)
                    return ChatResponse(
                        response=text_response,
                        session_id=session_id,
                        sequence=None
                    )
                else:
                    response_msg = f"I encountered an error while processing your request: {error_msg}"
            else:
                # Successful workflow execution
                response_msg = f"I've completed your request using {len(execution_results)} steps.\n\n"
                
                if final_insight:
                    response_msg += f"**Summary:**\n{final_insight}\n\n"
                
                # Add step summaries
                if execution_results:
                    response_msg += "**Steps Executed:**\n"
                    for step in execution_results:
                        step_num = step.get("step_number", 0)
                        atom_id = step.get("atom_id", "unknown")
                        success = "✅" if step.get("success") else "❌"
                        response_msg += f"{success} Step {step_num}: {atom_id}\n"
            
            logger.info(f"✅ ReAct workflow completed for session {session_id}")
            
            return ChatResponse(
                response=response_msg,
                session_id=session_id,
                sequence=result.get("final_response")
            )
        else:
            # ReAct orchestrator not available
            return ChatResponse(
                response="I'm sorry, but the AI workflow system is currently unavailable. Please try again later or contact support.",
                session_id=session_id,
                sequence=None
            )
    
    except Exception as e:
        logger.error(f"❌ Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-sequence", response_model=SequenceResponse)
async def generate_sequence(request: GenerateSequenceRequest) -> SequenceResponse:
    """
    Generate an atom sequence from a query.
    Uses ReAct orchestrator for intelligent workflow generation.
    
    Args:
        request: Generate sequence request
        
    Returns:
        Sequence response
    """
    if not STREAMAI_AVAILABLE:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"🔄 Generating sequence for: {request.query[:100]}...")
    
    try:
        # Generate session ID if not provided
        session_id = request.session_id or f"stream_{uuid.uuid4().hex[:16]}"
        
        # Use ReAct orchestrator if available
        if REACT_AVAILABLE and react_orchestrator:
            # Execute workflow (which includes sequence generation)
            result = await react_orchestrator.execute_workflow(
                user_prompt=request.query,
                session_id=session_id,
                file_context=request.file_context
            )
            
            if not result.get("success"):
                return SequenceResponse(
                    success=False,
                    sequence=None,
                    error=result.get("error", "Failed to generate workflow"),
                    session_id=session_id
                )
            
            # Convert ReAct result to sequence format for compatibility
            atoms_executed = result.get("atoms_executed", [])
            sequence = {
                "sequence": [
                    {
                        "step": i + 1,
                        "atom_id": atom.get("atom_id", "unknown"),
                        "purpose": atom.get("purpose", ""),
                        "prompt": atom.get("prompt", ""),
                        "parameters": atom.get("parameters", {}),
                        "inputs": atom.get("inputs", []),
                        "output_name": atom.get("output_name", f"output_{i+1}")
                    }
                    for i, atom in enumerate(atoms_executed)
                ],
                "total_atoms": len(atoms_executed),
                "estimated_duration": "Variable",
                "reasoning": "Generated using ReAct workflow orchestrator"
            }
            
            logger.info(f"✅ Sequence generated successfully using ReAct")
            
            return SequenceResponse(
                success=True,
                sequence=sequence,
                error=None,
                session_id=session_id
            )
        else:
            # ReAct orchestrator not available
            return SequenceResponse(
                success=False,
                sequence=None,
                error="ReAct orchestrator is not available. Please ensure all components are properly initialized.",
                session_id=session_id
            )
    
    except Exception as e:
        logger.error(f"❌ Error generating sequence: {e}")
        return SequenceResponse(
            success=False,
            sequence=None,
            error=str(e),
            session_id=request.session_id or "unknown"
        )


@router.post("/execute-sequence", response_model=ExecutionResponse)
async def execute_sequence(request: ExecuteSequenceRequest) -> ExecutionResponse:
    """
    Execute an atom sequence.
    
    Args:
        request: Execute sequence request
        
    Returns:
        Execution response
    """
    if not STREAMAI_AVAILABLE or not orchestrator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"🚀 Executing sequence for session {request.session_id}")
    
    try:
        # Generate session ID if not provided
        session_id = request.session_id or f"stream_{uuid.uuid4().hex[:16]}"
        
        # Execute sequence (now async)
        result = await orchestrator.execute_sequence(
            request.sequence,
            session_id
        )
        
        logger.info(f"✅ Sequence execution completed")
        
        return ExecutionResponse(
            success=True,
            session_id=session_id,
            execution_result=result,
            error=None
        )
    
    except Exception as e:
        logger.error(f"❌ Error executing sequence: {e}")
        return ExecutionResponse(
            success=False,
            session_id=request.session_id or "unknown",
            execution_result=None,
            error=str(e)
        )


@router.get("/status/{session_id}", response_model=StatusResponse)
async def get_status(session_id: str) -> StatusResponse:
    """
    Get execution status for a session.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Status response
    """
    if not STREAMAI_AVAILABLE or not orchestrator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"📊 Getting status for session {session_id}")
    
    try:
        status = orchestrator.get_session_status(session_id)
        
        return StatusResponse(
            success=status.get("success", False),
            session_id=session_id,
            status=status.get("session_info"),
            error=status.get("error")
        )
    
    except Exception as e:
        logger.error(f"❌ Error getting status: {e}")
        return StatusResponse(
            success=False,
            session_id=session_id,
            status=None,
            error=str(e)
        )


@router.get("/results/{session_id}", response_model=ResultsResponse)
async def get_results(session_id: str) -> ResultsResponse:
    """
    Get execution results for a session.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Results response
    """
    if not STREAMAI_AVAILABLE or not orchestrator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"📤 Getting results for session {session_id}")
    
    try:
        results = orchestrator.get_session_results(session_id)
        
        return ResultsResponse(
            success=results.get("success", False),
            session_id=session_id,
            results=results.get("results"),
            error=results.get("error")
        )
    
    except Exception as e:
        logger.error(f"❌ Error getting results: {e}")
        return ResultsResponse(
            success=False,
            session_id=session_id,
            results=None,
            error=str(e)
        )


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint.
    
    Returns:
        Health status
    """
    return {
        "status": "healthy" if STREAMAI_AVAILABLE else "unavailable",
        "service": "Trinity AI",
        "components": {
            "react_orchestrator": react_orchestrator is not None,
            "orchestrator": orchestrator is not None,
            "result_storage": result_storage is not None
        }
    }


# Log router registration
logger.info("✅ Trinity AI router created with endpoints:")
logger.info("  POST /streamai/chat")
logger.info("  POST /streamai/generate-sequence")
logger.info("  POST /streamai/execute-sequence")
logger.info("  GET  /streamai/status/{session_id}")
logger.info("  GET  /streamai/results/{session_id}")
logger.info("  GET  /streamai/health")

