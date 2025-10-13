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
            "atoms": [
                {
                    "id": "feature-overview",
                    "atom_name": "Feature Overview",
                    "exhibited_components": [
                        {
                            "id": "sku-1",
                            "atomId": "feature-overview",
                            "title": "Alpha",
                            "category": "Feature",
                            "color": "bg-amber-500",
                            "metadata": {"revenue": 1200},
                        },
                        {
                            "id": "sku-2",
                            "atomId": "feature-overview",
                            "title": "Beta",
                            "category": "Feature",
                            "color": "bg-amber-500",
                            "metadata": {"revenue": 900},
                        },
                    ],
                }
            ],
        }

        saved = await storage.save_configuration(payload)
        assert saved["client_name"] == "Quant Matrix"
        assert saved["app_name"] == "Insights"
        assert saved["project_name"] == "Q3 Launch"
        assert "updated_at" in saved
        assert len(saved["atoms"]) == 1

        # Persisted to disk
        assert storage_path.exists()
        on_disk = json.loads(storage_path.read_text())
        assert isinstance(on_disk, list)
        assert on_disk[0]["atom_name"] == "Feature Overview"
        assert on_disk[0]["exhibited_components"][0]["title"] == "Alpha"

        fetched = await storage.get_configuration("Quant Matrix", "Insights", "Q3 Launch")
        assert fetched is not None
        assert fetched["atoms"][0]["exhibited_components"][1]["id"] == "sku-2"


@pytest.mark.anyio("asyncio")
async def test_exhibition_storage_handles_legacy_exhibited_cards_key() -> None:
    with TemporaryDirectory() as tmpdir:
        storage_path = Path(tmpdir) / "config.json"
        legacy_payload = [
            {
                "id": "legacy-atom",
                "client_name": "Quant Matrix",
                "app_name": "Insights",
                "project_name": "Q3 Launch",
                "atom_name": "Legacy Feature",
                "exhibited_cards": [
                    {
                        "id": "legacy-component",
                        "title": "Legacy Component",
                        "color": "bg-blue-500",
                    }
                ],
            }
        ]
        storage_path.write_text(json.dumps(legacy_payload))

        storage = ExhibitionStorage(storage_path)
        fetched = await storage.get_configuration("Quant Matrix", "Insights", "Q3 Launch")

        assert fetched is not None
        assert fetched["atoms"][0]["id"] == "legacy-atom"
        components = fetched["atoms"][0]["exhibited_components"]
        assert len(components) == 1
        assert components[0]["id"] == "legacy-component"


@pytest.mark.anyio("asyncio")
async def test_exhibition_storage_returns_none_for_unknown_configuration() -> None:
    with TemporaryDirectory() as tmpdir:
        storage = ExhibitionStorage(Path(tmpdir) / "config.json")
        result = await storage.get_configuration("Unknown", "App", "Project")
        assert result is None
