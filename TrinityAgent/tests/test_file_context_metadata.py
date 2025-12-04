import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from TrinityAgent.STREAMAI.file_context_resolver import FileContextResolver


def test_condense_metadata_includes_value_samples_and_note():
    resolver = FileContextResolver()
    metadata = {
        "total_rows": 100,
        "total_columns": 3,
        "columns": {
            "category": {
                "data_type": "string",
                "unique_values": ["Books", "Toys", "Home", 123],
            },
            "value": {"data_type": "int"},
        },
        "statistical_summary": {
            "value": {"count": 100, "mean": 10, "min": 0, "max": 20}
        },
    }

    summary = resolver._condense_metadata("orders.csv", metadata, ["category", "value"])  # noqa: SLF001

    # Ensure unique values are stringified and clearly separated from column names
    assert "unique_values" in summary
    assert summary["unique_values"]["category"] == ["Books", "Toys", "Home", "123"]

    # Value samples should carry a guard note and stay within the categorical column
    value_samples = summary.get("value_samples", {}).get("category")
    assert value_samples is not None
    assert value_samples["examples"] == ["Books", "Toys", "Home", "123"]
    assert "not treat" in value_samples["note"].lower()

    # The summary should include a global note reminding the model not to treat samples as columns
    assert "value_sample_note" in summary
    assert "valid columns" in summary["value_sample_note"].lower()

    # Numeric columns should still include stats
    stats = summary.get("statistical_summary", {}).get("value")
    assert stats == {"count": 100, "mean": 10, "min": 0, "max": 20}
