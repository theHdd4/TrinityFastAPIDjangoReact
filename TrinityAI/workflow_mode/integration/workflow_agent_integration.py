"""
Integration module for connecting RAG engine with Workflow Agent
Provides RAG-enhanced context for workflow generation
"""

import sys
from pathlib import Path

# Add parent directory to path
parent_dir = Path(__file__).parent.parent.parent
if str(parent_dir) not in sys.path:
    sys.path.append(str(parent_dir))

from workflow_mode.retrieval.rag_engine import get_rag_engine


def enhance_workflow_prompt_with_rag(user_prompt: str, files_with_columns: dict = None, mode: str = "workflow") -> str:
    """
    Enhance workflow generation prompt with RAG context
    
    Args:
        user_prompt: User's natural language request
        files_with_columns: Available data files (optional)
        mode: "workflow" or "laboratory" - changes AI behavior
    
    Returns:
        Enhanced prompt with RAG context
    """
    rag = get_rag_engine()
    
    if mode == "workflow":
        # Workflow Mode: AI suggests molecule compositions
        return _enhance_workflow_mode_prompt(user_prompt, files_with_columns, rag)
    else:
        # Laboratory Mode: AI executes agents directly
        return _enhance_laboratory_mode_prompt(user_prompt, files_with_columns, rag)


def _enhance_workflow_mode_prompt(user_prompt: str, files_with_columns: dict, rag) -> str:
    """
    Workflow Mode specific prompt - focus on molecule composition
    """
    # Search for matching use cases
    use_cases = rag.search_use_case_workflows(user_prompt)
    
    enhanced_prompt = f"""
# WORKFLOW MODE - Molecule Composition Assistant

## User Request: {user_prompt}

## Your Role:
You are helping the user CREATE MOLECULES (groups of atoms) for their workflow.
**DO NOT execute agents directly** - instead, suggest how to group atoms into molecules.

"""
    
    # If we found a matching use case, use it
    if use_cases and use_cases[0]['score'] > 10:
        best_match = use_cases[0]
        use_case_key = best_match['key']
        
        molecule_suggestions = rag.generate_molecule_suggestions_for_use_case(use_case_key)
        
        enhanced_prompt += f"""
## Matching Use Case Found!

{molecule_suggestions}

## Instructions:
Present these molecule compositions to the user. Explain:
1. What each molecule does
2. Which atoms are in each molecule
3. How the molecules connect in sequence
4. The business value of this workflow

Ask if they want to create this workflow or make modifications.
"""
    else:
        # No exact match - provide general guidance
        relevant_atoms = rag.search_atoms_by_keywords(user_prompt, limit=10)
        
        enhanced_prompt += f"""
## Relevant Atoms for this task:

"""
        for i, atom in enumerate(relevant_atoms[:8], 1):
            enhanced_prompt += f"{i}. **{atom['title']}** ({atom['id']})\n"
            enhanced_prompt += f"   - {atom['description']}\n"
            enhanced_prompt += f"   - Use cases: {', '.join(atom['use_cases'][:2])}\n\n"
        
        enhanced_prompt += """
## Instructions:
Based on the user's request and the relevant atoms above:

1. **Suggest Molecule Groupings**:
   - Group 2-4 related atoms into each molecule
   - Each molecule should accomplish a specific sub-goal
   - Typical pattern:
     * Molecule 1: Data loading & preparation (2-3 atoms)
     * Molecule 2: Analysis/Modeling (2-3 atoms)
     * Molecule 3: Visualization/Reporting (1-2 atoms)

2. **For Each Molecule, Specify**:
   - Molecule name (descriptive)
   - Purpose/goal
   - Which atoms to include (with order)
   - Expected outputs

3. **Show Sequential Flow**:
   - How molecules connect: Molecule 1 → Molecule 2 → Molecule 3

Example Response Format:
"I'll help you create a workflow for [task]. Here's how I suggest grouping the atoms:

**Molecule 1: [Name]**
Purpose: [What it does]
Atoms:
1. [atom-id] - [purpose]
2. [atom-id] - [purpose]

**Molecule 2: [Name]**
Purpose: [What it does]
Atoms:
1. [atom-id] - [purpose]
..."
"""
    
    # Add available files
    if files_with_columns:
        enhanced_prompt += "\n## Available Data Files:\n"
        for filename, info in list(files_with_columns.items())[:5]:
            enhanced_prompt += f"- {filename}: {len(info.get('columns', []))} columns\n"
    
    return enhanced_prompt


def _enhance_laboratory_mode_prompt(user_prompt: str, files_with_columns: dict, rag) -> str:
    """
    Laboratory Mode specific prompt - focus on direct execution
    """
    rag_context = rag.generate_workflow_prompt_context(user_prompt)
    
    enhanced_prompt = f"""
# LABORATORY MODE - Direct Agent Execution

**User Request**: {user_prompt}

{rag_context}

## Available Data Files:
"""
    
    if files_with_columns:
        for filename, info in list(files_with_columns.items())[:5]:
            enhanced_prompt += f"\n- {filename}: {len(info.get('columns', []))} columns"
    else:
        enhanced_prompt += "\nNo data files currently loaded."
    
    enhanced_prompt += """

## Your Task:
Generate a workflow JSON that will be EXECUTED DIRECTLY with the appropriate agents and atoms.
The workflow should follow logical order (data loading → preparation → analysis → visualization).
"""
    
    return enhanced_prompt


