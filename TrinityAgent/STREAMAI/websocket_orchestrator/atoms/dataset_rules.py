"""Dataset-related atom rules and helpers."""

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


def atom_produces_dataset(atom_id: str | None) -> bool:
    """Return True when an atom is known to produce datasets."""

    return bool(atom_id) and atom_id in DATASET_OUTPUT_ATOMS


def atom_prefers_latest_dataset(atom_id: str | None) -> bool:
    """Return True when an atom should use the latest dataset if unspecified."""

    return bool(atom_id) and atom_id in PREFERS_LATEST_DATASET_ATOMS
