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
    from STREAMAI.stream_sequence_generator import get_sequence_generator
    from STREAMAI.stream_orchestrator import get_orchestrator
    from STREAMAI.result_storage import get_result_storage
    STREAMAI_AVAILABLE = True
    logger.info("✅ Trinity AI components imported successfully")
except ImportError as e:
    try:
        # Try relative imports first (Docker), then absolute (local dev)
        try:
            from .stream_sequence_generator import get_sequence_generator
            from .stream_orchestrator import get_orchestrator
            from .result_storage import get_result_storage
            STREAMAI_AVAILABLE = True
            logger.info("✅ Trinity AI components imported successfully (relative)")
        except ImportError:
            try:
                from STREAMAI.stream_sequence_generator import get_sequence_generator
                from STREAMAI.stream_orchestrator import get_orchestrator
                from STREAMAI.result_storage import get_result_storage
                STREAMAI_AVAILABLE = True
                logger.info("✅ Trinity AI components imported successfully (absolute)")
            except ImportError:
                # Fallback: direct imports (if in same directory)
                try:
                    from stream_sequence_generator import get_sequence_generator
                    from stream_orchestrator import get_orchestrator
                    from result_storage import get_result_storage
                    STREAMAI_AVAILABLE = True
                    logger.info("✅ Trinity AI components imported successfully (direct)")
                except ImportError as e3:
                    logger.error(f"❌ Trinity AI components not available: {e3}")
                    STREAMAI_AVAILABLE = False
                    # Create stub functions
                    def get_sequence_generator():
                        return None
                    def get_orchestrator():
                        return None
                    def get_result_storage():
                        return None
    except Exception as e2:
        STREAMAI_AVAILABLE = False
        logger.error(f"❌ Trinity AI components not available: {e} | {e2}")


# Create router
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


# Initialize components
sequence_generator = None
orchestrator = None
result_storage = None

if STREAMAI_AVAILABLE:
    try:
        sequence_generator = get_sequence_generator()
        orchestrator = get_orchestrator()
        result_storage = get_result_storage()
        logger.info("✅ Trinity AI components initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize Trinity AI components: {e}")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Chat interface for Trinity AI.
    Generates and optionally executes atom sequences.
    
    Args:
        request: Chat request with message
        
    Returns:
        Chat response with sequence
    """
    if not STREAMAI_AVAILABLE or not sequence_generator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"💬 Trinity AI chat request: {request.message[:100]}...")
    
    try:
        # Generate session ID if not provided
        session_id = request.session_id or f"stream_{uuid.uuid4().hex[:16]}"
        
        # Generate sequence (now async)
        result = await sequence_generator.generate_sequence(
            request.message,
            request.file_context
        )
        
        if not result.get("success"):
            return ChatResponse(
                response=f"I couldn't generate a sequence: {result.get('error', 'Unknown error')}",
                session_id=session_id,
                sequence=None
            )
        
        sequence = result.get("sequence", {})
        total_atoms = sequence.get("total_atoms", 0)
        reasoning = sequence.get("reasoning", "")
        
        # Create response message
        response_msg = f"I've analyzed your request and created a sequence of {total_atoms} atoms to complete your task.\n\n"
        
        if reasoning:
            response_msg += f"**Reasoning**: {reasoning}\n\n"
        
        response_msg += "**Sequence**:\n"
        for atom in sequence.get("sequence", []):
            response_msg += f"{atom['step']}. **{atom['atom_id']}**: {atom['purpose']}\n"
        
        response_msg += f"\n**Estimated Duration**: {sequence.get('estimated_duration', 'unknown')}\n"
        response_msg += "\nWould you like me to execute this sequence?"
        
        logger.info(f"✅ Sequence generated for session {session_id}")
        
        return ChatResponse(
            response=response_msg,
            session_id=session_id,
            sequence=sequence
        )
    
    except Exception as e:
        logger.error(f"❌ Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-sequence", response_model=SequenceResponse)
async def generate_sequence(request: GenerateSequenceRequest) -> SequenceResponse:
    """
    Generate an atom sequence from a query.
    
    Args:
        request: Generate sequence request
        
    Returns:
        Sequence response
    """
    if not STREAMAI_AVAILABLE or not sequence_generator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    if not STREAMAI_AVAILABLE or not sequence_generator:
        raise HTTPException(status_code=503, detail="Trinity AI not available")
    
    logger.info(f"🔄 Generating sequence for: {request.query[:100]}...")
    
    try:
        # Generate session ID if not provided
        session_id = request.session_id or f"stream_{uuid.uuid4().hex[:16]}"
        
        # Generate sequence (now async)
        result = await sequence_generator.generate_sequence(
            request.query,
            request.file_context
        )
        
        if not result.get("success"):
            return SequenceResponse(
                success=False,
                sequence=None,
                error=result.get("error", "Failed to generate sequence"),
                session_id=session_id
            )
        
        logger.info(f"✅ Sequence generated successfully")
        
        return SequenceResponse(
            success=True,
            sequence=result.get("sequence"),
            error=None,
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
            "sequence_generator": sequence_generator is not None,
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

