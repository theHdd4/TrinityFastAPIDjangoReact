import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / "app" / "features" / "exhibition" / "catalogue.py"
_spec = importlib.util.spec_from_file_location("exhibition_catalogue", MODULE_PATH)
_module = importlib.util.module_from_spec(_spec)
assert _spec is not None and _spec.loader is not None
_spec.loader.exec_module(_module)

build_catalogue_metadata = _module.build_catalogue_metadata
merge_catalogue_components = _module.merge_catalogue_components


@pytest.mark.parametrize(
    "components",
    [
        {"skuStatistics": True, "trendAnalysis": False},
        {"skuStatistics": True, "trendAnalysis": True},
    ],
)
def test_build_catalogue_metadata_generates_unique_components(components):
    feature_overview = [
        {
            "atomId": "atom-1",
            "cardId": "card-1",
            "components": components,
            "skus": [
                {"id": "sku-123", "title": "Alpha", "details": {"region": "US"}},
            ],
        }
    ]

    updated, catalogue_entries = build_catalogue_metadata(feature_overview)

    assert len(updated) == 1
    sku = updated[0]["skus"][0]
    assert sku["id"] == "sku-123"
    assert "catalogue_components" in sku
    enabled = [payload["type"] for payload in sku["catalogue_components"]]
    for key, value in components.items():
        if value:
            assert key in enabled

    titles = {entry["catalogue_title"] for entry in catalogue_entries}
    assert all("Alpha" in title for title in titles)
    assert len(catalogue_entries) == len(sku["catalogue_components"])
    assert all("metadata" in entry for entry in catalogue_entries)


def test_build_catalogue_metadata_with_statistical_summaries():
    feature_overview = [
        {
            "atomId": "atom-2",
            "cardId": "card-2",
            "skus": [
                {
                    "id": "sku-001",
                    "title": "Gamma",
                    "statistical_summaries": [
                        {
                            "metric": "Revenue",
                            "metric_label": "Revenue",
                            "summary": {"avg": 100, "min": 80, "max": 120},
                            "timeseries": [
                                {"date": "2024-01-01", "value": 90},
                                {"date": "2024-02-01", "value": 110},
                            ],
                            "chart_settings": {
                                "chart_type": "line_chart",
                                "chart_theme": "default",
                                "show_data_labels": False,
                                "show_axis_labels": True,
                                "x_axis_label": "Date",
                                "y_axis_label": "Revenue",
                            },
                            "combination": {"region": "US"},
                        }
                    ],
                }
            ],
        }
    ]

    updated, catalogue_entries = build_catalogue_metadata(feature_overview)

    sku = updated[0]["skus"][0]
    assert "statistical_summaries" in sku
    summary = sku["statistical_summaries"][0]
    assert summary["catalogue_id"]
    assert summary["metadata"]["metricLabel"] == "Revenue"
    assert summary["metadata"]["chartSettings"]["chartType"] == "line_chart"

    component = sku["catalogue_components"][0]
    assert component["metadata"]["timeseries"][0]["value"] == 90
    assert catalogue_entries[0]["metadata"]["skuTitle"] == "Gamma"


def test_build_catalogue_metadata_falls_back_when_no_components_selected():
    feature_overview = [
        {
            "atomId": "atom-1",
            "cardId": "card-1",
            "components": {"skuStatistics": False, "trendAnalysis": False},
            "skus": [
                {"id": "sku-001", "title": "Gamma"},
            ],
        }
    ]

    updated, catalogue_entries = build_catalogue_metadata(feature_overview)

    sku = updated[0]["skus"][0]
    assert sku["catalogue_components"][0]["type"] == "overview"
    assert "Overview" in sku["catalogue_components"][0]["title"]
    assert catalogue_entries[0]["component_type"] == "overview"


def test_merge_catalogue_components_populates_existing_payload():
    feature_overview = [
        {
            "atomId": "atom-1",
            "cardId": "card-1",
            "skus": [
                {
                    "id": "sku-1",
                    "title": "Alpha",
                    "statistical_summaries": [
                        {"catalogue_id": "atom-1-card-1-sku-1-skuStatistics"}
                    ],
                },
                {"id": "sku-2", "title": "Beta"},
            ],
        }
    ]

    catalogue_entries = [
        {
            "catalogue_id": "atom-1-card-1-sku-1-skuStatistics",
            "catalogue_title": "Alpha • SKU Statistics",
            "component_type": "skuStatistics",
            "component_label": "SKU Statistics",
            "atom_id": "atom-1",
            "card_id": "card-1",
            "sku_id": "sku-1",
            "metadata": {"metric": "Revenue"},
        },
        {
            "catalogue_id": "atom-1-card-1-sku-2-overview",
            "catalogue_title": "Beta • Overview Insight",
            "component_type": "overview",
            "component_label": "Overview Insight",
            "atom_id": "atom-1",
            "card_id": "card-1",
            "sku_id": "sku-2",
            "metadata": None,
        },
    ]

    merged = merge_catalogue_components(feature_overview, catalogue_entries)
    sku_components = {
        sku["id"]: sku.get("catalogue_components", [])
        for sku in merged[0]["skus"]
    }

    assert sku_components["sku-1"][0]["type"] == "skuStatistics"
    assert sku_components["sku-2"][0]["title"] == "Beta • Overview Insight"
    assert sku_components["sku-1"][0]["metadata"]["metric"] == "Revenue"

    sku_summaries = merged[0]["skus"][0].get("statistical_summaries")
    assert sku_summaries and sku_summaries[0]["metadata"]["metric"] == "Revenue"
