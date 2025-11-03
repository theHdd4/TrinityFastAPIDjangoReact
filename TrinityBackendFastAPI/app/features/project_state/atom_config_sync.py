"""
Async wrapper that replicates Django's save_atom_list_configuration logic.
This ensures FastAPI uses the exact same save logic as Django's atom_config.py
"""

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.mongo import build_host_mongo_uri
import os

logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = os.getenv("MONGO_URI", DEFAULT_MONGO_URI)
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")


async def save_atom_list_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    atom_config_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
) -> dict:
    """
    Async version of Django's save_atom_list_configuration from atom_config.py
    Replicates the exact same logic but uses async Motor client instead of sync PyMongo
    """
    try:
        # Connect to MongoDB (async)
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["atom_list_configuration"]
        
        # Get environment IDs (same as Django: client_id = client_name, etc.)
        client_id = client_name
        app_id = app_name
        project_id_str = project_name  # Django uses project.name as project_id
        mode = atom_config_data.get("mode", "build")
        
        # Drop legacy collection from previous `trinity_prod` database if it exists
        try:
            legacy_db = client["trinity_prod"]
            await legacy_db.drop_collection("atom_list_configuration")
        except Exception:
            pass  # Best effort cleanup
        
        # Delete existing configurations for this project/mode (same as Django)
        await coll.delete_many({
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id_str,
            "mode": mode,
        })
        
        # Prepare documents for insertion (exact same logic as Django)
        timestamp = datetime.utcnow()
        docs = []
        
        # Extract cards from atom_config_data
        cards = atom_config_data.get("cards", [])
        
        for canvas_pos, card in enumerate(cards):
            open_card = "no" if card.get("collapsed") else "yes"
            exhibition_preview = "yes" if card.get("isExhibited") else "no"
            scroll_pos = card.get("scroll_position", 0)
            
            for atom_pos, atom in enumerate(card.get("atoms", [])):
                atom_id = atom.get("atomId") or atom.get("title") or "unknown"
                atom_title = atom.get("title") or atom_id
                atom_settings = atom.get("settings", {})
                
                # Clean up dataframe-operations data (same as Django)
                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        k: v for k, v in atom_settings.items() if k not in {"tableData", "data"}
                    }
                
                # Generate version hash (same as Django)
                version_hash = hashlib.sha256(
                    json.dumps(atom_settings, sort_keys=True).encode()
                ).hexdigest()
                
                # Create document (exact same structure as Django's atom_config.py)
                doc = {
                    "client_id": client_id,
                    "app_id": app_id,
                    "project_id": project_id_str,
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
                    # Molecule information as top-level fields (matching Django version after fix)
                    "molecule_id": card.get("moleculeId"),
                    "molecule_title": card.get("moleculeTitle"),
                    # Position for standalone cards (cards without moleculeId)
                    "standalone_position": card.get("position") if not card.get("moleculeId") else None,
                    "mode_meta": {
                        "card_id": card.get("id"),
                        "atom_id": atom.get("id"),
                        "molecule_id": card.get("moleculeId"),
                        "molecule_title": card.get("moleculeTitle"),
                        "standalone_position": card.get("position") if not card.get("moleculeId") else None,
                    },
                    "isDeleted": False,
                }
                
                docs.append(doc)
        
        # Insert documents (async version of Django's insert_many)
        if docs:
            await coll.insert_many(docs)
            logger.info(f"📦 Stored {len(docs)} atom configurations in atom_list_configuration (using Django logic)")
            
            return {
                "status": "success",
                "mongo_id": f"{client_id}/{app_id}/{project_id_str}",
                "operation": "inserted",
                "collection": "atom_list_configuration",
                "documents_inserted": len(docs)
            }
        else:
            return {
                "status": "success",
                "mongo_id": f"{client_id}/{app_id}/{project_id_str}",
                "operation": "no_data",
                "collection": "atom_list_configuration",
                "documents_inserted": 0
            }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for atom_list_configuration (Django logic): {e}")
        return {"status": "error", "error": str(e)}


