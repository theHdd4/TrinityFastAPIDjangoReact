import pathlib
import sys

import pandas as pd
import pytest

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from app.features.groupby.year_utils import _ensure_year_identifier


def test_ensure_year_identifier_derives_from_date_column():
    frame = pd.DataFrame(
        {
            "order_date": ["2024-01-15", "2023-05-02"],
            "value": [10, 20],
        }
    )

    updated, identifiers, derived_from = _ensure_year_identifier(frame, ["year", "value"])

    assert "year" in updated.columns
    assert identifiers == ["year", "value"]
    assert derived_from == "order_date"
    assert updated["year"].tolist() == [2024, 2023]


def test_ensure_year_identifier_errors_without_date_like_columns():
    frame = pd.DataFrame({"category": ["a", "b"], "value": [1, 2]})

    with pytest.raises(ValueError) as excinfo:
        _ensure_year_identifier(frame, ["year", "category"])

    assert "unable to derive 'year'" in str(excinfo.value).lower()