def get_atom_recommendations(current_workflow: list) -> list:
    """
    Get recommendations for next atoms based on current workflow state
    
    Args:
        current_workflow: List of atoms/molecules in current workflow
    
    Returns:
        List of recommended next atoms
    """
    rag = get_rag_engine()
    
    if not current_workflow:
        # Recommend starting atoms (data sources)
        return rag.search_atoms_by_keywords("data upload csv import", limit=5)
    
    # Get last atom in workflow
    last_item = current_workflow[-1]
    if isinstance(last_item, dict):
        last_atom_id = last_item.get('atom_id') or last_item.get('id')
    else:
        last_atom_id = last_item
    
    # Get recommendations based on last atom
    recommendations = rag.recommend_next_atoms(last_atom_id)
    
    return recommendations if recommendations else []


def validate_workflow_sequence(workflow: list) -> dict:
    """
    Validate workflow sequence against RAG knowledge
    
    Args:
        workflow: List of workflow steps
    
    Returns:
        Validation result with issues and suggestions
    """
    rag = get_rag_engine()
    
    issues = []
    suggestions = []
    
    # Get sequencing rules
    rules = rag.workflow_sequences.get("sequencing_rules", {})
    dependencies = rules.get("dependencies", {})
    
    # Check if data ingestion comes first
    if workflow:
        first_step = workflow[0]
        first_atom = first_step.get('atom_id') if isinstance(first_step, dict) else first_step
        atom_details = rag.get_atom_details(first_atom)
        
        if atom_details and atom_details.get('category') != 'Data Sources':
            issues.append("Workflow should start with data loading (Data Sources category)")
            suggestions.append("Add a data source atom (csv-import, data-upload-validate, or database-connect) as the first step")
    
    # Check for proper sequencing
    atom_categories_seen = []
    for step in workflow:
        atom_id = step.get('atom_id') if isinstance(step, dict) else step
        atom_details = rag.get_atom_details(atom_id)
        if atom_details:
            category = atom_details.get('category')
            atom_categories_seen.append(category)
    
    # Validate that processing comes before analysis
    if 'Analytics' in atom_categories_seen and 'Data Processing' not in atom_categories_seen:
        issues.append("Analytics atoms used without data processing")
        suggestions.append("Add data processing/preparation atoms before analytics")
    
    # Validate that modeling comes after analysis (if applicable)
    if 'Machine Learning' in atom_categories_seen and 'Analytics' not in atom_categories_seen:
        suggestions.append("Consider adding exploratory analysis before building ML models")
    
    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "suggestions": suggestions,
        "categories_used": list(set(atom_categories_seen))
    }


def get_workflow_templates() -> dict:
    """
    Get all available workflow templates
    
    Returns:
        Dictionary of workflow templates
    """
    rag = get_rag_engine()
    return rag.workflow_sequences.get("workflow_templates", {})


def search_atoms_for_task(task_description: str, limit: int = 10) -> list:
    """
    Search for atoms relevant to a specific task
    
    Args:
        task_description: Natural language task description
        limit: Maximum number of atoms to return
    
    Returns:
        List of relevant atoms
    """
    rag = get_rag_engine()
    return rag.search_atoms_by_keywords(task_description, limit=limit)


# Export functions for use in workflow agent
__all__ = [
    'enhance_workflow_prompt_with_rag',
    'get_atom_recommendations',
    'validate_workflow_sequence',
    'get_workflow_templates',
    'search_atoms_for_task'
]


if __name__ == "__main__":
    # Test integration
    print("=== Testing Workflow Agent Integration ===\n")
    
    # Test 1: Enhance prompt
    print("1. Enhanced Prompt for: 'Analyze sales data and create forecast'")
    enhanced = enhance_workflow_prompt_with_rag("Analyze sales data and create forecast")
    print(enhanced[:300] + "...\n")
    
    # Test 2: Get recommendations
    print("2. Recommendations after 'csv-import':")
    recommendations = get_atom_recommendations([{'atom_id': 'csv-import'}])
    for rec in recommendations[:3]:
        print(f"   - {rec['title']}")
    print()
    
    # Test 3: Validate sequence
    print("3. Validating workflow sequence:")
    test_workflow = [
        {'atom_id': 'csv-import'},
        {'atom_id': 'feature-overview'},
        {'atom_id': 'chart-maker'}
    ]
    validation = validate_workflow_sequence(test_workflow)
    print(f"   Valid: {validation['valid']}")
    print(f"   Categories: {validation['categories_used']}")
    if validation['suggestions']:
        print(f"   Suggestions: {validation['suggestions'][0]}")

