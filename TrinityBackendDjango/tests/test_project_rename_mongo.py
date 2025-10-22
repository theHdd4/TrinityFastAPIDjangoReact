import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import django

# Configure Django before importing project modules
sys.path.append(str(Path(__file__).resolve().parents[2]))
sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "TrinityBackendDjango.config.settings"
)
django.setup()

from apps.registry import signals


class FakeResult:
    def __init__(self, upserted: bool = False):
        self.upserted_id = "new" if upserted else None


class FakeDeleteResult:
    def __init__(self, deleted: bool):
        self.deleted_count = 1 if deleted else 0


class FakeCollection:
    def __init__(self, docs):
        self.docs = {doc["_id"]: doc for doc in docs}
        self.deleted = []

    def find(self, query):
        pattern = query.get("_id", {}).get("$regex")
        if pattern:
            regex = re.compile(pattern)
            return [doc.copy() for key, doc in list(self.docs.items()) if regex.match(key)]

        def matches(doc):
            for key, value in query.items():
                if key == "_id":
                    continue
                if doc.get(key) != value:
                    return False
            return True

        return [doc.copy() for doc in self.docs.values() if matches(doc)]

    def replace_one(self, _filter, document, upsert=False):
        self.docs[document["_id"]] = document
        return FakeResult(upsert)

    def delete_one(self, _filter):
        key = _filter.get("_id")
        removed = self.docs.pop(key, None)
        if removed is not None:
            self.deleted.append(key)
        return FakeDeleteResult(removed is not None)

    def list_documents(self):
        return list(self.docs.values())


class FakeDB:
    def __init__(self, collections):
        self.collections = collections

    def list_collection_names(self):
        return list(self.collections.keys())

    def __getitem__(self, name):
        return self.collections[name]


class FakeAdmin:
    def command(self, _cmd):  # pragma: no cover - trivial passthrough
        return {"ok": 1}


class FakeClient:
    def __init__(self, db_map):
        self.db_map = db_map
        self.admin = FakeAdmin()
        self.closed = False

    def list_database_names(self):
        return list(self.db_map.keys())

    def __getitem__(self, name):
        return self.db_map[name]

    def close(self):
        self.closed = True


class FakeRedis:
    def __init__(self):
        self.deleted_keys = []

    def delete(self, *keys):
        self.deleted_keys.extend(keys)


def test_rename_updates_mongo_documents(monkeypatch):
    column_docs = [
        {
            "_id": "Tenant/app/Old Project",
            "project_name": "Old Project",
            "env": {
                "PROJECT_NAME": "Old Project",
                "PROJECT_ID": "Old Project_1",
            },
            "updated_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        },
        {
            "_id": "Tenant/app/Old Project::demo.csv",
            "project_name": "Old Project",
            "file_name": "demo.csv",
            "updated_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        },
    ]
    scope_docs = [
        {
            "_id": "Tenant/app/Old Project",
            "project_name": "Old Project",
        }
    ]
    exhibition_catalogue_docs = [
        {
            "_id": "catalogue-1",
            "client_name": "Tenant",
            "app_name": "app",
            "project_name": "Old Project",
            "project_id": "Old Project_1",
            "atoms": [
                {
                    "id": "card-1",
                    "metadata": {
                        "asset_path": "Tenant/app/Old Project/assets/preview.png",
                        "env": {
                            "PROJECT_NAME": "Old Project",
                            "PROJECT_ID": "Old Project_1",
                        },
                    },
                }
            ],
            "env": {
                "PROJECT_NAME": "Old Project",
                "PROJECT_ID": "Old Project_1",
            },
            "updated_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        }
    ]
    exhibition_layout_docs = [
        {
            "_id": "layout-1",
            "client_name": "Tenant",
            "app_name": "app",
            "project_name": "Old Project",
            "slide_objects": {
                "card-1": [
                    {
                        "type": "text",
                        "text": "Tenant/app/Old Project::card-1",
                    }
                ]
            },
            "env": {
                "PROJECT_NAME": "Old Project",
                "PROJECT_ID": "Old Project_1",
            },
            "updated_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        }
    ]

    db = FakeDB(
        {
            "column_classifier_config": FakeCollection(column_docs),
            "scopeselector_configs": FakeCollection(scope_docs),
            "exhibition_catalogue": FakeCollection(exhibition_catalogue_docs),
            "exhibition_list_configuration": FakeCollection(exhibition_layout_docs),
            "other_collection": FakeCollection(
                [{"_id": "Tenant/app/unrelated", "value": 1}]
            ),
        }
    )
    fake_client = FakeClient({"trinity_db": db})
    fake_redis = FakeRedis()

    monkeypatch.setattr(signals, "MongoClient", lambda *a, **k: fake_client)
    monkeypatch.setattr(signals, "redis_client", fake_redis)

    signals._rename_project_documents_in_mongo(
        "Tenant",
        "app",
        "Old Project",
        "New Project",
        "Old Project_1",
        "New Project_1",
    )

    # Ensure Mongo client was closed
    assert fake_client.closed is True

    column_ids = sorted(
        doc["_id"] for doc in db["column_classifier_config"].list_documents()
    )
    assert column_ids == [
        "Tenant/app/New Project",
        "Tenant/app/New Project::demo.csv",
    ]

    for doc in db["column_classifier_config"].list_documents():
        assert doc["project_name"] == "New Project"
        assert doc["_id"].startswith("Tenant/app/New Project")
        assert isinstance(doc["updated_at"], datetime)
        if "env" in doc:
            assert doc["env"]["PROJECT_NAME"] == "New Project"
            assert doc["env"]["PROJECT_ID"] == "New Project_1"

    scope_ids = [doc["_id"] for doc in db["scopeselector_configs"].list_documents()]
    assert scope_ids == ["Tenant/app/New Project"]

    other_docs = db["other_collection"].list_documents()
    assert other_docs == [{"_id": "Tenant/app/unrelated", "value": 1}]

    catalogue_docs = db["exhibition_catalogue"].list_documents()
    assert len(catalogue_docs) == 1
    catalogue_doc = catalogue_docs[0]
    assert catalogue_doc["project_name"] == "New Project"
    assert catalogue_doc["project_id"] == "New Project_1"
    assert catalogue_doc["env"]["PROJECT_NAME"] == "New Project"
    assert catalogue_doc["env"]["PROJECT_ID"] == "New Project_1"
    metadata_env = catalogue_doc["atoms"][0]["metadata"]["env"]
    assert metadata_env["PROJECT_NAME"] == "New Project"
    assert metadata_env["PROJECT_ID"] == "New Project_1"
    assert catalogue_doc["atoms"][0]["metadata"]["asset_path"].startswith(
        "Tenant/app/New Project"
    )
    assert isinstance(catalogue_doc["updated_at"], datetime)

    layout_docs = db["exhibition_list_configuration"].list_documents()
    assert len(layout_docs) == 1
    layout_doc = layout_docs[0]
    assert layout_doc["project_name"] == "New Project"
    assert layout_doc["env"]["PROJECT_NAME"] == "New Project"
    assert layout_doc["env"]["PROJECT_ID"] == "New Project_1"
    assert layout_doc["slide_objects"]["card-1"][0]["text"].startswith(
        "Tenant/app/New Project"
    )
    assert isinstance(layout_doc["updated_at"], datetime)

    assert set(fake_redis.deleted_keys) == {
        "env:Tenant:app:Old Project",
        "project:Old Project_1:dimensions",
        "Tenant/app/Old Project/column_classifier_config",
        "Tenant/app/Old Project/column_classifier_config:demo.csv",
    }

