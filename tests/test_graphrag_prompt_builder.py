from __future__ import annotations

from dataclasses import dataclass

from TrinityAI.STREAMAI.graphrag.client import GraphRAGQueryResult
from TrinityAI.STREAMAI.graphrag.prompt_builder import GraphRAGPromptBuilder


@dataclass
class _CapturedQueryClient:
    result: GraphRAGQueryResult | None
    captured_question: str | None = None
    captured_method: str | None = None

    def query(self, question: str, method: str = "global", **_: object) -> GraphRAGQueryResult | None:
        self.captured_question = question
        self.captured_method = method
        return self.result


def test_prompt_builder_includes_graphrag_context():
    client = _CapturedQueryClient(
        GraphRAGQueryResult(
            response="Focus on merge then chart-maker.",
            supporting_facts="merge handles dataset joins; chart-maker visualises results.",
            metadata={
                "source_documents": ["doc-A"],
                "extra": "ignored-value",
            },
        )
    )
    builder = GraphRAGPromptBuilder(query_client=client)

    prompt_spec = builder.build_phase_one_prompt(
        user_prompt="Merge the revenue files and plot the trend.",
        available_files=["/mnt/data/revenue_q1.arrow", "/mnt/data/revenue_q2.arrow"],
        files_exist=True,
        prompt_files=["revenue_q1.arrow", "revenue_q2.arrow"],
        atom_reference="1. merge - join datasets",
    )

    assert client.captured_question == "Merge the revenue files and plot the trend."
    assert client.captured_method == "global"

    assert "GRAPH CONTEXT" in prompt_spec.prompt
    assert "Focus on merge then chart-maker" in prompt_spec.prompt
    assert "supporting_facts" in prompt_spec.prompt
    assert "source_documents" in prompt_spec.context["metadata_excerpt"]
    assert "Files mentioned already exist" in prompt_spec.prompt
    assert "merge - join datasets" in prompt_spec.prompt


def test_prompt_builder_falls_back_when_context_missing():
    client = _CapturedQueryClient(result=None)
    builder = GraphRAGPromptBuilder(query_client=client)

    prompt_spec = builder.build_phase_one_prompt(
        user_prompt="Show me a quick summary of the data.",
        available_files=[],
        files_exist=False,
        prompt_files=[],
        atom_reference="1. merge - join datasets",
    )

    assert "(GraphRAG context unavailable" in prompt_spec.prompt
    assert "include a data-upload step" in prompt_spec.prompt
    assert prompt_spec.context == {}
    assert "merge - join datasets" in prompt_spec.prompt


