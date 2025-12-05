"""
RAG (Retrieval-Augmented Generation) Engine for Workflow Mode
Retrieves relevant atoms, molecules, and workflow patterns based on user queries
"""

import json
import os
import re
from typing import List, Dict, Any, Optional
from pathlib import Path

class WorkflowRAGEngine:
    """
    RAG engine for retrieving workflow knowledge
    Provides context about atoms, molecules, and workflow patterns
    """
    
    def __init__(self):
        self.base_path = Path(__file__).parent.parent / "rag"
        self.atoms_kb = self._load_json("atoms_knowledge_base.json")
        self.molecule_patterns = self._load_json("molecule_patterns.json")
        self.workflow_sequences = self._load_json("workflow_sequences.json")
        self.use_case_workflows = self._load_json("use_case_workflows.json")
        
        # Build search indexes
        self.atom_index = self._build_atom_index()
        self.molecule_index = self._build_molecule_index()
        self.use_case_index = self._build_use_case_index()
        
    def _load_json(self, filename: str) -> Dict:
        """Load JSON knowledge base file"""
        file_path = self.base_path / filename
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {filename}: {e}")
            return {}
    
    def _build_atom_index(self) -> Dict[str, Dict]:
        """Build searchable index of all atoms"""
        index = {}
        categories = self.atoms_kb.get("categories", {})
        
        for category_key, category_data in categories.items():
            for atom in category_data.get("atoms", []):
                atom_id = atom.get("id")
                index[atom_id] = {
                    **atom,
                    "category": category_data.get("name"),
                    "category_color": category_data.get("color"),
                    "category_usage": category_data.get("typical_usage")
                }
        
        return index
    
    def _build_molecule_index(self) -> Dict[str, Dict]:
        """Build searchable index of all molecule patterns"""
        index = {}
        molecules = self.molecule_patterns.get("molecules", {})
        
        for molecule_key, molecule_data in molecules.items():
            index[molecule_key] = molecule_data
        
        return index
    
    def _build_use_case_index(self) -> Dict[str, Dict]:
        """Build searchable index of use case workflows"""
        index = {}
        use_cases = self.use_case_workflows.get("use_case_workflows", {})
        
        for use_case_key, use_case_data in use_cases.items():
            index[use_case_key] = use_case_data
        
        return index
    
    def search_atoms_by_keywords(self, query: str, limit: int = 5) -> List[Dict]:
        """
        Search atoms by keywords in query
        Returns ranked list of relevant atoms
        """
        query_lower = query.lower()
        query_words = set(re.findall(r'\w+', query_lower))
        
        scored_atoms = []
        
        for atom_id, atom_data in self.atom_index.items():
            score = 0
            
            # Check title match
            if query_lower in atom_data.get("title", "").lower():
                score += 10
            
            # Check description match
            if query_lower in atom_data.get("description", "").lower():
                score += 5
            
            # Check tag matches
            tags = atom_data.get("tags", [])
            for tag in tags:
                if tag.lower() in query_lower or any(word in tag.lower() for word in query_words):
                    score += 3
            
            # Check use case matches
            use_cases = atom_data.get("use_cases", [])
            for use_case in use_cases:
                if any(word in use_case.lower() for word in query_words):
                    score += 2
            
            # Check capability matches
            capabilities = atom_data.get("capabilities", [])
            for capability in capabilities:
                if any(word in capability.lower() for word in query_words):
                    score += 2
            
            if score > 0:
                scored_atoms.append((score, atom_data))
        
        # Sort by score and return top results
        scored_atoms.sort(key=lambda x: x[0], reverse=True)
        return [atom for score, atom in scored_atoms[:limit]]
    
    def search_molecules_by_intent(self, query: str) -> List[Dict]:
        """
        Find relevant molecule patterns based on user intent
        """
        query_lower = query.lower()
        
        # Check keyword mappings
        keyword_map = self.molecule_patterns.get("molecule_selection_guide", {}).get("by_keywords", {})
        
        matched_molecules = []
        for keyword_pattern, molecule_keys in keyword_map.items():
            # Check if any keyword pattern matches the query
            keywords = keyword_pattern.split("|")
            if any(kw in query_lower for kw in keywords):
                for mol_key in molecule_keys:
                    if mol_key not in [m["key"] for m in matched_molecules]:
                        mol_data = self.molecule_index.get(mol_key, {})
                        if mol_data:
                            matched_molecules.append({
                                "key": mol_key,
                                "data": mol_data
                            })
        
        return matched_molecules
    
    def get_workflow_template(self, task_type: str) -> Optional[Dict]:
        """
        Get a workflow template for a specific task type
        Returns complete workflow sequence with molecules and atoms
        """
        templates = self.workflow_sequences.get("workflow_templates", {})
        
        # Try exact match first
        if task_type in templates:
            return templates[task_type]
        
        # Try partial match
        for template_key, template_data in templates.items():
            if task_type.lower() in template_key.lower():
                return template_data
            
            # Check use cases
            use_cases = template_data.get("use_cases", [])
            for use_case in use_cases:
                if task_type.lower() in use_case.lower():
                    return template_data
        
        return None
    
    def recommend_next_atoms(self, current_atom_id: str) -> List[Dict]:
        """
        Recommend next atoms based on current atom
        Uses typical_next_atoms from knowledge base
        """
        current_atom = self.atom_index.get(current_atom_id)
        if not current_atom:
            return []
        
        next_atom_ids = current_atom.get("typical_next_atoms", [])
        
        recommended = []
        for atom_id in next_atom_ids:
            atom_data = self.atom_index.get(atom_id)
            if atom_data:
                recommended.append(atom_data)
        
        return recommended
    
    def get_atom_details(self, atom_id: str) -> Optional[Dict]:
        """Get complete details for a specific atom"""
        return self.atom_index.get(atom_id)
    
    def get_molecule_pattern(self, molecule_key: str) -> Optional[Dict]:
        """Get complete molecule pattern details"""
        return self.molecule_index.get(molecule_key)
    
    def search_use_case_workflows(self, query: str) -> List[Dict]:
        """
        Search for matching use case workflows
        Returns use cases that match the query
        """
        query_lower = query.lower()
        matched_use_cases = []
        
        for use_case_key, use_case_data in self.use_case_index.items():
            score = 0
            
            # Check name match
            if any(word in use_case_data['name'].lower() for word in query_lower.split()):
                score += 10
            
            # Check description match
            if any(word in use_case_data['description'].lower() for word in query_lower.split()):
                score += 5
            
            # Check industry match
            if use_case_data.get('industry', '').lower() in query_lower:
                score += 3
            
            # Check common keywords
            keywords_map = {
                'mmm': ['mmm', 'marketing mix', 'marketing effectiveness', 'roas', 'attribution'],
                'churn': ['churn', 'retention', 'attrition', 'customer loss'],
                'ltv': ['ltv', 'lifetime value', 'customer value', 'clv'],
                'forecast': ['forecast', 'prediction', 'demand', 'sales forecast'],
                'price': ['price', 'pricing', 'elasticity', 'optimization'],
                'dashboard': ['dashboard', 'kpi', 'report', 'performance']
            }
            
            for keyword_group, keywords in keywords_map.items():
                if any(kw in query_lower for kw in keywords):
                    if any(kw in use_case_data['name'].lower() for kw in keywords):
                        score += 15
            
            if score > 0:
                matched_use_cases.append({
                    'score': score,
                    'key': use_case_key,
                    'data': use_case_data
                })
        
        # Sort by score
        matched_use_cases.sort(key=lambda x: x['score'], reverse=True)
        return matched_use_cases
    
    def get_use_case_workflow(self, use_case_key: str) -> Optional[Dict]:
        """Get complete use case workflow details"""
        return self.use_case_index.get(use_case_key)
    
    def generate_molecule_suggestions_for_use_case(self, use_case_key: str) -> str:
        """
        Generate formatted molecule suggestions for a specific use case
        Returns AI-friendly prompt format
        """
        use_case = self.get_use_case_workflow(use_case_key)
        if not use_case:
            return ""
        
        suggestion = f"""
**{use_case['name']}**

{use_case['description']}

I suggest creating these molecules:

"""
        
        for molecule in use_case.get('molecules', []):
            suggestion += f"\n**Molecule {molecule['molecule_number']}: {molecule['molecule_name']}**\n"
            suggestion += f"Purpose: {molecule['purpose']}\n"
            suggestion += f"Atoms:\n"
            
            for atom in molecule['atoms']:
                atom_details = self.get_atom_details(atom['id'])
                atom_title = atom_details['title'] if atom_details else atom['id']
                required_mark = "✓ Required" if atom.get('required') else "○ Optional"
                suggestion += f"  {atom['order']}. {atom_title} - {atom['purpose']} [{required_mark}]\n"
            
            if molecule.get('expected_outputs'):
                suggestion += f"Expected outputs: {', '.join(molecule['expected_outputs'])}\n"
        
        suggestion += f"\n**Business Value**: {use_case.get('business_value', 'N/A')}\n"
        
        if use_case.get('prerequisites'):
            suggestion += f"\n**Prerequisites**: {', '.join(use_case['prerequisites'])}\n"
        
        return suggestion
    
    def build_workflow_context(self, user_query: str) -> Dict[str, Any]:
        """
        Build comprehensive context for workflow generation
        Includes relevant atoms, molecules, and patterns
        """
        # Search for relevant atoms
        relevant_atoms = self.search_atoms_by_keywords(user_query, limit=10)
        
        # Find relevant molecules
        relevant_molecules = self.search_molecules_by_intent(user_query)
        
        # Try to find a matching workflow template
        workflow_template = None
        for template_key in ["basic_analysis", "comprehensive_eda", "predictive_modeling", "time_series_forecast"]:
            template = self.get_workflow_template(template_key)
            if template:
                use_cases = template.get("use_cases", [])
                if any(keyword in user_query.lower() for use_case in use_cases for keyword in use_case.lower().split()):
                    workflow_template = template
                    break
        
        context = {
            "user_query": user_query,
            "relevant_atoms": relevant_atoms,
            "relevant_molecules": relevant_molecules,
            "workflow_template": workflow_template,
            "sequencing_rules": self.workflow_sequences.get("sequencing_rules", {}),
            "total_atoms_available": len(self.atom_index),
            "total_molecule_patterns": len(self.molecule_index)
        }
        
        return context
    
    def generate_workflow_prompt_context(self, user_query: str) -> str:
        """
        Generate formatted context string for LLM prompt
        """
        context = self.build_workflow_context(user_query)
        
        prompt_context = f"""
# Workflow Knowledge Context

## Available Atoms ({context['total_atoms_available']} total):

### Top Relevant Atoms for this query:
"""
        
        for i, atom in enumerate(context['relevant_atoms'][:5], 1):
            prompt_context += f"\n{i}. **{atom['title']}** (ID: {atom['id']})"
            prompt_context += f"\n   Category: {atom['category']}"
            prompt_context += f"\n   Description: {atom['description']}"
            prompt_context += f"\n   Use Cases: {', '.join(atom['use_cases'][:3])}"
            prompt_context += "\n"
        
        if context['relevant_molecules']:
            prompt_context += "\n## Relevant Molecule Patterns:\n"
            for mol in context['relevant_molecules'][:3]:
                mol_data = mol['data']
                prompt_context += f"\n### {mol_data['name']}"
                prompt_context += f"\n   Purpose: {mol_data['purpose']}"
                prompt_context += f"\n   Typical Atoms: {', '.join(mol_data['typical_atoms'][:5])}"
                prompt_context += "\n"
        
        if context['workflow_template']:
            template = context['workflow_template']
            prompt_context += f"\n## Recommended Workflow Template: {template['name']}\n"
            prompt_context += f"Description: {template['description']}\n"
            prompt_context += f"Complexity: {template['complexity']}\n"
            prompt_context += "\nSequence:\n"
            for step in template['molecule_sequence']:
                prompt_context += f"{step['order']}. {step['molecule_type']}: {step['purpose']}\n"
                prompt_context += f"   Atoms: {', '.join(step['atoms'])}\n"
        
        prompt_context += "\n## Sequencing Rules:\n"
        rules = context['sequencing_rules'].get('general_principles', [])
        for rule in rules:
            prompt_context += f"- {rule}\n"
        
        return prompt_context


# Global RAG engine instance
_rag_engine = None

def get_rag_engine() -> WorkflowRAGEngine:
    """Get singleton RAG engine instance"""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = WorkflowRAGEngine()
    return _rag_engine


if __name__ == "__main__":
    # Test the RAG engine
    rag = get_rag_engine()
    
    # Test search
    print("=== Testing Atom Search ===")
    results = rag.search_atoms_by_keywords("load csv file", limit=3)
    for atom in results:
        print(f"- {atom['title']}: {atom['description']}")
    
    print("\n=== Testing Molecule Search ===")
    molecules = rag.search_molecules_by_intent("I want to clean and prepare my data")
    for mol in molecules:
        print(f"- {mol['data']['name']}: {mol['data']['purpose']}")
    
    print("\n=== Testing Workflow Context ===")
    context_str = rag.generate_workflow_prompt_context("I want to analyze sales data and create a forecast")
    print(context_str[:500] + "...")

