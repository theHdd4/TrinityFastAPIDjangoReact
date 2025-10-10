import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

SERVICE_PATH = Path(__file__).resolve().parents[1] / "app" / "features" / "exhibition" / "service.py"
_spec = importlib.util.spec_from_file_location("exhibition_service", SERVICE_PATH)
_service = importlib.util.module_from_spec(_spec)
assert _spec is not None and _spec.loader is not None
_spec.loader.exec_module(_service)
ExhibitionStorage = _service.ExhibitionStorage


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio("asyncio")
async def test_exhibition_storage_roundtrip() -> None:
    with TemporaryDirectory() as tmpdir:
        storage_path = Path(tmpdir) / "config.json"
        storage = ExhibitionStorage(storage_path)

        payload = {
            "client_name": "Quant Matrix",
            "app_name": "Insights",
            "project_name": "Q3 Launch",
            "cards": [
                {
                    "id": "card-1",
                    "atoms": [
                        {"id": "atom-1", "atomId": "feature-overview", "title": "Overview", "category": "Feature"}
                    ],
                    "isExhibited": True,
                }
            ],
            "feature_overview": [
                {
                    "atomId": "feature-overview",
                    "cardId": "card-1",
                    "components": {"skuStatistics": True, "trendAnalysis": False},
                    "skus": [
                        {"id": "sku-1", "title": "Alpha", "details": {"revenue": 1200}},
                        {"id": "sku-2", "title": "Beta", "details": {"revenue": 900}},
                    ],
                }
            ],
        }

        saved = await storage.save_configuration(payload)
        assert saved["client_name"] == "Quant Matrix"
        assert saved["app_name"] == "Insights"
        assert saved["project_name"] == "Q3 Launch"
        assert "updated_at" in saved

        # Persisted to disk
        assert storage_path.exists()
        on_disk = json.loads(storage_path.read_text())
        assert isinstance(on_disk, list)
        assert on_disk[0]["feature_overview"][0]["skus"][0]["title"] == "Alpha"

        fetched = await storage.get_configuration("Quant Matrix", "Insights", "Q3 Launch")
        assert fetched is not None
        assert fetched["feature_overview"][0]["skus"][1]["id"] == "sku-2"


@pytest.mark.anyio("asyncio")
async def test_exhibition_storage_returns_none_for_unknown_configuration() -> None:
    with TemporaryDirectory() as tmpdir:
        storage = ExhibitionStorage(Path(tmpdir) / "config.json")
        result = await storage.get_configuration("Unknown", "App", "Project")
        assert result is None
