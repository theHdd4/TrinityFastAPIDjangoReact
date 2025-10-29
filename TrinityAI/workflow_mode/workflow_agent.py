"""
Workflow Mode AI Agent
Separate from SuperAgent - focuses on workflow composition and molecule creation
Does NOT execute agents - only suggests how to group atoms into molecules
"""

import os
import sys
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path

# Add parent directory to path
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from workflow_mode.retrieval.rag_engine import get_rag_engine

logger = logging.getLogger("trinity.workflow_agent")


class WorkflowAgent:
    """
    AI Agent specifically for Workflow Mode
    Helps users create molecules by suggesting atom groupings
    Does NOT execute - only designs workflows
    """
    
    def __init__(self):
        logger.info("🔧 Initializing Workflow Agent...")
        
        # Get RAG engine for workflow knowledge
        self.rag = get_rag_engine()
        
        # Session memory for conversation context
        self.sessions = {}
        
        logger.info("✅ Workflow Agent initialized")
    
    def process_workflow_request(
        self, 
        user_prompt: str, 
        session_id: Optional[str] = None,
        workflow_context: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Process user request in Workflow Mode
        Returns molecule composition suggestions, NOT execution results
        
        Args:
            user_prompt: User's natural language request
            session_id: Session ID for conversation continuity
            workflow_context: Current workflow state (molecules, atoms, etc.)
        
        Returns:
            Dictionary with molecule suggestions and guidance
        """
        logger.info(f"📋 Workflow request: {user_prompt[:100]}...")
        
        # Get or create session
        if not session_id:
            session_id = f"workflow_{self._generate_session_id()}"
        
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "id": session_id,
                "conversation": [],
                "created_at": self._get_timestamp()
            }
        
        # Add user message to session
        self.sessions[session_id]["conversation"].append({
            "role": "user",
            "content": user_prompt,
            "timestamp": self._get_timestamp()
        })
        
        try:
            # Search for matching use case workflows
            use_cases = self.rag.search_use_case_workflows(user_prompt)
            
            # Build response based on whether we found a match
            if use_cases and use_cases[0]['score'] > 10:
                response = self._generate_use_case_response(use_cases[0], user_prompt)
            else:
                response = self._generate_general_guidance(user_prompt)
            
            # Add AI response to session
            self.sessions[session_id]["conversation"].append({
                "role": "assistant",
                "content": response["message"],
                "timestamp": self._get_timestamp(),
                "molecules": response.get("molecules", [])
            })
            
            return {
                "success": True,
                "session_id": session_id,
                "message": response["message"],
                "molecules": response.get("molecules", []),
                "workflow_suggestions": response.get("workflow_suggestions", {}),
                "mode": "workflow_composition"
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing workflow request: {e}")
            return {
                "success": False,
                "session_id": session_id,
                "error": str(e),
                "message": "I encountered an error processing your request. Please try rephrasing your workflow goal."
            }
    
    def _generate_use_case_response(self, matched_use_case: Dict, user_prompt: str) -> Dict[str, Any]:
        """
        Generate response when a matching use case is found
        Returns detailed molecule composition suggestions
        """
        use_case_key = matched_use_case['key']
        use_case_data = matched_use_case['data']
        
        logger.info(f"✅ Found matching use case: {use_case_data['name']}")
        
        # Generate formatted message
        message = f"I'll help you create a workflow for **{use_case_data['name']}**.\n\n"
        message += f"{use_case_data['description']}\n\n"
        message += "Here's how I suggest grouping the atoms into molecules:\n\n"
        
        molecules_for_response = []
        
        for molecule in use_case_data.get('molecules', []):
            mol_num = molecule['molecule_number']
            mol_name = molecule['molecule_name']
            mol_purpose = molecule['purpose']
            
            message += f"**Molecule {mol_num}: {mol_name}**\n"
            message += f"*Purpose:* {mol_purpose}\n"
            message += f"*Atoms:*\n"
            
            atoms_in_molecule = []
            for atom in molecule['atoms']:
                atom_id = atom['id']
                atom_details = self.rag.get_atom_details(atom_id)
                atom_title = atom_details['title'] if atom_details else atom_id
                atom_purpose = atom.get('purpose', '')
                required = "✓ Required" if atom.get('required', True) else "○ Optional"
                
                message += f"  {atom['order']}. **{atom_title}** - {atom_purpose} [{required}]\n"
                
                atoms_in_molecule.append({
                    "id": atom_id,
                    "title": atom_title,
                    "order": atom['order'],
                    "purpose": atom_purpose,
                    "required": atom.get('required', True)
                })
            
            message += "\n"
            
            # Build molecule object for frontend
            molecules_for_response.append({
                "molecule_number": mol_num,
                "molecule_name": mol_name,
                "purpose": mol_purpose,
                "atoms": atoms_in_molecule,
                "expected_outputs": molecule.get('expected_outputs', []),
                "connections_to": molecule.get('connections_to', [])
            })
        
        message += f"\n**Business Value:** {use_case_data.get('business_value', 'N/A')}\n\n"
        
        if use_case_data.get('prerequisites'):
            message += f"**Prerequisites:** {', '.join(use_case_data['prerequisites'])}\n\n"
        
        message += "Would you like me to help you create this workflow? I can guide you through creating each molecule."
        
        return {
            "message": message,
            "molecules": molecules_for_response,
            "workflow_suggestions": {
                "use_case_name": use_case_data['name'],
                "total_molecules": len(molecules_for_response),
                "industry": use_case_data.get('industry', ''),
                "complexity": use_case_data.get('typical_duration', 'medium')
            }
        }
    
    def _generate_general_guidance(self, user_prompt: str) -> Dict[str, Any]:
        """
        Generate general guidance when no specific use case matches
        Suggests relevant atoms and basic molecule structure
        """
        logger.info("📝 Generating general workflow guidance")
        
        # Search for relevant atoms
        relevant_atoms = self.rag.search_atoms_by_keywords(user_prompt, limit=8)
        
        message = "I'll help you create a workflow for your request.\n\n"
        message += "Based on your goal, here are the relevant atoms:\n\n"
        
        for i, atom in enumerate(relevant_atoms[:6], 1):
            message += f"{i}. **{atom['title']}** ({atom['category']})\n"
            message += f"   - {atom['description']}\n"
            message += f"   - Use cases: {', '.join(atom['use_cases'][:2])}\n\n"
        
        message += "\n**Suggested Molecule Structure:**\n\n"
        message += "**Molecule 1: Data Loading & Preparation**\n"
        message += "- Choose 2-3 atoms from Data Sources and Data Processing categories\n"
        message += "- Start with data upload or import\n"
        message += "- Add data cleaning/transformation\n\n"
        
        message += "**Molecule 2: Analysis or Modeling**\n"
        message += "- Choose 2-3 atoms that perform your main analysis\n"
        message += "- Use Analytics or Machine Learning atoms\n"
        message += "- Focus on your core business goal\n\n"
        
        message += "**Molecule 3: Visualization & Reporting**\n"
        message += "- Choose 1-2 visualization atoms\n"
        message += "- Use Chart Maker or specific chart types\n"
        message += "- Add text annotations if needed\n\n"
        
        message += "Would you like me to help you design a specific workflow? Please tell me more about:\n"
        message += "- What data you're working with\n"
        message += "- What analysis you want to perform\n"
        message += "- What insights you're looking for"
        
        return {
            "message": message,
            "molecules": [],
            "workflow_suggestions": {
                "relevant_atoms": [
                    {
                        "id": atom['id'],
                        "title": atom['title'],
                        "category": atom['category']
                    }
                    for atom in relevant_atoms[:6]
                ],
                "suggestion_type": "general_guidance"
            }
        }
    
    def get_molecule_creation_help(self, molecule_description: str) -> Dict[str, Any]:
        """
        Help user create a specific molecule
        Suggests which atoms should go into it
        """
        atoms = self.rag.search_atoms_by_keywords(molecule_description, limit=5)
        
        message = f"For a molecule focused on '{molecule_description}', I recommend:\n\n"
        
        for i, atom in enumerate(atoms, 1):
            message += f"{i}. **{atom['title']}**\n"
            message += f"   - {atom['description']}\n"
            message += f"   - Typical next atoms: {', '.join([self.rag.get_atom_details(a)['title'] for a in atom.get('typical_next_atoms', [])[:2] if self.rag.get_atom_details(a)])}\n\n"
        
        return {
            "success": True,
            "message": message,
            "suggested_atoms": [
                {
                    "id": atom['id'],
                    "title": atom['title'],
                    "description": atom['description']
                }
                for atom in atoms
            ]
        }
    
    def validate_workflow_structure(self, molecules: List[Dict]) -> Dict[str, Any]:
        """
        Validate a workflow structure
        Check if molecules are properly sequenced
        """
        issues = []
        suggestions = []
        
        if not molecules:
            return {
                "valid": False,
                "issues": ["No molecules in workflow"],
                "suggestions": ["Start by creating at least one molecule"]
            }
        
        # Check first molecule category
        first_mol_atoms = molecules[0].get('atoms', [])
        if first_mol_atoms:
            first_atom_id = first_mol_atoms[0].get('id') if isinstance(first_mol_atoms[0], dict) else first_mol_atoms[0]
            first_atom = self.rag.get_atom_details(first_atom_id)
            
            if first_atom and first_atom.get('category') != 'Data Sources':
                issues.append("Workflow should typically start with data loading")
                suggestions.append("Consider adding a Data Sources atom to your first molecule")
        
        # Check for visualization at the end
        if len(molecules) > 1:
            last_mol_atoms = molecules[-1].get('atoms', [])
            has_viz = False
            for atom_ref in last_mol_atoms:
                atom_id = atom_ref.get('id') if isinstance(atom_ref, dict) else atom_ref
                atom = self.rag.get_atom_details(atom_id)
                if atom and atom.get('category') == 'Visualization':
                    has_viz = True
                    break
            
            if not has_viz:
                suggestions.append("Consider adding visualization to your final molecule")
        
        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "suggestions": suggestions,
            "total_molecules": len(molecules)
        }
    
    def _generate_session_id(self) -> str:
        """Generate unique session ID"""
        import uuid
        return str(uuid.uuid4())[:8]
    
    def _get_timestamp(self) -> str:
        """Get current timestamp"""
        from datetime import datetime
        return datetime.now().isoformat()


# Global workflow agent instance
_workflow_agent = None

def get_workflow_agent() -> WorkflowAgent:
    """Get singleton workflow agent instance"""
    global _workflow_agent
    if _workflow_agent is None:
        _workflow_agent = WorkflowAgent()
    return _workflow_agent


if __name__ == "__main__":
    # Test the workflow agent
    agent = get_workflow_agent()
    
    print("=== Testing Workflow Agent ===\n")
    
    # Test 1: MMM workflow
    print("1. MMM Workflow Request:")
    result = agent.process_workflow_request("I want to build an MMM model")
    print(f"Success: {result['success']}")
    print(f"Message preview: {result['message'][:200]}...")
    print(f"Molecules suggested: {len(result.get('molecules', []))}")
    print()
    
    # Test 2: General request
    print("2. General Request:")
    result = agent.process_workflow_request("analyze customer churn")
    print(f"Success: {result['success']}")
    print(f"Message preview: {result['message'][:200]}...")
    print()
    
    # Test 3: Molecule creation help
    print("3. Molecule Creation Help:")
    result = agent.get_molecule_creation_help("data preparation and cleaning")
    print(f"Success: {result['success']}")
    print(f"Suggested atoms: {len(result.get('suggested_atoms', []))}")

