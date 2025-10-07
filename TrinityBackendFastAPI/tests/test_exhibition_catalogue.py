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
                {"id": "sku-1", "title": "Alpha"},
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
        },
        {
            "catalogue_id": "atom-1-card-1-sku-2-overview",
            "catalogue_title": "Beta • Overview Insight",
            "component_type": "overview",
            "component_label": "Overview Insight",
            "atom_id": "atom-1",
            "card_id": "card-1",
            "sku_id": "sku-2",
        },
    ]

    merged = merge_catalogue_components(feature_overview, catalogue_entries)
    sku_components = {
        sku["id"]: sku.get("catalogue_components", [])
        for sku in merged[0]["skus"]
    }

    assert sku_components["sku-1"][0]["type"] == "skuStatistics"
    assert sku_components["sku-2"][0]["title"] == "Beta • Overview Insight"
