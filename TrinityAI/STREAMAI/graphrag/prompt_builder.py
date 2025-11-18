"""
GraphRAG-backed Phase-1 prompt assembly.

The builder queries the GraphRAG workspace and uses the returned context to
craft the planning prompt the LLM expects. Compared to the legacy builder, we
lean on GraphRAG to surface relevant atom documentation instead of manually
serialising the bespoke AtomGraph.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, List, Optional

from .client import GraphRAGQueryClient, GraphRAGQueryResult


@dataclass(slots=True)
class PhaseOnePrompt:
    """Structured data required for the planning LLM call."""

    prompt: str
    context: Dict[str, str]
    files_exist: bool
    prompt_files: List[str]


class GraphRAGPromptBuilder:
    """
    Construct the workflow planning prompt using GraphRAG search results.
    """

    def __init__(
        self,
        query_client: GraphRAGQueryClient,
        *,
        default_method: str = "global",
    ) -> None:
        self.query_client = query_client
        self.default_method = default_method

    def build_phase_one_prompt(
        self,
        user_prompt: str,
        available_files: List[str],
        files_exist: bool,
        prompt_files: List[str],
        *,
        method: Optional[str] = None,
        atom_reference: Optional[str] = None,
    ) -> PhaseOnePrompt:
        """
        Query GraphRAG and synthesise the Phase-1 LLM prompt.
        """
        method = method or self.default_method
        result = self.query_client.query(user_prompt, method=method)

        context_sections: Dict[str, str] = {}
        if result:
            context_sections["response"] = result.response.strip()
            if result.supporting_facts:
                context_sections["supporting_facts"] = result.supporting_facts.strip()
            if result.metadata:
                # Only keep JSON-serialisable fragments for prompt cleanliness.
                context_sections["metadata_excerpt"] = json.dumps(
                    self._trim_metadata(result.metadata),
                    indent=2,
                )

        available_listing = "\n".join(f"- {path}" for path in available_files) if available_files else "(No files detected yet)"
        referenced_files = ", ".join(prompt_files) if prompt_files else "None mentioned explicitly."
        file_rule = (
            "Files mentioned already exist. Skip any upload/validation atoms; act directly on available datasets."
            if files_exist
            else "If required files are missing, include a data-upload step before transformations."
        )

        graph_context = "\n\n".join(
            f"{header.upper()}:\n{snippet}"
            for header, snippet in context_sections.items()
            if snippet
        ) or "(GraphRAG context unavailable – rely on domain knowledge.)"

        atoms_section = atom_reference or "(Atom catalog unavailable — rely on GraphRAG guidance.)"

        prompt = f"""You are the Stream AI planning LLM. Use the provided GraphRAG knowledge and atom catalog to create an executable workflow.

USER REQUEST:
\"\"\"{user_prompt}\"\"\"

AVAILABLE FILES:
{available_listing}

FILES REFERENCED BY USER: {referenced_files}

GRAPH CONTEXT:
{graph_context}

AVAILABLE ATOMS:
{atoms_section}

RULES:
- {file_rule}
- Produce ordered steps (can be 2-10+ steps for complex tasks). Break down complex operations into individual steps.
- Use ONE atom per task for clarity (e.g., one dataframe-operations step for filtering, another for formulas, another for sorting).
- Merge/transform before visualisation.
- For dataframe-operations: Each operation type (filter, formula, sort, transform) should be a separate step when the workflow is complex.
- Each step MUST include `atom_id`, `description`, `prompt`, `inputs`, `files_used`, and `output_alias`.
- The `prompt` field should be ready to send to the atom without further reformatting.
- Long workflows are supported - break tasks into logical sequential steps.
- Respond in JSON only. No markdown fences.
"""

        return PhaseOnePrompt(
            prompt=prompt,
            context=context_sections,
            files_exist=files_exist,
            prompt_files=prompt_files,
        )

    @staticmethod
    def _trim_metadata(metadata: Dict[str, object]) -> Dict[str, object]:
        """
        Reduce potentially large metadata payloads to the most relevant keys.
        """
        keys_to_keep = [
            "source_documents",
            "chunks",
            "node_ids",
            "entities",
            "relationships",
        ]
        trimmed: Dict[str, object] = {}
        for key in keys_to_keep:
            if key in metadata:
                trimmed[key] = metadata[key]
        if not trimmed:
            trimmed = {"keys": list(metadata.keys())[:10]}
        return trimmed


