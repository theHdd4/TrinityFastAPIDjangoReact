from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from pydantic import BaseModel, Field

from app.core.mongo import build_host_mongo_uri
from app.features.exhibition.deps import get_exhibition_layout_collection
from app.features.exhibition.persistence import save_exhibition_list_configuration
from app.session_state import load_state, save_state

# Configure logging
logger = logging.getLogger(__name__)

# MongoDB connection constants
DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = os.getenv("MONGO_URI", DEFAULT_MONGO_URI)
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")

router = APIRouter()


class StateIn(BaseModel):
    client_id: str
    app_id: str
    project_id: str
    state: dict


project_state_router = APIRouter()


@project_state_router.post("/save", status_code=status.HTTP_201_CREATED)
async def save_project_state(payload: StateIn):
    try:
        await save_state(
            payload.client_id, payload.app_id, payload.project_id, payload.state
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "saved"}


@project_state_router.get("/{client_id}/{app_id}/{project_id}")
async def get_project_state(client_id: str, app_id: str, project_id: str):
    state = await load_state(client_id, app_id, project_id)
    return {"state": state}


class LaboratoryProjectStateIn(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    cards: List[Dict[str, Any]] = Field(default_factory=list)
    workflow_molecules: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    mode: Optional[str] = Field(default=None)


laboratory_project_state_router = APIRouter()


@laboratory_project_state_router.post("/save", status_code=status.HTTP_200_OK)
async def save_laboratory_project_state(payload: LaboratoryProjectStateIn):
    client_name = payload.client_name.strip()
    app_name = payload.app_name.strip()
    project_name = payload.project_name.strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

    config_payload = payload.model_dump()
    config_payload.setdefault("mode", payload.mode or "laboratory")

    persistence_result = await save_atom_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        atom_config_data=config_payload,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist laboratory configuration"),
        )

    timestamp = datetime.utcnow().isoformat()

    return {
        "status": "ok",
        "updated_at": timestamp,
        "documents_inserted": persistence_result.get("documents_inserted", 0),
        "collection": persistence_result.get("collection"),
    }


@laboratory_project_state_router.get("/get/{client_name}/{app_name}/{project_name}")
async def get_laboratory_project_state(
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str = "laboratory"
):
    """Get laboratory project state from MongoDB atom_list_configuration collection"""
    try:
        client_name = client_name.strip()
        app_name = app_name.strip()
        project_name = project_name.strip()

        if not client_name or not app_name or not project_name:
            raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

        result = await get_atom_list_configuration(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            mode=mode
        )

        if result.get("status") != "success":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to retrieve laboratory configuration"),
            )

        timestamp = datetime.utcnow().isoformat()

        return {
            "status": "ok",
            "cards": result.get("cards", []),
            "workflow_molecules": result.get("workflow_molecules", []),
            "count": result.get("count", 0),
            "retrieved_at": timestamp,
            "collection": "atom_list_configuration",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


class ExhibitionProjectStateIn(LaboratoryProjectStateIn):
    slide_objects: Dict[str, Any] = Field(default_factory=dict)


exhibition_project_state_router = APIRouter()


@exhibition_project_state_router.post("/save", status_code=status.HTTP_200_OK)
async def save_exhibition_project_state(
    payload: ExhibitionProjectStateIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
):
    client_name = payload.client_name.strip()
    app_name = payload.app_name.strip()
    project_name = payload.project_name.strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(status_code=400, detail="client_name, app_name, and project_name are required")

    cards = payload.cards or []
    slide_objects = payload.slide_objects or {}

    persistence_result = await save_exhibition_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        exhibition_config_data={
            "mode": payload.mode or "exhibition",
            "cards": cards,
            "slide_objects": slide_objects,
        },
        collection=collection,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist exhibition configuration"),
        )

    timestamp = persistence_result.get("updated_at", datetime.utcnow())
    updated_at = timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)

    return {
        "status": "ok",
        "updated_at": updated_at,
        "documents_inserted": persistence_result.get("documents_written", 0),
        "collection": persistence_result.get("collection"),
    }


router.include_router(
    project_state_router,
    prefix="/project-state",
    tags=["Project State"],
)
router.include_router(
    laboratory_project_state_router,
    prefix="/laboratory-project-state",
    tags=["Laboratory Project State"],
)
router.include_router(
    exhibition_project_state_router,
    prefix="/exhibition-project-state",
    tags=["Exhibition Project State"],
)


