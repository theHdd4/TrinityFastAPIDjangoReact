"""
Atom endpoint mapping used by the Trinity AI Stream Orchestrator.

The original implementation pulled this data from the legacy SuperAgent
package.  Trinity AI is now the primary execution engine, so we keep a
lightweight mapping here that exposes the FastAPI routes mounted by
`TrinityAI/main_api.py`.
"""

from __future__ import annotations

ATOM_MAPPING = {
    "merge": {"endpoint": "/trinityai/merge"},
    "concat": {"endpoint": "/trinityai/concat"},
    "create-column": {"endpoint": "/trinityai/create-transform"},
    "dataframe-operations": {"endpoint": "/trinityai/dataframe-operations"},
    "groupby-wtg-avg": {"endpoint": "/trinityai/groupby"},
    "chart-maker": {"endpoint": "/trinityai/chart-maker"},
    "explore": {"endpoint": "/trinityai/explore"},
    "correlation": {"endpoint": "/trinityai/correlation"},
    "feature-overview": {"endpoint": "/trinityai/feature-overview"},
    "column-classifier": {"endpoint": "/trinityai/column-classifier"},
    "data-upload-validate": {"endpoint": "/trinityai/df-validate"},
    "scope-selector": {"endpoint": "/trinityai/scope"},
}


