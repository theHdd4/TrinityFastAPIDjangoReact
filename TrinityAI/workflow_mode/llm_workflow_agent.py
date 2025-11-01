"""
Workflow Agent - LLM-based agent for workflow composition
Following the same pattern as merge/concat agents
"""

import os
import sys
import json
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path

# Add parent directory to path
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from workflow_mode.ai_logic_workflow import build_workflow_prompt, call_workflow_llm, extract_json
from workflow_mode.retrieval.rag_engine import get_rag_engine

# Import FileHandler for @filename mention support
try:
    from File_handler.available_minio_files import FileHandler, get_file_handler
    FILE_HANDLER_AVAILABLE = True
except ImportError as e:
    FILE_HANDLER_AVAILABLE = False

logger = logging.getLogger("smart.workflow.agent")


class WorkflowCompositionAgent:
    """
    Intelligent agent for workflow composition
    Suggests molecule groupings, does NOT execute agents
    """
    
    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        logger.info("🤖 Initializing Workflow Composition Agent...")
        
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        
        # Get RAG engine for workflow knowledge
        self.rag = get_rag_engine()
        
        # Session management (like merge/concat)
        self.sessions = {}
        
        # Available atoms organized by category
        self.available_atoms = self._load_available_atoms()
        
        # Initialize FileHandler for @filename mention support
        self.file_handler = None
        if FILE_HANDLER_AVAILABLE:
            try:
                # Get MinIO config from environment
                self.file_handler = get_file_handler(
                    minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
                    minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
                    minio_bucket=os.getenv("MINIO_BUCKET", "trinity"),
                    object_prefix=""
                )
                logger.info("✅ FileHandler initialized for @filename mention support")
            except Exception as e:
                logger.warning(f"⚠️ Failed to initialize FileHandler: {e}")
                self.file_handler = None
        
        logger.info(f"✅ Workflow Composition Agent initialized")
        logger.info(f"Available atoms loaded: {sum(len(atoms) for atoms in self.available_atoms.values())} atoms across {len(self.available_atoms)} categories")
    
    def _load_available_atoms(self) -> Dict[str, List[Dict]]:
        """
        Load all available atoms organized by category
        Similar to how merge/concat load available files
        """
        atoms_by_category = {}
        
        # Get all atoms from RAG knowledge base
        for atom_id, atom_data in self.rag.atom_index.items():
            category = atom_data.get('category', 'Utilities')
            
            if category not in atoms_by_category:
                atoms_by_category[category] = []
            
            atoms_by_category[category].append({
                "id": atom_id,
                "title": atom_data.get('title'),
                "description": atom_data.get('description'),
                "tags": atom_data.get('tags', []),
                "typical_next_atoms": atom_data.get('typical_next_atoms', [])
            })
        
        return atoms_by_category
    
    def create_session(self, session_id: str = None) -> str:
        """Create or get session (like merge/concat pattern)"""
        if not session_id:
            session_id = f"workflow_{str(uuid.uuid4())[:8]}"
        
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "id": session_id,
                "created_at": datetime.now().isoformat(),
                "conversation": [],
                "workflow_compositions": []
            }
            logger.info(f"📝 Created new workflow session: {session_id}")
        
        return session_id
    
    def process_request(
        self, 
        user_prompt: str, 
        session_id: str = None,
        workflow_context: Dict = None,
        file_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Main entry point - follows exact pattern as merge/concat agents
        
        Args:
            user_prompt: User's workflow request
            session_id: Session ID for conversation continuity
            workflow_context: Current workflow state (molecules, name, etc.)
            file_context: File details from @filename mentions
        
        Returns:
            Dictionary with molecule composition suggestions
        """
        logger.info(f"Processing workflow request for session '{session_id}': '{user_prompt}'")
        
        if not user_prompt or not user_prompt.strip():
            return {
                "success": False, 
                "error": "Prompt cannot be empty.", 
                "session_id": session_id,
                "smart_response": "Please tell me what type of workflow you'd like to create."
            }
        
        session_id = self.create_session(session_id)
        
        # Build conversation context from history (like merge/concat)
        conversation_context = self._build_context(session_id)
        
        # Parse for @filename mentions if file_context not provided
        if file_context is None and self.file_handler:
            try:
                _, file_context = self.file_handler.enrich_prompt_with_file_context(user_prompt)
                logger.info(f"✅ Parsed @filename mentions: {len(file_context)} file(s)")
            except Exception as e:
                logger.warning(f"⚠️ Failed to parse @filename mentions: {e}")
                file_context = {}
        elif file_context is None:
            file_context = {}
        
        # Build RAG knowledge context
        rag_knowledge = self._build_rag_knowledge_context(user_prompt)
        
        # Build the final prompt for LLM
        prompt = build_workflow_prompt(
            user_prompt=user_prompt,
            available_atoms=self.available_atoms,
            workflow_context=workflow_context or {},
            rag_knowledge=rag_knowledge,
            conversation_context=conversation_context,
            file_context=file_context  # Pass file context
        )
        
        logger.info("Sending prompt to LLM...")
        
        # Call LLM with retry logic
        max_retries = 2
        result = None
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    logger.warning(f"🔄 Retry attempt {attempt + 1}/{max_retries} with stricter JSON instructions")
                    # Add stricter JSON requirement for retry
                    retry_prompt = prompt + f"\n\n**CRITICAL RETRY INSTRUCTION**: Your previous response was not valid JSON. You MUST return ONLY a JSON object starting with {{ and ending with }}. No text before or after. Start your response immediately with {{."
                    response = call_workflow_llm(self.api_url, self.model_name, self.bearer_token, retry_prompt)
                else:
                    response = call_workflow_llm(self.api_url, self.model_name, self.bearer_token, prompt)
                
                logger.info(f"✅ LLM response received (length: {len(response)})")
                
                # Extract JSON from response
                result = extract_json(response)
                
                if result:
                    logger.info(f"✅ Successfully extracted JSON on attempt {attempt + 1}")
                    break
                else:
                    logger.warning(f"❌ Attempt {attempt + 1} failed to extract JSON")
                    if attempt == 0:
                        logger.error(f"❌ LLM returned non-JSON text response (first 500 chars):")
                        logger.error(f"{response[:500]}")
                    
            except Exception as e:
                logger.error(f"❌ LLM call failed on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    return self._create_fallback_response(session_id, str(e), user_prompt)
        
        if not result:
            logger.error("❌ Failed to extract JSON from LLM response after all retries")
            return self._create_fallback_response(session_id, f"Could not parse LLM response", user_prompt)
        
        # Add session ID if not present
        result["session_id"] = session_id
        
        # If LLM returned success=false but no smart_response, generate one
        if not result.get('success') and not result.get('smart_response'):
            fallback = self._create_fallback_response(session_id, "LLM could not create workflow", user_prompt)
            result['smart_response'] = fallback['smart_response']
            result['suggestions'] = fallback.get('suggestions', [])
        
        # Add auto_create flag if workflow composition is successful
        if result.get('success') and result.get('workflow_composition'):
            result['auto_create'] = True
            
            # Generate step-by-step execution plan
            execution_plan = []
            step = 1
            
            for molecule in result.get('workflow_composition', {}).get('molecules', []):
                # Step 1: Create molecule
                execution_plan.append({
                    'step': step,
                    'action': 'create_molecule',
                    'molecule_number': molecule.get('molecule_number'),
                    'molecule_name': molecule.get('molecule_name'),
                    'purpose': molecule.get('purpose')
                })
                step += 1
                
                # Steps 2+: Add each atom to the molecule
                for atom in molecule.get('atoms', []):
                    # Handle both string and dict atoms (simple fix for string atoms)
                    if isinstance(atom, str):
                        atom_id = atom
                        atom_title = atom
                    else:
                        atom_id = atom.get('id', '')
                        atom_title = atom.get('title', atom_id)
                    
                    execution_plan.append({
                        'step': step,
                        'action': 'add_atom',
                        'molecule_number': molecule.get('molecule_number'),
                        'atom_id': atom_id,
                        'atom_title': atom_title,
                        'order': atom.get('order', step) if isinstance(atom, dict) else step,
                        'purpose': atom.get('purpose', '') if isinstance(atom, dict) else '',
                        'required': atom.get('required', True) if isinstance(atom, dict) else True
                    })
                    step += 1
            
            result['execution_plan'] = execution_plan
        
        # Update session memory
        self._update_session_memory(session_id, user_prompt, result)
        
        logger.info(f"✅ Workflow composition complete: success={result.get('success')}")
        
        return result
    
    def _build_context(self, session_id: str) -> str:
        """
        Build conversation context from session history
        Same pattern as merge/concat agents
        """
        session = self.sessions.get(session_id, {})
        conversation = session.get("conversation", [])
        
        if not conversation:
            return "No previous conversation."
        
        context_parts = []
        for entry in conversation[-10:]:  # Last 10 exchanges
            role = entry.get("role", "")
            content = entry.get("content", "")
            timestamp = entry.get("timestamp", "")
            
            if role == "user":
                context_parts.append(f"User ({timestamp}): {content}")
            elif role == "assistant":
                context_parts.append(f"Assistant ({timestamp}): {content[:200]}...")
        
        return "\n".join(context_parts)
    
    def _build_rag_knowledge_context(self, user_prompt: str) -> str:
        """
        Provide HIGH-LEVEL guidance only
        """
        guidance = (
            "\nRAG GUIDANCE (high-level, non-prescriptive):\n"
            "- Treat examples and patterns as inspiration only, not templates.\n"
            "- Design a custom workflow based on the user's goal and AVAILABLE ATOMS.\n"
            "- Prefer multi-phase pipelines covering: ingestion, integration, cleaning,\n"
            "  analysis, modeling, evaluation, visualization, and reporting.\n"
            "- Group 2-5 complementary atoms per molecule; ensure logical sequencing\n"
            "  and clear purpose per molecule.\n"
            "- For complex tasks, consider 5-8 molecules.\n"
            "- Always explain business value briefly.\n"
        )
        return guidance
    
    def _update_session_memory(self, session_id: str, user_prompt: str, result: Dict):
        """
        Update session memory with interaction
        Same pattern as merge/concat agents
        """
        if session_id not in self.sessions:
            return
        
        # Add user message
        self.sessions[session_id]["conversation"].append({
            "role": "user",
            "content": user_prompt,
            "timestamp": datetime.now().isoformat()
        })
        
        # Add assistant response
        self.sessions[session_id]["conversation"].append({
            "role": "assistant",
            "content": result.get("smart_response", result.get("message", "")),
            "timestamp": datetime.now().isoformat(),
            "workflow_composition": result.get("workflow_composition") if result.get("success") else None
        })
        
        # Store workflow composition if successful
        if result.get("success") and result.get("workflow_composition"):
            self.sessions[session_id]["workflow_compositions"].append({
                "timestamp": datetime.now().isoformat(),
                "composition": result["workflow_composition"]
            })
        
        logger.info(f"💾 Session memory updated: {len(self.sessions[session_id]['conversation'])} exchanges")
    
    def _create_fallback_response(self, session_id: str, error_msg: str = None, user_prompt: str = None) -> Dict:
        """
        Create simple fallback response when LLM fails or cannot understand query
        """
        logger.warning(f"Creating fallback response due to: {error_msg}")
        
        return {
            "success": False,
            "session_id": session_id,
            "message": "Unable to process workflow request",
            "smart_response": "I couldn't process your request. Please try asking for a specific workflow like 'create MMM workflow' or 'build a churn prediction model'.",
            "suggestions": [
                "Try asking for a specific workflow: 'create MMM workflow'",
                "Or describe your goal: 'I want to forecast sales'",
                "Or ask: 'what workflows can you help me create?'",
                "Or be specific: 'build a customer churn prediction model'"
            ],
            "available_use_cases": ["mmm", "churn", "forecast", "pricing", "dashboard", "segmentation", "sentiment"],
            "error": error_msg if error_msg else "LLM processing error"
        }


# Global agent instance
_workflow_composition_agent = None

def get_workflow_composition_agent(api_url: str = None, model_name: str = None, bearer_token: str = None):
    """
    Get singleton workflow composition agent instance
    Same pattern as merge/concat agents
    """
    global _workflow_composition_agent
    
    if _workflow_composition_agent is None:
        # Get LLM config from main_api
        from main_api import get_llm_config
        config = get_llm_config()
        
        _workflow_composition_agent = WorkflowCompositionAgent(
            api_url=api_url or config["api_url"],
            model_name=model_name or config["model_name"],
            bearer_token=bearer_token or config["bearer_token"]
        )
    
    return _workflow_composition_agent


if __name__ == "__main__":
    # Test the workflow composition agent
    from main_api import get_llm_config
    
    config = get_llm_config()
    agent = WorkflowCompositionAgent(
        api_url=config["api_url"],
        model_name=config["model_name"],
        bearer_token=config["bearer_token"]
    )
    
    print("=== Testing Workflow Composition Agent ===\n")
    
    # Test 1: MMM workflow
    print("1. MMM Workflow Request:")
    result = agent.process_request(
        user_prompt="I want to build an MMM model",
        session_id="test_session_1"
    )
    print(f"Success: {result.get('success')}")
    print(f"Smart Response: {result.get('smart_response', '')[:200]}...")
    if result.get('workflow_composition'):
        print(f"Molecules: {len(result['workflow_composition'].get('molecules', []))}")
    print()
    
    # Test 2: General request
    print("2. General Workflow Request:")
    result = agent.process_request(
        user_prompt="what workflows can you help me create?",
        session_id="test_session_2"
    )
    print(f"Success: {result.get('success')}")
    print(f"Smart Response: {result.get('smart_response', '')[:200]}...")
