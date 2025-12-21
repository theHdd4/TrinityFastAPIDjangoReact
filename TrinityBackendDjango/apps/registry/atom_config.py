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
            # Extract molecule and order information from card
            molecule_id = card.get("moleculeId")
            molecule_title = card.get("moleculeTitle")
            card_order = card.get("order")
            after_molecule_id = card.get("afterMoleculeId")
            before_molecule_id = card.get("beforeMoleculeId")
            for atom_pos, atom in enumerate(card.get("atoms", [])):
                atom_id = atom.get("atomId") or atom.get("title") or "unknown"
                atom_title = atom.get("title") or atom_id
                atom_settings = atom.get("settings", {})
                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        k: v for k, v in atom_settings.items() if k not in {"tableData", "data"}
                    }
                if atom.get("atomId") == "table":
                    # Strip tableData (rows) - data should be in MinIO, not MongoDB
                    atom_settings = {
                        k: v for k, v in atom_settings.items() if k not in {"tableData", "data"}
                    }
                if atom.get("atomId") == "kpi-dashboard":
                    # Strip table row data from nested structure: layouts[].boxes[].tableSettings.tableData.rows
                    # Data should be in MinIO, not MongoDB (same pattern as dataframe-operations and table)
                    def remove_table_rows_from_kpi_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
                        """Recursively remove table row data from KPI dashboard settings."""
                        if not isinstance(settings, dict):
                            return settings
                        
                        cleaned = {}
                        for key, value in settings.items():
                            if key == "layouts" and isinstance(value, list):
                                # Process layouts array
                                cleaned_layouts = []
                                for layout in value:
                                    if not isinstance(layout, dict):
                                        cleaned_layouts.append(layout)
                                        continue
                                    
                                    cleaned_layout = layout.copy()
                                    if "boxes" in layout and isinstance(layout["boxes"], list):
                                        # Process boxes array
                                        cleaned_boxes = []
                                        for box in layout["boxes"]:
                                            if not isinstance(box, dict):
                                                cleaned_boxes.append(box)
                                                continue
                                            
                                            cleaned_box = box.copy()
                                            if "tableSettings" in box and isinstance(box["tableSettings"], dict):
                                                table_settings = box["tableSettings"].copy()
                                                if "tableData" in table_settings and isinstance(table_settings["tableData"], dict):
                                                    # Remove rows from tableData, keep metadata
                                                    table_data = table_settings["tableData"].copy()
                                                    if "rows" in table_data:
                                                        # Remove rows, keep columns, row_count, etc.
                                                        table_data.pop("rows", None)
                                                        # Mark that rows are stored in MinIO
                                                        table_data["rows_stored_in_minio"] = True
                                                    table_settings["tableData"] = table_data
                                                cleaned_box["tableSettings"] = table_settings
                                            cleaned_boxes.append(cleaned_box)
                                        cleaned_layout["boxes"] = cleaned_boxes
                                    cleaned_layouts.append(cleaned_layout)
                                cleaned[key] = cleaned_layouts
                            else:
                                cleaned[key] = value
                        return cleaned
                    
                    atom_settings = remove_table_rows_from_kpi_settings(atom_settings)
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
                        # Molecule information as top-level fields for easier querying
                        "molecule_id": molecule_id,
                        "molecule_title": molecule_title,
                        "order": card_order,
                        "after_molecule_id": after_molecule_id,
                        "before_molecule_id": before_molecule_id,
                        "mode_meta": {
                            "card_id": card.get("id"),
                            "atom_id": atom.get("id"),
                            "molecule_id": molecule_id,
                            "molecule_title": molecule_title,
                        },
                        "isDeleted": False,
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
                "isDeleted": {"$ne": True},
            }
        ).sort([("canvas_position", 1), ("atom_positions", 1)])
 
        cards: Dict[int, Dict[str, Any]] = {}
        for doc in cursor:
            cpos = doc.get("canvas_position", 0)
            # Get molecule info from top-level fields or fallback to mode_meta (for backward compatibility)
            molecule_id = doc.get("molecule_id") or (doc.get("mode_meta") or {}).get("molecule_id")
            molecule_title = doc.get("molecule_title") or (doc.get("mode_meta") or {}).get("molecule_title")
            card_order = doc.get("order")
            after_molecule_id = doc.get("after_molecule_id")
            before_molecule_id = doc.get("before_molecule_id")
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
            # Set molecule and order fields if they exist
            if molecule_id is not None:
                card["moleculeId"] = molecule_id
            if molecule_title is not None:
                card["moleculeTitle"] = molecule_title
            if card_order is not None:
                card["order"] = card_order
            if after_molecule_id is not None:
                card["afterMoleculeId"] = after_molecule_id
            if before_molecule_id is not None:
                card["beforeMoleculeId"] = before_molecule_id
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