# MongoDB atom list configuration functions
async def get_atom_list_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str = "laboratory"
):
    """Retrieve atom configuration from MongoDB atom_list_configuration collection"""
    try:
        # Connect to MongoDB
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        
        # Get environment IDs
        client_id = client_name
        app_id = app_name  
        project_id = project_name
        
        # Get the collection
        coll = db["atom_list_configuration"]
        
        # Query for atom configurations
        query = {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "mode": mode
        }
        
        # Exclude workflow metadata documents from atom query
        # Workflow metadata documents have is_workflow_metadata: True and don't have atom_name
        query_without_metadata = {
            **query,
            "$or": [
                {"is_workflow_metadata": {"$exists": False}},
                {"is_workflow_metadata": {"$ne": True}}
            ]
        }
        
        # Get all atom configurations for this project/mode (excluding workflow metadata)
        cursor = coll.find(query_without_metadata).sort([("canvas_position", 1), ("atom_positions", 1)])
        atom_configs = await cursor.to_list(length=None)
        
        # Try to get workflow_molecules from a separate document in the same collection
        # We'll store workflow_molecules as a separate document with a special marker
        workflow_molecules_doc = await coll.find_one({
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "mode": mode,
            "is_workflow_metadata": True
        })
        
        # Extract workflow_molecules if available
        saved_workflow_molecules = workflow_molecules_doc.get("workflow_molecules", []) if workflow_molecules_doc else []
        
        if not atom_configs and not saved_workflow_molecules:
            logger.info(f"📦 No atom configurations found for {client_id}/{app_id}/{project_id} in mode {mode}")
            return {
                "status": "success",
                "cards": [],
                "workflow_molecules": [],
                "count": 0
            }
        
        # Group atoms by canvas position (cards)
        cards_map = {}
        workflow_molecules_map = {}
        
        for atom_config in atom_configs:
            # Skip if this document doesn't have atom_name (safety check)
            if not atom_config.get("atom_name"):
                logger.warning(f"⚠️ Skipping document without atom_name: {atom_config.get('_id')}")
                continue
            canvas_pos = atom_config.get("canvas_position", 0)
            atom_pos = atom_config.get("atom_positions", 0)
            
            # Extract molecule information from top-level fields (preferred) or mode_meta (fallback)
            molecule_id = atom_config.get("molecule_id") or atom_config.get("mode_meta", {}).get("molecule_id")
            molecule_title = atom_config.get("molecule_title") or atom_config.get("mode_meta", {}).get("molecule_title")
            card_order = atom_config.get("order")
            after_molecule_id = atom_config.get("after_molecule_id")
            before_molecule_id = atom_config.get("before_molecule_id")
            
            # Create card if it doesn't exist
            if canvas_pos not in cards_map:
                card_id = atom_config.get("mode_meta", {}).get("card_id") or f"card-{canvas_pos}"
                card_data = {
                    "id": card_id,
                    "atoms": [],
                    "isExhibited": atom_config.get("exhibition_previews") == "yes",
                    "collapsed": atom_config.get("open_cards") == "no",
                    "scroll_position": atom_config.get("scroll_position", 0),
                }
                # Set molecule and order fields if they exist
                if molecule_id is not None:
                    card_data["moleculeId"] = molecule_id
                if molecule_title is not None:
                    card_data["moleculeTitle"] = molecule_title
                if card_order is not None:
                    card_data["order"] = card_order
                if after_molecule_id is not None:
                    card_data["afterMoleculeId"] = after_molecule_id
                if before_molecule_id is not None:
                    card_data["beforeMoleculeId"] = before_molecule_id
                cards_map[canvas_pos] = card_data
            
            # Debug: Log molecule information being retrieved
            logger.info(f"🔍 DEBUG: Retrieving atom {atom_config.get('atom_name')} with molecule_id: {molecule_id}, molecule_title: {molecule_title}")
            
            # Create atom object with all necessary fields including molecule information
            atom_obj = {
                "id": atom_config.get("mode_meta", {}).get("atom_id", f"atom-{atom_config['atom_name']}-{canvas_pos}-{atom_pos}"),
                "atomId": atom_config.get("atom_name"),
                "title": atom_config.get("atom_title"),
                "category": "Atom",  # Default category
                "color": "bg-gray-400",  # Default color
                "source": "manual",
                "settings": atom_config.get("atom_configs", {}),
                "moleculeId": molecule_id,
                "moleculeTitle": molecule_title
            }
            
            # Add atom to card
            cards_map[canvas_pos]["atoms"].append(atom_obj)
            
            # Track workflow molecules
            if molecule_id:
                if molecule_id not in workflow_molecules_map:
                    workflow_molecules_map[molecule_id] = {
                        "moleculeId": molecule_id,
                        "moleculeTitle": molecule_title or molecule_id,
                        "atoms": []
                    }
                
                workflow_molecules_map[molecule_id]["atoms"].append({
                    "atomName": atom_config.get("atom_name"),
                    "order": atom_pos
                })
        
        # Convert cards map to array and sort atoms within each card
        cards = []
        for canvas_pos in sorted(cards_map.keys()):
            card = cards_map[canvas_pos]
            # Atoms are already in correct order from the database query, no need to sort
            cards.append(card)
        
        # Convert workflow molecules map to array and sort atoms
        workflow_molecules = []
        for molecule_id in workflow_molecules_map.keys():
            molecule = workflow_molecules_map[molecule_id]
            molecule["atoms"].sort(key=lambda x: x["order"])
            workflow_molecules.append(molecule)
        
        # If we have saved workflow_molecules with isActive and moleculeIndex, use those
        # Otherwise, use the derived ones (for backward compatibility)
        if saved_workflow_molecules:
            # Sort saved workflow_molecules by moleculeIndex to preserve order
            saved_workflow_molecules.sort(key=lambda m: m.get("moleculeIndex", 999999))
            workflow_molecules = saved_workflow_molecules
            logger.info(f"📦 Using saved workflow_molecules with isActive and moleculeIndex: {len(workflow_molecules)} molecules")
            for i, mol in enumerate(workflow_molecules):
                logger.info(f"🔍 DEBUG: Saved molecule {i}: moleculeId={mol.get('moleculeId')}, isActive={mol.get('isActive')}, moleculeIndex={mol.get('moleculeIndex')}")
        else:
            logger.info(f"📦 No saved workflow_molecules found, using derived ones: {len(workflow_molecules)} molecules")
        
        logger.info(f"📦 Retrieved {len(cards)} cards with {sum(len(card['atoms']) for card in cards)} atoms from atom_list_configuration")
        
        # Debug: Log the structure of retrieved data
        for i, card in enumerate(cards):
            logger.info(f"🔍 DEBUG: Card {i}: id={card.get('id')}, molecule_id={card.get('moleculeId')}, molecule_title={card.get('moleculeTitle')}, order={card.get('order')}, atoms_count={len(card.get('atoms', []))}")
            for j, atom in enumerate(card.get('atoms', [])):
                logger.info(f"🔍 DEBUG:   Atom {j}: atomId={atom.get('atomId')}, moleculeId={atom.get('moleculeId')}, moleculeTitle={atom.get('moleculeTitle')}")
        
        logger.info(f"🔍 DEBUG: Workflow molecules: {workflow_molecules}")
        
        return {
            "status": "success",
            "cards": cards,
            "workflow_molecules": workflow_molecules,
            "count": len(atom_configs)
        }
        
    except Exception as e:
        logger.error(f"❌ MongoDB read error for atom_list_configuration: {e}")
        return {"status": "error", "error": str(e)}


