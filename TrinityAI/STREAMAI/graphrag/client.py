"""
Thin wrapper around Microsoft's GraphRAG query interface.

The official ``graphrag`` package exposes a high-level ``GraphRAG`` class that
can be initialised with a workspace root. The client below keeps the dependency
optional and provides a predictable interface for the Stream AI planner.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .config import GraphRAGWorkspaceConfig

logger = logging.getLogger(__name__)

try:  # pragma: no cover - import path depends on optional dependency
    from graphrag import GraphRAG  # type: ignore
except Exception:  # pragma: no cover
    GraphRAG = None  # type: ignore
    logger.debug("GraphRAG package not available; planner will use legacy prompts.")


class GraphRAGNotInstalled(RuntimeError):
    """Raised when the graphrag package is required but missing."""


@dataclass(slots=True)
class GraphRAGQueryResult:
    """Structured response from a GraphRAG query."""

    response: str
    supporting_facts: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class GraphRAGQueryClient:
    """
    Lightweight GraphRAG facade used by the Stream AI planner.

    The client hides the optional dependency and normalises the query output
    into text snippets that we can embed inside the planning prompt.
    """

    def __init__(
        self,
        workspace_config: GraphRAGWorkspaceConfig,
        require_package: bool = False,
    ) -> None:
        self.workspace_config = workspace_config

        if GraphRAG is None:
            if require_package:
                raise GraphRAGNotInstalled(
                    "The `graphrag` package is not installed. "
                    "Install it with `pip install graphrag` and ensure the workspace "
                    "has been indexed via `graphrag index --root <workspace>`."
                )
            self._client = None
            return

        workspace_root = workspace_config.workspace_root
        if not workspace_root.exists():
            logger.warning(
                "GraphRAG workspace directory does not exist: %s. "
                "Run the ingestion script and `graphrag index` first.",
                workspace_root,
            )

        try:
            self._client = GraphRAG(root=str(workspace_root))
        except Exception as exc:  # pragma: no cover - depends on external lib
            logger.error("Failed to initialise GraphRAG client: %s", exc, exc_info=True)
            if require_package:
                raise
            self._client = None

    @property
    def is_available(self) -> bool:
        """Return True when the GraphRAG client is ready for queries."""
        return self._client is not None

    def query(
        self,
        question: str,
        method: str = "global",
        **kwargs: Any,
    ) -> GraphRAGQueryResult | None:
        """
        Execute a query against the GraphRAG workspace.

        Parameters
        ----------
        question:
            User request that should be passed to GraphRAG.
        method:
            GraphRAG search method (``global`` or ``local``). Defaults to
            ``global`` to retrieve a broad context.

        Returns
        -------
        GraphRAGQueryResult | None
            Normalised result, or ``None`` if the query subsystem is not ready.
        """
        if not self._client:
            logger.info("GraphRAG client unavailable; skipping query.")
            return None

        logger.info("📡 Querying GraphRAG workspace via %s search", method)
        response = self._client.query(question=question, method=method, **kwargs)

        # The official client may return strings or dictionaries depending on
        # response mode. Normalise to GraphRAGQueryResult.
        if isinstance(response, str):
            return GraphRAGQueryResult(response=response)

        if isinstance(response, dict):
            answer = response.get("response") or response.get("answer") or ""
            supporting = response.get("context") or response.get("supporting_facts")
            return GraphRAGQueryResult(
                response=str(answer),
                supporting_facts=str(supporting) if supporting else None,
                metadata=response,
            )

        logger.warning("Unexpected GraphRAG response type: %r", type(response))
        return None


