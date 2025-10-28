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
            return self._create_fallback_response(session_id, str(e), user_prompt)
        
        # Extract JSON from response
        result = extract_json(response)
        
        if not result:
            logger.warning("❌ Failed to extract JSON from LLM response")
            return self._create_fallback_response(session_id, "Could not parse LLM response", user_prompt)
        
        # Add session ID if not present
        result["session_id"] = session_id
        
        # If LLM returned success=false but no smart_response, generate one
        if not result.get('success') and not result.get('smart_response'):
            logger.info("LLM returned success=false without smart_response, generating fallback")
            fallback = self._create_fallback_response(session_id, "LLM could not create workflow", user_prompt)
            result['smart_response'] = fallback['smart_response']
            result['suggestions'] = fallback.get('suggestions', [])
            result['available_use_cases'] = fallback.get('available_use_cases', [])
        
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
                    execution_plan.append({
                        'step': step,
                        'action': 'add_atom',
                        'molecule_number': molecule.get('molecule_number'),
                        'atom_id': atom.get('id'),
                        'atom_title': atom.get('title'),
                        'order': atom.get('order'),
                        'purpose': atom.get('purpose'),
                        'required': atom.get('required', True)
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
        Provide HIGH-LEVEL guidance only. We intentionally avoid injecting
        concrete workflow templates from RAG to prevent biasing the LLM.
        The goal is to nudge the model toward creating custom, atom-driven
        workflows tailored to the user's prompt.
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
        Create fallback response when LLM fails or cannot understand query
        Provides smart, helpful responses instead of returning nothing
        """
        logger.warning(f"Creating fallback response due to: {error_msg}")
        
        # Analyze the user prompt to provide contextual help
        smart_response = self._generate_smart_fallback(user_prompt)
        
        return {
            "success": False,
            "session_id": session_id,
            "message": "Providing workflow guidance",
            "smart_response": smart_response,
            "suggestions": [
                "Try asking for a specific workflow: 'create MMM workflow'",
                "Or describe your goal: 'I want to forecast sales'",
                "Or ask: 'what workflows can you help me create?'",
                "Or be specific: 'build a customer churn prediction model'"
            ],
            "available_use_cases": ["mmm", "churn", "forecast", "pricing", "dashboard", "segmentation", "sentiment"],
            "error": error_msg if error_msg else "LLM processing error"
        }
    
    def _generate_smart_fallback(self, user_prompt: str = None) -> str:
        """
        Generate intelligent fallback response based on user query
        Provides helpful information instead of generic error messages
        """
        if not user_prompt:
            return self._get_default_help_message()
        
        prompt_lower = user_prompt.lower().strip()
        
        # Check for greeting or general help
        if any(word in prompt_lower for word in ['hello', 'hi', 'hey', 'help', 'what can you do', 'capabilities']):
            return """Hello! I'm your Workflow Composition Assistant. I help you design data workflows by suggesting how to group atoms into molecules.

**What I Can Do:**
- Create custom workflows for your business needs
- Suggest pre-built workflows for common use cases
- Help you understand which atoms to use
- Design complete data pipelines from ingestion to insights

**Popular Workflows I Can Create:**
- **MMM (Marketing Mix Modeling)** - Measure marketing channel effectiveness
- **Churn Prediction** - Identify customers likely to leave
- **Demand Forecasting** - Predict future sales and inventory needs
- **Price Optimization** - Find optimal pricing strategies
- **Customer Segmentation** - Group customers by behavior
- **Sales Dashboard** - Create KPI tracking dashboards
- **Sentiment Analysis** - Analyze customer feedback

**How to Get Started:**
Just tell me what you want to achieve! For example:
- "Create an MMM workflow"
- "I want to predict customer churn"
- "Build a sales forecasting model"
- "Show me how to create a dashboard"

What would you like to create today?"""
        
        # Check for "what" questions
        if prompt_lower.startswith('what') or 'what is' in prompt_lower or 'what are' in prompt_lower:
            return """I can help you understand workflows and create them! Here's what you need to know:

**What is a Workflow?**
A workflow is a sequence of molecules (grouped atoms) that process data from start to finish.

**Available Workflow Types:**

📊 **Analytics Workflows:**
- **MMM (Marketing Mix Modeling)** - Measure ROI of marketing channels
- **Customer Segmentation** - Group customers by behavior patterns
- **Trend Analysis** - Identify patterns in your data

🤖 **Predictive Workflows:**
- **Churn Prediction** - Predict which customers will leave
- **Demand Forecasting** - Forecast future sales and demand
- **Price Optimization** - Find optimal pricing points

📈 **Reporting Workflows:**
- **Sales Dashboard** - Track KPIs and metrics
- **Performance Reports** - Generate automated reports
- **Sentiment Analysis** - Analyze customer feedback

**Ready to Create?**
Tell me which workflow you'd like to build, or describe your business goal and I'll design a custom workflow for you!"""
        
        # Check for list/show requests
        if any(word in prompt_lower for word in ['list', 'show', 'available', 'options', 'types']):
            return """Here are all the workflows I can help you create:

**📊 Marketing & Sales:**
- **MMM (Marketing Mix Modeling)** - Measure marketing effectiveness across channels
- **Price Optimization** - Find optimal pricing strategies
- **Sales Dashboard** - Track sales KPIs and performance
- **Lead Scoring** - Prioritize sales leads

**🤖 Predictive Analytics:**
- **Churn Prediction** - Identify at-risk customers
- **Demand Forecasting** - Predict future sales and inventory needs
- **Customer LTV** - Predict customer lifetime value
- **Propensity Modeling** - Predict customer behavior

**👥 Customer Analytics:**
- **Customer Segmentation** - Group customers by behavior
- **Sentiment Analysis** - Analyze customer feedback
- **RFM Analysis** - Recency, Frequency, Monetary analysis
- **Customer Journey** - Map customer touchpoints

**📈 Business Intelligence:**
- **Executive Dashboard** - High-level KPI tracking
- **Financial Reports** - Revenue and cost analysis
- **Operational Metrics** - Track business operations
- **Cohort Analysis** - Analyze user cohorts over time

**Which workflow would you like to create?** Just tell me the name or describe your goal!"""
        
        # Check for unclear/vague requests
        if len(prompt_lower) < 10 or prompt_lower in ['analyze', 'help me', 'do something', 'create', 'build']:
            return """I'd love to help you create a workflow! To design the best solution, I need a bit more information.

**Tell me about your goal:**
- What business problem are you trying to solve?
- What type of analysis do you need?
- What insights are you looking for?

**Or choose from these popular workflows:**

🎯 **Marketing:**
- "Create an MMM workflow" - Measure marketing effectiveness
- "Build a price optimization model" - Find optimal pricing

📊 **Customer Analytics:**
- "Create a churn prediction model" - Identify at-risk customers
- "Build a customer segmentation workflow" - Group customers

📈 **Forecasting:**
- "Create a demand forecasting workflow" - Predict future sales
- "Build a sales dashboard" - Track KPIs

**Example requests:**
- "I want to measure my marketing ROI"
- "Help me predict which customers will churn"
- "Create a dashboard to track sales performance"

What would you like to create?"""
        
        # Check for specific workflow keywords
        workflow_keywords = {
            'mmm': 'MMM (Marketing Mix Modeling)',
            'marketing mix': 'MMM (Marketing Mix Modeling)',
            'churn': 'Churn Prediction',
            'forecast': 'Demand Forecasting',
            'predict': 'Predictive Analytics',
            'dashboard': 'Dashboard Creation',
            'segment': 'Customer Segmentation',
            'sentiment': 'Sentiment Analysis',
            'price': 'Price Optimization',
            'ltv': 'Customer Lifetime Value'
        }
        
        for keyword, workflow_name in workflow_keywords.items():
            if keyword in prompt_lower:
                return f"""Great! I can help you create a **{workflow_name}** workflow.

To design the best workflow for you, could you provide a bit more detail?

**For example:**
- What data sources will you use?
- What specific insights are you looking for?
- Do you have any specific requirements?

**Or I can create a standard {workflow_name} workflow for you right now!**

Just say:
- "Create a standard {workflow_name} workflow"
- "Show me the molecules for {workflow_name}"
- "Build a {workflow_name} pipeline"

What would you prefer?"""
        
        # Default fallback
        return self._get_default_help_message()
    
    def _get_default_help_message(self) -> str:
        """Get default help message when no specific context is available"""
        return """I'm here to help you create data workflows! I can design custom workflows or suggest pre-built ones for common business use cases.

**🎯 Popular Workflows:**

**Marketing & Sales:**
- **MMM (Marketing Mix Modeling)** - Measure marketing channel effectiveness
- **Price Optimization** - Find optimal pricing strategies
- **Sales Dashboard** - Track KPIs and performance

**Customer Analytics:**
- **Churn Prediction** - Identify at-risk customers
- **Customer Segmentation** - Group customers by behavior
- **Sentiment Analysis** - Analyze customer feedback

**Forecasting:**
- **Demand Forecasting** - Predict future sales and inventory
- **Customer LTV** - Predict customer lifetime value

**How to Get Started:**
Just tell me what you want to achieve! For example:
- "Create an MMM workflow"
- "I want to predict customer churn"
- "Build a sales forecasting model"
- "Help me create a customer segmentation workflow"

**Or ask me:**
- "What workflows can you create?"
- "Show me available options"
- "Help me choose a workflow"

What would you like to create today?"""


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

