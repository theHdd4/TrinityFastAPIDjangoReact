from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any, Dict, Iterable

from django.conf import settings
from django.utils import timezone
from pymongo import MongoClient

from .models import Project, RegistryEnvironment

logger = logging.getLogger(__name__)


def _get_env_ids(project: Project) -> tuple[str, str, str]:
    """Fetch client/app/project IDs using RegistryEnvironment fallback."""
    client_name = os.environ.get("CLIENT_NAME", "")
    app_name = os.environ.get("APP_NAME", project.app.slug if project.app else "")
    project_name = project.name

    client_id = os.environ.get("CLIENT_ID", "")
    app_id = os.environ.get("APP_ID", "")
    project_id = os.environ.get("PROJECT_ID", "")

    try:
        env = RegistryEnvironment.objects.get(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
        )
        envvars = env.envvars or {}
        client_id = envvars.get("CLIENT_ID", client_id)
        app_id = envvars.get("APP_ID", app_id)
        project_id = envvars.get("PROJECT_ID", project_id)
    except RegistryEnvironment.DoesNotExist:
        pass

    return client_id, app_id, project_id


def save_atom_list_configuration(
    project: Project, mode: str, cards: Iterable[Dict[str, Any]] | None
) -> None:
    """Persist atom configurations for a project/mode into MongoDB."""
    client_id, app_id, project_id = _get_env_ids(project)
    try:
        mc = MongoClient(
            getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
        )
        db = mc["trinity_db"]
        coll = db["atom_list_configuration"]

        # Drop legacy collection from previous `trinity_prod` database if it exists
        try:
            legacy_db = mc["trinity_prod"]
            legacy_db.drop_collection("atom_list_configuration")
        except Exception:  # pragma: no cover - best effort cleanup
            pass

        coll.delete_many(
            {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "mode": mode,
            }
        )

        timestamp = timezone.now()
        docs = []
        for canvas_pos, card in enumerate(cards or []):
            open_card = "no" if card.get("collapsed") else "yes"
            exhibition_preview = "yes" if card.get("isExhibited") else "no"
            scroll_pos = card.get("scroll_position", 0)
            for atom_pos, atom in enumerate(card.get("atoms", [])):
                atom_id = atom.get("atomId") or atom.get("title") or "unknown"
                atom_title = atom.get("title") or atom_id
                atom_settings = atom.get("settings", {})
                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        k: v for k, v in atom_settings.items() if k not in {"tableData", "data"}
                    }
                version_hash = hashlib.sha256(
                    json.dumps(atom_settings, sort_keys=True).encode()
                ).hexdigest()
                docs.append(
                    {
                        "client_id": client_id,
                        "app_id": app_id,
                        "project_id": project_id,
                        "mode": mode,
                        "atom_name": atom_id,
                        "atom_title": atom_title,
                        "canvas_position": canvas_pos,
                        "atom_positions": atom_pos,
                        "atom_configs": atom_settings,
                        "open_cards": open_card,
                        "scroll_position": scroll_pos,
                        "exhibition_previews": exhibition_preview,
                        "notes": atom_settings.get("notes", ""),
                        "last_edited": timestamp,
                        "version_hash": version_hash,
                        "mode_meta": {
                            "card_id": card.get("id"),
                            "atom_id": atom.get("id"),
                        },
                    }
                )
        if docs:
            coll.insert_many(docs)
    except Exception as exc:  # pragma: no cover - logging only
        logger.error("Failed to save atom configuration: %s", exc)


def load_atom_list_configuration(
    project: Project, mode: str
) -> Dict[str, Any] | None:
    """Return atom configuration for a project/mode from MongoDB.

    Reconstructs the layout cards and atom order as previously persisted by
    :func:`save_atom_list_configuration`.
    """
    client_id, app_id, project_id = _get_env_ids(project)
    try:
        mc = MongoClient(
            getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
        )
        coll = mc["trinity_db"]["atom_list_configuration"]
        cursor = coll.find(
            {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "mode": mode,
            }
        ).sort([("canvas_position", 1), ("atom_positions", 1)])

        cards: Dict[int, Dict[str, Any]] = {}
        for doc in cursor:
            cpos = doc.get("canvas_position", 0)
            card = cards.setdefault(
                cpos,
                {
                    "id": (doc.get("mode_meta") or {}).get("card_id"),
                    "collapsed": doc.get("open_cards", "yes") != "yes",
                    "isExhibited": doc.get("exhibition_previews", "no") == "yes",
                    "scroll_position": doc.get("scroll_position", 0),
                    "atoms": [],
                },
            )
            atom_slug = doc.get("atom_name")
            atom_title = doc.get("atom_title") or atom_slug
            card["atoms"].append(
                {
                    "id": (doc.get("mode_meta") or {}).get("atom_id"),
                    "atomId": atom_slug,
                    "title": atom_title,
                    "settings": doc.get("atom_configs", {}),
                }
            )

        if not cards:
            return None

        ordered_cards = [cards[i] for i in sorted(cards)]
        return {"cards": ordered_cards}
    except Exception as exc:  # pragma: no cover - logging only
        logger.error("Failed to load atom configuration: %s", exc)
        return None
