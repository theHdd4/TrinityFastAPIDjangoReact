"""
Atom endpoint mapping used by the Trinity AI Stream Orchestrator.

RESTORED FROM 18_NOV WORKING VERSION - Uses direct endpoints instead of unified executor.
This ensures results are returned in the correct format that UI expects.

The original implementation pulled this data from the legacy SuperAgent
package.  Trinity AI is now the primary execution engine, so we keep a
lightweight mapping here that exposes the FastAPI routes mounted by
`main_api.py` (root directory).
"""

from __future__ import annotations

# RESTORED: Use direct endpoints like the working 18_NOV version
# This ensures results come back in the correct format (merge_json, groupby_json, etc.)
# without needing transformation
ATOM_MAPPING = {
    "merge": {"endpoint": "/trinityai/merge"},
    "concat": {"endpoint": "/trinityai/concat"},
    "create-column": {"endpoint": "/trinityai/create-transform"},
    "dataframe-operations": {"endpoint": "/trinityai/dataframe-operations"},
    "groupby-wtg-avg": {"endpoint": "/trinityai/groupby"},
    "groupby": {"endpoint": "/trinityai/groupby"},  # Also support "groupby" atom_id
    "chart-maker": {"endpoint": "/trinityai/chart-maker"},
    "explore": {"endpoint": "/trinityai/explore"},
    "correlation": {"endpoint": "/trinityai/correlation"},
    "feature-overview": {"endpoint": "/trinityai/feature-overview"},
    "column-classifier": {"endpoint": "/trinityai/column-classifier"},
    "data-upload-validate": {"endpoint": "/trinityai/data-upload-validate"},
    "scope-selector": {"endpoint": "/trinityai/scope"},
    "fetch-atom": {"endpoint": "/trinityai/fetch-atom"},
}


