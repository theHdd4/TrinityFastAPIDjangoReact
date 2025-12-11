"""
Constant definitions for the WebSocket orchestrator.
"""

DATASET_OUTPUT_ATOMS = {
    "data-upload-validate",
    "dataframe-operations",
    "groupby-wtg-avg",
    "create-column",
    "create-transform",
    "merge",
    "concat",
    "pivot-table",
}

PREFERS_LATEST_DATASET_ATOMS = {
    "dataframe-operations",
    "groupby-wtg-avg",
    "create-column",
    "create-transform",
    "chart-maker",
}
