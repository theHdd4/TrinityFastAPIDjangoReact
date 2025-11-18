"""Configuration helpers for the Stream AI GraphRAG workspace."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from . import DEFAULT_WORKSPACE_ROOT

# Default model identifiers are placeholders – the actual providers/models are
# resolved at runtime using environment variables so deployments can wire Azure
# OpenAI, OpenAI, or other providers supported by GraphRAG without changing
# code. Later phases will surface these values through application settings.
DEFAULT_EMBEDDING_MODEL_ENV: Final[str] = "GRAPHRAG_EMBED_MODEL"
DEFAULT_COMPLETION_MODEL_ENV: Final[str] = "GRAPHRAG_LLM_MODEL"


@dataclass(frozen=True, slots=True)
class GraphRAGWorkspaceConfig:
    """
    Materialized paths used by the ingestion and querying utilities.

    The workspace mostly follows the directory layout created by
    ``graphrag init``. We keep the layout explicit so Stream AI can discover
    assets programmatically (important for test fixtures and later CI steps).
    """

    workspace_root: Path = DEFAULT_WORKSPACE_ROOT

    @property
    def documents_dir(self) -> Path:
        return self.workspace_root / "input" / "documents"

    @property
    def metadata_dir(self) -> Path:
        return self.workspace_root / "input" / "metadata"

    @property
    def settings_file(self) -> Path:
        return self.workspace_root / "settings.yaml"

    @property
    def storage_dir(self) -> Path:
        return self.workspace_root / "storage"


DEFAULT_WORKSPACE_CONFIG = GraphRAGWorkspaceConfig()


