import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

PERSISTENCE_PATH = Path(__file__).resolve().parents[1] / "app" / "features" / "exhibition" / "persistence.py"
_spec = importlib.util.spec_from_file_location("exhibition_persistence", PERSISTENCE_PATH)
_module = importlib.util.module_from_spec(_spec)
assert _spec is not None and _spec.loader is not None
_spec.loader.exec_module(_module)
save_exhibition_list_configuration = _module.save_exhibition_list_configuration


class FakeLegacyCollection:
    def __init__(self) -> None:
        self.delete_calls = []

    async def delete_many(self, filter_query):  # pragma: no cover - exercised in tests
        self.delete_calls.append(filter_query)
        return SimpleNamespace(deleted_count=0)


class FakeLegacyDatabase:
    def __init__(self) -> None:
        self._collections: dict[str, FakeLegacyCollection] = {}

    def __getitem__(self, name: str) -> FakeLegacyCollection:
        self._collections.setdefault(name, FakeLegacyCollection())
        return self._collections[name]


class FakeMongoClient:
    def __init__(self) -> None:
        self._databases: dict[str, FakeLegacyDatabase] = {}

    def __getitem__(self, name: str) -> FakeLegacyDatabase:
        self._databases.setdefault(name, FakeLegacyDatabase())
        return self._databases[name]


class FakeDatabase:
    def __init__(self, name: str, client: FakeMongoClient) -> None:
        self.name = name
        self.client = client


class FakeCollection:
    def __init__(self, name: str = "exhibition_list_configuration") -> None:
        self.name = name
        self._client = FakeMongoClient()
        self.database = FakeDatabase("trinity_db", self._client)
        self.replace_calls = []
        self.delete_calls = []

    async def delete_many(self, filter_query):  # pragma: no cover - exercised in tests
        self.delete_calls.append(filter_query)
        return SimpleNamespace(deleted_count=0)

    async def replace_one(self, filter_query, document, upsert: bool):
        self.replace_calls.append((filter_query, document, upsert))
        return SimpleNamespace(upserted_id="abc123", modified_count=0, matched_count=0)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio("asyncio")
async def test_save_exhibition_configuration_normalises_z_index() -> None:
    collection = FakeCollection()

    payload = {
        "mode": "exhibition",
        "cards": [
            {"id": "slide-1", "atoms": [], "isExhibited": True},
        ],
        "slide_objects": {
            "slide-1": [
                {"id": "obj-a", "type": "text", "x": 10, "y": 20, "zIndex": "7"},
                {"id": "obj-b", "type": "shape", "x": 30, "y": 40, "z_index": 4},
                {"id": "obj-c", "type": "image", "x": 50, "y": 60},
            ]
        },
    }

    result = await save_exhibition_list_configuration(
        client_name="Tenant",
        app_name="Insights",
        project_name="Launch",
        exhibition_config_data=payload,
        collection=collection,
    )

    assert result["status"] == "success"
    assert collection.replace_calls, "Expected replace_one to be invoked"

    _, document, upsert = collection.replace_calls[0]
    assert upsert is True

    saved_objects = document["slide_objects"]["slide-1"]
    assert [entry["zIndex"] for entry in saved_objects] == [7, 4, 3]
    for entry in saved_objects:
        assert isinstance(entry["zIndex"], int)
        assert "z_index" not in entry
