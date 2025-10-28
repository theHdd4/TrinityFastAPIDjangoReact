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
        workflow_context: Dict = None
    ) -> Dict[str, Any]:
        """
        Main entry point - follows exact pattern as merge/concat agents
        
        Args:
            user_prompt: User's workflow request
            session_id: Session ID for conversation continuity
            workflow_context: Current workflow state (molecules, name, etc.)
        
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
        
        # Build RAG knowledge context
        rag_knowledge = self._build_rag_knowledge_context(user_prompt)
        
        # Build the final prompt for LLM
        prompt = build_workflow_prompt(
            user_prompt=user_prompt,
            available_atoms=self.available_atoms,
            workflow_context=workflow_context or {},
            rag_knowledge=rag_knowledge,
            conversation_context=conversation_context
        )
        
        logger.info("Sending prompt to LLM...")
        
        # Call LLM
        try:
            response = call_workflow_llm(self.api_url, self.model_name, self.bearer_token, prompt)
            logger.info(f"✅ LLM response received (length: {len(response)})")
        except Exception as e:
            logger.error(f"❌ LLM call failed: {e}")
            return self._create_fallback_response(session_id, str(e))
        
        # Extract JSON from response
        result = extract_json(response)
        
        if not result:
            logger.warning("❌ Failed to extract JSON from LLM response")
            return self._create_fallback_response(session_id, "Could not parse LLM response")
        
        # Add session ID if not present
        result["session_id"] = session_id
        
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
        Build RAG knowledge context specific to user's request
        """
        # Search for matching use cases
        use_cases = self.rag.search_use_case_workflows(user_prompt)
        
        context = "\nRAG KNOWLEDGE - WORKFLOW PATTERNS:\n"
        
        if use_cases and use_cases[0]['score'] > 10:
            # Found a matching use case
            best_match = use_cases[0]
            use_case_data = best_match['data']
            
            context += f"\n**MATCHED USE CASE: {use_case_data['name']}**\n"
            context += f"Description: {use_case_data['description']}\n"
            context += f"Industry: {use_case_data.get('industry', 'General')}\n\n"
            
            context += "SUGGESTED MOLECULE COMPOSITION:\n"
            for molecule in use_case_data.get('molecules', []):
                context += f"\nMolecule {molecule['molecule_number']}: {molecule['molecule_name']}\n"
                context += f"Purpose: {molecule['purpose']}\n"
                context += f"Atoms:\n"
                for atom in molecule['atoms']:
                    context += f"  - {atom['id']} (order: {atom['order']}, required: {atom.get('required', True)})\n"
        else:
            # No exact match - provide general guidance
            context += "\nNo exact use case match found. Suggest general workflow structure:\n"
            context += "- Molecule 1: Data loading & preparation\n"
            context += "- Molecule 2: Analysis or modeling\n"
            context += "- Molecule 3: Visualization & reporting\n"
        
        return context
    
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
    
    def _create_fallback_response(self, session_id: str, error_msg: str = None) -> Dict:
        """
        Create fallback response when LLM fails
        Same pattern as merge/concat agents
        """
        logger.warning(f"Creating fallback response due to: {error_msg}")
        
        return {
            "success": False,
            "session_id": session_id,
            "message": "I encountered an issue processing your request",
            "smart_response": "I'm having trouble processing your workflow request. Here are the types of workflows I can help you create:\n\n**Available Workflows:**\n- **MMM (Marketing Mix Modeling)** - Measure marketing effectiveness\n- **Churn Prediction** - Identify at-risk customers\n- **Demand Forecasting** - Forecast sales and inventory\n- **Price Optimization** - Optimize pricing strategy\n- **Customer LTV** - Predict customer lifetime value\n- **Sales Dashboard** - Create KPI dashboards\n\nPlease specify which type of workflow you'd like to create, or describe your business goal.",
            "suggestions": [
                "Try asking for a specific workflow: 'create MMM workflow'",
                "Or describe your goal: 'I want to forecast sales'",
                "Or ask: 'what workflows can you help me create?'"
            ],
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

