"""
GraphRAG integration scaffolding for Stream AI.

This package hosts the ingestion utilities, configuration helpers, and
workspace assets required to build a GraphRAG workspace from the Trinity
atom knowledge base. The initial version focuses on assembling the
documents that will later feed the official GraphRAG indexing pipeline.
"""

from __future__ import annotations

__all__ = [
    "DEFAULT_WORKSPACE_ROOT",
    "GRAPH_INPUT_DOCUMENTS_DIR",
    "GRAPH_INPUT_METADATA_DIR",
    "GraphRAGWorkspaceConfig",
]

from pathlib import Path

DEFAULT_WORKSPACE_ROOT = (
    Path(__file__).resolve().parents[1] / "graphrag_workspace"
)
GRAPH_INPUT_DOCUMENTS_DIR = DEFAULT_WORKSPACE_ROOT / "input" / "documents"
GRAPH_INPUT_METADATA_DIR = DEFAULT_WORKSPACE_ROOT / "input" / "metadata"

# Re-export config helpers for convenience.
from .config import GraphRAGWorkspaceConfig  # noqa: E402


