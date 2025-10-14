from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query, status

from .schemas import ExhibitionConfigurationIn, ExhibitionConfigurationOut, VisualizationManifest
from .service import ExhibitionStorage

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])
storage = ExhibitionStorage()


@router.get("/configuration", response_model=ExhibitionConfigurationOut)
async def get_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionConfigurationOut:
    record = await storage.get_configuration(client_name, app_name, project_name)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition configuration not found")

    return ExhibitionConfigurationOut(**record)


@router.post("/configuration", status_code=status.HTTP_200_OK)
async def save_configuration(
    config: ExhibitionConfigurationIn,
) -> Dict[str, Any]:
    payload = config.dict()
    payload["client_name"] = payload["client_name"].strip()
    payload["app_name"] = payload["app_name"].strip()
    payload["project_name"] = payload["project_name"].strip()
    payload["atoms"] = payload.get("atoms") or []

    if not payload["client_name"] or not payload["app_name"] or not payload["project_name"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    saved = await storage.save_configuration(payload)

    return {"status": "ok", "updated_at": saved.get("updated_at")}


@router.get("/manifests/{manifest_id}", response_model=VisualizationManifest)
async def get_manifest(
    manifest_id: str,
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> VisualizationManifest:
    manifest = await storage.get_manifest(client_name, app_name, project_name, manifest_id)
    if not manifest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manifest not found")

    return VisualizationManifest(**manifest)
