"""
Stream RAG Engine
=================

Enhanced RAG engine specifically for Trinity AI sequential atom execution.
Extends the workflow RAG engine with atom sequencing capabilities.
"""

import json
import logging
import sys
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

logger = logging.getLogger("trinity.trinityai.rag")

# Add workflow_mode to path for importing WorkflowRAGEngine
WORKFLOW_MODE_PATH = Path(__file__).resolve().parent.parent / "workflow_mode"
if str(WORKFLOW_MODE_PATH) not in sys.path:
    sys.path.append(str(WORKFLOW_MODE_PATH))

try:
    from retrieval.rag_engine import WorkflowRAGEngine, get_rag_engine
    WORKFLOW_RAG_AVAILABLE = True
    logger.info("✅ WorkflowRAGEngine imported successfully")
except ImportError as e:
    WORKFLOW_RAG_AVAILABLE = False
    logger.warning(f"⚠️ WorkflowRAGEngine not available: {e}")


class StreamRAGEngine:
    """
    Enhanced RAG engine for Trinity AI with atom sequencing capabilities.
    Extends WorkflowRAGEngine with dependency resolution and sequence generation.
    """
    
    def __init__(self):
        """Initialize Stream RAG Engine"""
        self.base_path = Path(__file__).resolve().parent.parent / "workflow_mode" / "rag"
        
        # Load base workflow RAG if available
        self.workflow_rag = None
        if WORKFLOW_RAG_AVAILABLE:
            try:
                self.workflow_rag = get_rag_engine()
                logger.info("✅ Workflow RAG engine loaded")
            except Exception as e:
                logger.warning(f"⚠️ Could not load workflow RAG: {e}")
        
        # Load atom sequences
        self.atom_sequences = self._load_json("atom_sequences.json")
        self.sequences = self.atom_sequences.get("sequences", {})
        self.dependency_rules = self.atom_sequences.get("dependency_rules", {})
        self.sequencing_rules = self.atom_sequences.get("sequencing_rules", {})
        self.atom_metadata = self.atom_sequences.get("atom_metadata_enhancements", {})
        
        # Load atom requirements (parameters needed for execution)
        self.atom_requirements = self._load_json("atom_requirements.json")
        self.atom_params = self.atom_requirements.get("atoms", {})
        self.extraction_guide = self.atom_requirements.get("parameter_extraction_guide", {})

        # Load prompt knowledge base for atoms
        prompt_knowledge = self._load_json("atom_knowledge_prompts.json")
        self.atom_prompt_guidance = prompt_knowledge.get("atoms", {})
        
        logger.info(f"✅ Loaded {len(self.sequences)} sequence patterns")
        logger.info(f"✅ Loaded {len(self.dependency_rules)} dependency rules")
        logger.info(f"✅ Loaded {len(self.atom_params)} atom parameter specs")
        logger.info(f"✅ Loaded prompt guidance for {len(self.atom_prompt_guidance)} atoms")
    
    def _load_json(self, filename: str) -> Dict:
        """Load JSON file from rag directory"""
        file_path = self.base_path / filename
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"❌ Error loading {filename}: {e}")
            return {}
    
    def find_matching_sequence(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Find a matching predefined sequence for the query.
        
        Args:
            query: User's query
            
        Returns:
            Matching sequence dict or None
        """
        query_lower = query.lower()
        
        # Check each sequence's use cases
        best_match = None
        best_score = 0
        
        for seq_key, seq_data in self.sequences.items():
            score = 0
            
            # Check use cases
            for use_case in seq_data.get("use_cases", []):
                use_case_words = use_case.lower().split()
                if any(word in query_lower for word in use_case_words):
                    score += 3
            
            # Check description
            desc_words = seq_data.get("description", "").lower().split()
            if any(word in query_lower for word in desc_words):
                score += 1
            
            # Check atom names
            for atom_id in seq_data.get("atoms", []):
                atom_name = atom_id.replace("-", " ")
                if atom_name in query_lower:
                    score += 5
            
            if score > best_score:
                best_score = score
                best_match = {
                    "key": seq_key,
                    "data": seq_data,
                    "score": score
                }
        
        if best_match and best_score >= 3:
            logger.info(f"✅ Found matching sequence: {best_match['key']} (score: {best_score})")
            return best_match
        
        return None
    
    def get_atom_dependencies(self, atom_id: str) -> Dict[str, Any]:
        """
        Get dependency information for an atom.
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Dependency information
        """
        return self.dependency_rules.get(atom_id, {})
    
    def get_atom_metadata(self, atom_id: str) -> Dict[str, Any]:
        """
        Get enhanced metadata for an atom.
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Enhanced metadata including input/output types
        """
        return self.atom_metadata.get(atom_id, {})

    def get_atom_prompt_guidance(self, atom_id: str) -> Dict[str, Any]:
        """Return prompt crafting guidance for a given atom."""
        return self.atom_prompt_guidance.get(atom_id, {})
    
    def validate_sequence(self, atom_sequence: List[str]) -> Tuple[bool, List[str]]:
        """
        Validate if an atom sequence has proper dependencies.
        
        Args:
            atom_sequence: List of atom IDs in order
            
        Returns:
            (is_valid, list of validation errors)
        """
        errors = []
        
        # Check if first atom can be first
        if atom_sequence:
            first_atom = atom_sequence[0]
            first_deps = self.get_atom_dependencies(first_atom)
            if first_deps.get("must_be_first") == False:
                errors.append(f"Atom '{first_atom}' cannot be first in sequence")
            
            # data-upload-validate should typically be first unless data already exists
            if first_atom != "data-upload-validate":
                logger.warning(f"⚠️ Sequence doesn't start with data-upload-validate")
        
        # Check dependencies for each atom
        provided_outputs = set()
        for i, atom_id in enumerate(atom_sequence):
            deps = self.get_atom_dependencies(atom_id)
            required = deps.get("requires", [])
            
            # Check if required inputs are provided by previous atoms
            for req in required:
                if req not in provided_outputs and i > 0:
                    # Check if this is a reasonable dependency
                    if req not in ["DataFrame", "processed_data"]:  # Generic types are okay
                        logger.warning(f"⚠️ Atom '{atom_id}' requires '{req}' which may not be provided")
            
            # Add what this atom provides
            provides = deps.get("provides", [])
            provided_outputs.update(provides)
        
        # Check for incompatible sequences
        incompatible = self.sequencing_rules.get("incompatible_sequences", [])
        for incomp_rule in incompatible:
            incomp_atoms = set(incomp_rule["atoms"])
            if incomp_atoms.issubset(set(atom_sequence)):
                errors.append(f"Incompatible atoms in sequence: {incomp_rule['reason']}")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def recommend_atom_sequence(self, query: str, max_atoms: int = 6) -> List[Dict[str, Any]]:
        """
        Recommend an atom sequence based on query analysis.
        
        Args:
            query: User's query
            max_atoms: Maximum number of atoms in sequence
            
        Returns:
            List of atom dicts with metadata
        """
        query_lower = query.lower()
        
        # First, check for predefined sequences
        matching_seq = self.find_matching_sequence(query)
        if matching_seq:
            atoms = matching_seq["data"]["atoms"]
            return [
                {
                    "atom_id": atom_id,
                    "metadata": self.get_atom_metadata(atom_id),
                    "dependencies": self.get_atom_dependencies(atom_id),
                    "reason": f"Part of {matching_seq['data']['name']} pattern"
                }
                for atom_id in atoms[:max_atoms]
            ]
        
        # Manual keyword-based sequence generation removed
        # All workflow generation must use AI/LLM, not manual keyword matching
        logger.warning("⚠️ Manual keyword-based sequence generation removed. All workflows must be generated via AI/LLM.")
        return []
    
    def generate_rag_context_for_sequence(self, query: str) -> str:
        """
        Generate RAG context for LLM prompt to create sequence.
        
        Args:
            query: User's query
            
        Returns:
            Formatted context string
        """
        context = "# Stream AI Knowledge Context\n\n"
        
        # Add relevant atoms from base RAG
        if self.workflow_rag:
            try:
                relevant_atoms = self.workflow_rag.search_atoms_by_keywords(query, limit=8)
                if relevant_atoms:
                    context += "## Relevant Atoms:\n\n"
                    for i, atom in enumerate(relevant_atoms, 1):
                        atom_id = atom.get("id", "unknown")
                        metadata = self.get_atom_metadata(atom_id)
                        deps = self.get_atom_dependencies(atom_id)
                        
                        context += f"{i}. **{atom['title']}** (ID: `{atom_id}`)\n"
                        context += f"   - Description: {atom.get('description', 'N/A')[:150]}...\n"
                        context += f"   - Can follow: {', '.join(metadata.get('can_follow', [])[:3])}\n"
                        context += f"   - Provides: {', '.join(deps.get('provides', []))}\n"
                        context += f"   - Typical position: {metadata.get('typical_position', 'any')}\n\n"
            except Exception as e:
                logger.warning(f"⚠️ Could not get atoms from workflow RAG: {e}")
        
        # Add matching sequence if found
        matching_seq = self.find_matching_sequence(query)
        if matching_seq:
            seq_data = matching_seq["data"]
            context += f"\n## Suggested Sequence Pattern: {seq_data['name']}\n\n"
            context += f"Description: {seq_data['description']}\n"
            context += f"Atoms: {' → '.join(seq_data['atoms'])}\n"
            context += f"Estimated duration: {seq_data.get('estimated_duration', 'unknown')}\n\n"
        
        # Add sequencing rules
        context += "\n## Sequencing Rules:\n\n"
        for principle in self.sequencing_rules.get("general_principles", []):
            context += f"- {principle}\n"
        
        return context
    
    def get_typical_next_atoms(self, current_atom_id: str) -> List[str]:
        """
        Get typical next atoms after the current atom.
        
        Args:
            current_atom_id: Current atom ID
            
        Returns:
            List of atom IDs that typically follow
        """
        metadata = self.get_atom_metadata(current_atom_id)
        return metadata.get("should_precede", [])
    
    def get_atom_requirements(self, atom_id: str) -> Dict[str, Any]:
        """
        Get parameter requirements for an atom.
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Dict with required_parameters, optional_parameters, and prompt_template
        """
        return self.atom_params.get(atom_id, {})
    
    def get_parameter_extraction_guide(self, atom_id: str) -> Dict[str, Any]:
        """
        Get guide for extracting parameters from natural language.
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Dict with example queries and extraction rules
        """
        return self.extraction_guide.get(atom_id, {})
    
    def get_atom_specific_context(self, atom_id: str) -> str:
        """
        Get enriched context specific to an atom for focused LLM calls.
        
        This is used in Phase 2 to provide atom-specific knowledge when
        generating parameters for a step.
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Formatted context string with atom-specific knowledge
        """
        metadata = self.get_atom_metadata(atom_id)
        dependencies = self.get_atom_dependencies(atom_id)
        
        context = f"# Atom-Specific Knowledge: {atom_id}\n\n"
        
        # Add description from metadata
        if metadata:
            context += "## Description:\n"
            description = metadata.get("description", "N/A")
            context += f"{description}\n\n"
            
            # Add input/output types
            input_types = metadata.get("input_types", [])
            output_types = metadata.get("output_types", [])
            if input_types:
                context += f"**Accepts**: {', '.join(input_types)}\n"
            if output_types:
                context += f"**Produces**: {', '.join(output_types)}\n\n"
            
            # Add typical position
            position = metadata.get("typical_position", "")
            if position:
                context += f"**Typical Position in Workflow**: {position}\n\n"
            
            # Add what atoms can follow this one
            can_follow = metadata.get("can_follow", [])
            if can_follow:
                context += f"**Can Follow After**: {', '.join(can_follow[:5])}\n"
            
            # Add what atoms should follow this one
            should_precede = metadata.get("should_precede", [])
            if should_precede:
                context += f"**Should Precede**: {', '.join(should_precede[:5])}\n"
            
            context += "\n"
        
        # Add dependency information
        if dependencies:
            context += "## Dependencies:\n"
            
            requires = dependencies.get("requires", [])
            if requires:
                context += f"**Requires**: {', '.join(requires)}\n"
            
            provides = dependencies.get("provides", [])
            if provides:
                context += f"**Provides**: {', '.join(provides)}\n"
            
            min_inputs = dependencies.get("min_inputs")
            if min_inputs:
                context += f"**Minimum Inputs**: {min_inputs}\n"
            
            must_be_first = dependencies.get("must_be_first")
            if must_be_first is not None:
                context += f"**Must Be First**: {must_be_first}\n"
            
            context += "\n"
        
        # Add specific guidance based on atom type
        context += self._get_atom_specific_guidance(atom_id)
        
        return context
    
    def _get_atom_specific_guidance(self, atom_id: str) -> str:
        """Get specific guidance for parameter generation based on atom type"""
        
        guidance_map = {
            "data-upload-validate": """
## Parameter Generation Guidance:
- Look for file names mentioned in the user's request
- Add .arrow or .csv extension if not present
- This is typically the first step in any workflow
""",
            "dataframe-operations": """
## Parameter Generation Guidance:
- Extract filter conditions from phrases like "where", "filter", "revenue > 1000"
- For sorting, look for keywords: "sort by", "order by"
- For column selection, look for: "select", "choose", "only columns"
- Always reference the output file from the previous step as data_source
""",
            "groupby-wtg-avg": """
## Parameter Generation Guidance:
- Extract grouping columns from phrases like "group by region", "aggregate by category"
- Look for aggregation keywords: sum, average, mean, count, min, max
- Use the output file from previous step as data_source
- Group columns should be categorical/identifier columns
""",
            "merge": """
## Parameter Generation Guidance:
- Requires TWO data sources (file1, file2)
- Look for keywords: "merge", "join", "combine", "vlookup"
- Detect join type: "inner" (default), "outer", "left", "right"
- Join columns are often mentioned explicitly or auto-detected
""",
            "concat": """
## Parameter Generation Guidance:
- Requires TWO data sources (file1, file2)
- Look for keywords: "concat", "concatenate", "stack", "append"
- Default direction is "vertical" (stack rows)
- Use "horizontal" for adding columns side-by-side
""",
            "chart-maker": """
## Parameter Generation Guidance:
- Detect chart type from keywords: bar, line, scatter, pie, heatmap
- Extract x-axis and y-axis column names from context
- Use the output file from previous step as data_source
- Chart title can be inferred from the analysis task
""",
            "feature-overview": """
## Parameter Generation Guidance:
- Requires just the data_source parameter
- Use output file from previous step or loaded data file
- This atom generates statistical summaries automatically
""",
            "correlation": """
## Parameter Generation Guidance:
- Requires data_source parameter
- Optionally specify columns to correlate (default: all numeric)
- Method can be: pearson (default), spearman, kendall
- Use output from previous step that has numeric columns
"""
        }
        
        return guidance_map.get(atom_id, "\n## Parameter Generation Guidance:\nFollow the parameter schema and use previous step outputs when applicable.\n")


# Global instance
_stream_rag_engine: Optional[StreamRAGEngine] = None


def get_stream_rag_engine() -> StreamRAGEngine:
    """
    Get singleton Stream RAG engine instance.
    
    Returns:
        StreamRAGEngine instance
    """
    global _stream_rag_engine
    if _stream_rag_engine is None:
        _stream_rag_engine = StreamRAGEngine()
        logger.info("✅ Global StreamRAGEngine instance created")
    return _stream_rag_engine


# For testing
if __name__ == "__main__":
    # Test the engine
    rag = StreamRAGEngine()
    
    # Test sequence matching
    query = "Load sales.csv, filter revenue > 1000, group by region, and create a chart"
    print(f"\n{'='*80}")
    print(f"Query: {query}")
    print(f"{'='*80}\n")
    
    # Find matching sequence
    matching = rag.find_matching_sequence(query)
    if matching:
        print(f"Matching sequence: {matching['data']['name']}")
        print(f"Score: {matching['score']}")
    
    # Get recommended sequence
    recommended = rag.recommend_atom_sequence(query)
    print(f"\nRecommended sequence ({len(recommended)} atoms):")
    for i, atom in enumerate(recommended, 1):
        print(f"{i}. {atom['atom_id']} - {atom['reason']}")
    
    # Validate sequence
    atom_ids = [a["atom_id"] for a in recommended]
    is_valid, errors = rag.validate_sequence(atom_ids)
    print(f"\nSequence validation: {'✅ Valid' if is_valid else '❌ Invalid'}")
    if errors:
        for error in errors:
            print(f"  - {error}")
    
    # Generate RAG context
    context = rag.generate_rag_context_for_sequence(query)
    print(f"\nRAG Context (first 500 chars):\n{context[:500]}...")

