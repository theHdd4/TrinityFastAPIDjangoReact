import os
import os
import sys
from pathlib import Path
import django

# Configure Django settings
sys.path.append(str(Path(__file__).resolve().parents[2]))
sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "TrinityBackendDjango.config.settings")
django.setup()

from apps.registry import atom_config
from apps.registry.atom_config import load_atom_list_configuration


class FakeCursor(list):
    def sort(self, *args, **kwargs):
        return sorted(self, key=lambda d: (d.get("canvas_position", 0), d.get("atom_positions", 0)))


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):  # pragma: no cover - simple stub
        return FakeCursor(self.docs.copy())


class FakeDB:
    def __init__(self, docs):
        self.docs = docs

    def __getitem__(self, name):  # pragma: no cover - simple stub
        if name == "atom_list_configuration":
            return FakeCollection(self.docs)
        return FakeCollection([])


class FakeClient:
    def __init__(self, docs):
        self.docs = docs

    def __getitem__(self, name):  # pragma: no cover - simple stub
        return FakeDB(self.docs)


def test_load_atom_list_configuration_rebuilds_cards(monkeypatch):
    docs = [
        {
            "client_id": "c1",
            "app_id": "a1",
            "project_id": "p1",
            "mode": "lab",
            "atom_name": "AtomA",
            "canvas_position": 0,
            "atom_positions": 0,
            "atom_configs": {"x": 1},
            "open_cards": "yes",
            "scroll_position": 10,
            "exhibition_previews": "no",
            "mode_meta": {"card_id": "card1", "atom_id": "atomA"},
        },
        {
            "client_id": "c1",
            "app_id": "a1",
            "project_id": "p1",
            "mode": "lab",
            "atom_name": "AtomB",
            "canvas_position": 0,
            "atom_positions": 1,
            "atom_configs": {"y": 2},
            "open_cards": "yes",
            "scroll_position": 10,
            "exhibition_previews": "no",
            "mode_meta": {"card_id": "card1", "atom_id": "atomB"},
        },
        {
            "client_id": "c1",
            "app_id": "a1",
            "project_id": "p1",
            "mode": "lab",
            "atom_name": "AtomC",
            "canvas_position": 1,
            "atom_positions": 0,
            "atom_configs": {"z": 3},
            "open_cards": "no",
            "scroll_position": 0,
            "exhibition_previews": "yes",
            "mode_meta": {"card_id": "card2", "atom_id": "atomC"},
        },
    ]

    monkeypatch.setattr(atom_config, "MongoClient", lambda uri: FakeClient(docs))
    monkeypatch.setattr(atom_config, "_get_env_ids", lambda project: ("c1", "a1", "p1"))

    result = load_atom_list_configuration(object(), "lab")
    assert result == {
        "cards": [
            {
                "id": "card1",
                "collapsed": False,
                "isExhibited": False,
                "scroll_position": 10,
                "atoms": [
                    {
                        "id": "atomA",
                        "atomId": "AtomA",
                        "title": "AtomA",
                        "settings": {"x": 1},
                    },
                    {
                        "id": "atomB",
                        "atomId": "AtomB",
                        "title": "AtomB",
                        "settings": {"y": 2},
                    },
                ],
            },
            {
                "id": "card2",
                "collapsed": True,
                "isExhibited": True,
                "scroll_position": 0,
                "atoms": [
                    {
                        "id": "atomC",
                        "atomId": "AtomC",
                        "title": "AtomC",
                        "settings": {"z": 3},
                    }
                ],
            },
        ]
    }


def test_load_atom_list_configuration_uses_atom_title(monkeypatch):
    docs = [
        {
            "client_id": "c1",
            "app_id": "a1",
            "project_id": "p1",
            "mode": "lab",
            "atom_name": "atom-a",
            "atom_title": "Atom A",
            "canvas_position": 0,
            "atom_positions": 0,
            "atom_configs": {},
            "open_cards": "yes",
            "scroll_position": 0,
            "exhibition_previews": "no",
            "mode_meta": {"card_id": "card1", "atom_id": "atomA"},
        }
    ]

    monkeypatch.setattr(atom_config, "MongoClient", lambda uri: FakeClient(docs))
    monkeypatch.setattr(atom_config, "_get_env_ids", lambda project: ("c1", "a1", "p1"))

    result = load_atom_list_configuration(object(), "lab")
    assert result == {
        "cards": [
            {
                "id": "card1",
                "collapsed": False,
                "isExhibited": False,
                "scroll_position": 0,
                "atoms": [
                    {
                        "id": "atomA",
                        "atomId": "atom-a",
                        "title": "Atom A",
                        "settings": {},
                    }
                ],
            }
        ]
    }