async def save_atom_list_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    atom_config_data: dict,
    *,
    user_id: str = "",
    project_id: int | None = None,
):
    """Save atom configuration to MongoDB atom_list_configuration collection"""
    try:
        # Connect to MongoDB
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        
        # Get environment IDs (similar to Django backend)
        client_id = client_name
        app_id = app_name  
        project_id = project_name
        
        # Get the collection
        coll = db["atom_list_configuration"]
        
        # Delete existing configurations for this project/mode
        await coll.delete_many({
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "mode": atom_config_data.get("mode", "build")
        })
        
        # Prepare documents for insertion
        timestamp = datetime.utcnow()
        docs = []
        
        # Extract cards from atom_config_data
        cards = atom_config_data.get("cards", [])
        
        for canvas_pos, card in enumerate(cards):
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
                
                # Debug: Log what settings are being processed
                logger.info(f"🔍 DEBUG: Processing atom {atom_id} with settings keys: {list(atom_settings.keys())}")
                
                # Check for ROI and constraints specifically
                if 'roi_config' in atom_settings:
                    logger.info(f"🔍 DEBUG: Found roi_config in {atom_id}: {atom_settings['roi_config']}")
                if 'constraints_config' in atom_settings:
                    logger.info(f"🔍 DEBUG: Found constraints_config in {atom_id}: {atom_settings['constraints_config']}")
                if 'negative_constraints' in atom_settings:
                    logger.info(f"🔍 DEBUG: Found negative_constraints in {atom_id}: {atom_settings['negative_constraints']}")
                if 'positive_constraints' in atom_settings:
                    logger.info(f"🔍 DEBUG: Found positive_constraints in {atom_id}: {atom_settings['positive_constraints']}")
                
                # Clean up dataframe-operations data (similar to Django backend)
                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        k: v for k, v in atom_settings.items() if k not in {"tableData", "data"}
                    }
                
                # Generate version hash
                version_hash = hashlib.sha256(
                    json.dumps(atom_settings, sort_keys=True).encode()
                ).hexdigest()
                
                # Create document
                doc = {
                    "client_id": client_id,
                    "app_id": app_id,
                    "project_id": project_id,
                    "mode": atom_config_data.get("mode", "build"),
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
                
                # Debug: Log what's being saved for this atom
                logger.info(f"🔍 DEBUG: Saving atom {atom_id} with molecule_id: {molecule_id}, molecule_title: {molecule_title}, order: {card_order}")
                logger.info(f"🔍 DEBUG: Saving atom {atom_id} with atom_configs keys: {list(atom_settings.keys())}")
                if 'roi_config' in atom_settings:
                    logger.info(f"🔍 DEBUG: Saving roi_config: {atom_settings['roi_config']}")
                if 'constraints_config' in atom_settings:
                    logger.info(f"🔍 DEBUG: Saving constraints_config: {atom_settings['constraints_config']}")
                if 'negative_constraints' in atom_settings:
                    logger.info(f"🔍 DEBUG: Saving negative_constraints: {atom_settings['negative_constraints']}")
                if 'positive_constraints' in atom_settings:
                    logger.info(f"🔍 DEBUG: Saving positive_constraints: {atom_settings['positive_constraints']}")
                
                docs.append(doc)
        
        # Insert atom documents
        if docs:
            result = await coll.insert_many(docs)
            logger.info(f"📦 Stored {len(docs)} atom configurations in atom_list_configuration")
        
        # Save workflow_molecules as a separate document (if provided)
        workflow_molecules = atom_config_data.get("workflow_molecules", [])
        if workflow_molecules:
            # Create a document to store workflow_molecules with isActive and moleculeIndex
            workflow_doc = {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "mode": atom_config_data.get("mode", "build"),
                "workflow_molecules": workflow_molecules,
                "last_edited": timestamp,
                "is_workflow_metadata": True  # Marker to identify this document
            }
            
            # Delete existing workflow_molecules document for this project/mode
            await coll.delete_many({
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "mode": atom_config_data.get("mode", "build"),
                "is_workflow_metadata": True
            })
            
            # Insert the workflow_molecules document
            await coll.insert_one(workflow_doc)
            logger.info(f"📦 Stored {len(workflow_molecules)} workflow_molecules with isActive and moleculeIndex")
            for i, mol in enumerate(workflow_molecules):
                logger.info(f"🔍 DEBUG: Saved workflow molecule {i}: moleculeId={mol.get('moleculeId')}, isActive={mol.get('isActive')}, moleculeIndex={mol.get('moleculeIndex')}")
        
        if docs:
            return {
                "status": "success", 
                "mongo_id": f"{client_id}/{app_id}/{project_id}",
                "operation": "inserted",
                "collection": "atom_list_configuration",
                "documents_inserted": len(docs)
            }
        else:
            return {
                "status": "success", 
                "mongo_id": f"{client_id}/{app_id}/{project_id}",
                "operation": "no_data",
                "collection": "atom_list_configuration",
                "documents_inserted": 0
            }
        
    except Exception as e:
        logger.error(f"❌ MongoDB save error for atom_list_configuration: {e}")
        return {"status": "error", "error": str(e)}