async def get_atom_list_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str = "laboratory"
) -> dict:
    """
    Async version that replicates Django's load_atom_list_configuration logic
    but returns in FastAPI format (with workflow_molecules)
    """
    try:
        # Connect to MongoDB (async)
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["atom_list_configuration"]
        
        # Get environment IDs (same as Django)
        client_id = client_name
        app_id = app_name
        project_id_str = project_name
        
        # Query for atom configurations (same as Django)
        query = {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id_str,
            "mode": mode,
            "isDeleted": {"$ne": True},
        }
        
        # Get all atom configurations for this project/mode (async cursor)
        cursor = coll.find(query).sort([("canvas_position", 1), ("atom_positions", 1)])
        atom_configs = await cursor.to_list(length=None)
        
        if not atom_configs:
            logger.info(f"📦 No atom configurations found for {client_id}/{app_id}/{project_id_str} in mode {mode}")
            return {
                "status": "success",
                "cards": [],
                "workflow_molecules": [],
                "count": 0
            }
        
        # Group atoms by canvas position (cards) - same logic as Django
        cards_map: Dict[int, Dict[str, Any]] = {}
        workflow_molecules_map: Dict[str, Dict[str, Any]] = {}
        
        # First pass: collect standalone_position from any atom in the card
        card_positions = {}
        for atom_config in atom_configs:
            canvas_pos = atom_config.get("canvas_position", 0)
            standalone_position = atom_config.get("standalone_position")
            
            if standalone_position is not None and canvas_pos not in card_positions:
                card_positions[canvas_pos] = standalone_position
        
        # Second pass: build cards map (replicating Django's load logic)
        for atom_config in atom_configs:
            canvas_pos = atom_config.get("canvas_position", 0)
            atom_pos = atom_config.get("atom_positions", 0)
            
            # Extract molecule information (top-level or mode_meta fallback)
            molecule_id = atom_config.get("molecule_id") or atom_config.get("mode_meta", {}).get("molecule_id")
            molecule_title = atom_config.get("molecule_title") or atom_config.get("mode_meta", {}).get("molecule_title")
            
            # Create card if it doesn't exist (same structure as Django but with position)
            if canvas_pos not in cards_map:
                standalone_position = card_positions.get(canvas_pos)
                
                cards_map[canvas_pos] = {
                    "id": (atom_config.get("mode_meta") or {}).get("card_id"),
                    "collapsed": atom_config.get("open_cards", "yes") != "yes",
                    "isExhibited": atom_config.get("exhibition_previews", "no") == "yes",
                    "scroll_position": atom_config.get("scroll_position", 0),
                    "moleculeId": molecule_id,
                    "moleculeTitle": molecule_title,
                    "position": standalone_position,  # Add position for standalone cards
                    "atoms": [],
                }
            
            # Add atom to card (same format as Django)
            atom_slug = atom_config.get("atom_name")
            atom_title = atom_config.get("atom_title") or atom_slug
            cards_map[canvas_pos]["atoms"].append({
                "id": (atom_config.get("mode_meta") or {}).get("atom_id"),
                "atomId": atom_slug,
                "title": atom_title,
                "settings": atom_config.get("atom_configs", {}),
            })
            
            # Track workflow molecules
            if molecule_id:
                if molecule_id not in workflow_molecules_map:
                    workflow_molecules_map[molecule_id] = {
                        "moleculeId": molecule_id,
                        "moleculeTitle": molecule_title or molecule_id,
                        "atoms": []
                    }
                
                workflow_molecules_map[molecule_id]["atoms"].append({
                    "atomName": atom_slug,
                    "order": atom_pos
                })
        
        # Convert cards map to array (sorted by canvas_position - same as Django)
        ordered_cards = [cards_map[i] for i in sorted(cards_map.keys())]
        
        # Convert workflow molecules map to array and sort atoms
        workflow_molecules = []
        for molecule_id in workflow_molecules_map.keys():
            molecule = workflow_molecules_map[molecule_id]
            molecule["atoms"].sort(key=lambda x: x["order"])
            workflow_molecules.append(molecule)
        
        logger.info(f"📦 Retrieved {len(ordered_cards)} cards with {sum(len(card['atoms']) for card in ordered_cards)} atoms from atom_list_configuration (using Django logic)")
        
        return {
            "status": "success",
            "cards": ordered_cards,
            "workflow_molecules": workflow_molecules,
            "count": len(atom_configs)
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB read error for atom_list_configuration (Django logic): {e}")
        return {"status": "error", "error": str(e)}

