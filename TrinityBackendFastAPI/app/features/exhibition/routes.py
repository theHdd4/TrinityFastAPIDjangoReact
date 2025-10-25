from __future__ import annotations

import io
import logging
import mimetypes
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.DataStorageRetrieval.minio_utils import (
    MINIO_BUCKET,
    MINIO_ENDPOINT,
    ensure_minio_bucket,
    get_client,
)
from app.features.data_upload_validate.app.routes import get_object_prefix
from .deps import get_exhibition_layout_collection
from .persistence import save_exhibition_list_configuration
from .schemas import (
    ExhibitionConfigurationIn,
    ExhibitionConfigurationOut,
    ExhibitionLayoutConfigurationIn,
    ExhibitionLayoutConfigurationOut,
    ExhibitionManifestOut,
    ExhibitionImage,
    ExhibitionImageListResponse,
    ExhibitionImageUploadResponse,
)
from .service import ExhibitionStorage

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])
storage = ExhibitionStorage()


_FILENAME_SANITISER = re.compile(r"[^A-Za-z0-9_.-]+")


async def _resolve_images_prefix(client_name: str, app_name: str, project_name: str) -> str:
    """Return the MinIO prefix dedicated to stored exhibition images."""

    base_prefix = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )
    if not base_prefix.endswith("/"):
        base_prefix = f"{base_prefix}/"
    return f"{base_prefix}Images/"


def _build_image_url(object_name: str) -> str:
    return f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}"


def _normalise_filename(original: str, content_type: str | None) -> str:
    candidate = Path(original or "").name
    stem = Path(candidate).stem or "image"
    extension = Path(candidate).suffix

    safe_stem = _FILENAME_SANITISER.sub("_", stem).strip("._") or "image"

    if not extension:
        guessed = mimetypes.guess_extension(content_type or "") or ""
        extension = guessed

    safe_extension = ""
    if extension:
        safe_extension = extension if extension.startswith(".") else f".{extension}"

    unique_suffix = uuid.uuid4().hex[:8]
    return f"{safe_stem}_{unique_suffix}{safe_extension}".strip()


def _object_to_schema(obj) -> ExhibitionImage:
    filename = Path(obj.object_name).name
    uploaded_at = getattr(obj, "last_modified", None)
    return ExhibitionImage(
        object_name=obj.object_name,
        filename=filename,
        url=_build_image_url(obj.object_name),
        uploaded_at=uploaded_at,
    )


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


@router.get("/images", response_model=ExhibitionImageListResponse)
async def list_exhibition_images(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionImageListResponse:
    """Return all images uploaded for the active exhibition project."""

    prefix = await _resolve_images_prefix(client_name, app_name, project_name)
    ensure_minio_bucket()

    client = get_client()
    objects = client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True)

    images: List[ExhibitionImage] = []
    for obj in objects:
        if getattr(obj, "is_dir", False):
            continue
        try:
            images.append(_object_to_schema(obj))
        except Exception as exc:  # pragma: no cover - defensive guard
            logging.warning("Failed to translate MinIO object %s: %s", obj.object_name, exc)

    images.sort(key=lambda img: img.uploaded_at or datetime.min, reverse=True)
    return ExhibitionImageListResponse(images=images)


@router.post("/images/upload", response_model=ExhibitionImageUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_exhibition_image(
    file: UploadFile = File(...),
    client_name: str = Form(..., min_length=1),
    app_name: str = Form(..., min_length=1),
    project_name: str = Form(..., min_length=1),
) -> ExhibitionImageUploadResponse:
    """Upload a new accent image to the project's MinIO namespace."""

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image uploads are supported")

    prefix = await _resolve_images_prefix(client_name, app_name, project_name)
    ensure_minio_bucket()

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file was empty")

    filename = _normalise_filename(file.filename, file.content_type)
    object_name = f"{prefix}{filename}"

    client = get_client()
    try:
        client.put_object(
            MINIO_BUCKET,
            object_name,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        )
    except Exception as exc:  # pragma: no cover - network/storage failure
        logging.error("Failed to upload exhibition image %s: %s", filename, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to upload image to storage",
        ) from exc

    uploaded_at = datetime.utcnow()
    image = ExhibitionImage(
        object_name=object_name,
        filename=filename,
        url=_build_image_url(object_name),
        uploaded_at=uploaded_at,
    )

    return ExhibitionImageUploadResponse(image=image)


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


@router.get("/manifest", response_model=ExhibitionManifestOut)
async def get_manifest(
    component_id: str = Query(..., min_length=1),
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionManifestOut:
    record = await storage.get_manifest(client_name, app_name, project_name, component_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition manifest not found")

    return ExhibitionManifestOut(**record)


@router.get("/layout", response_model=ExhibitionLayoutConfigurationOut)
async def get_layout_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> ExhibitionLayoutConfigurationOut:
    filter_query = {
        "client_name": client_name.strip(),
        "app_name": app_name.strip(),
        "project_name": project_name.strip(),
    }

    record = await collection.find_one({**filter_query, "document_type": "layout_snapshot"})
    if not record:
        record = await collection.find_one(filter_query)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition layout not found")

    record.pop("_id", None)
    record.pop("document_type", None)
    return ExhibitionLayoutConfigurationOut(**record)


@router.post("/layout", status_code=status.HTTP_200_OK)
async def save_layout_configuration(
    layout: ExhibitionLayoutConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> Dict[str, Any]:
    payload = layout.model_dump(by_alias=True)
    client_name = payload.get("client_name", "").strip()
    app_name = payload.get("app_name", "").strip()
    project_name = payload.get("project_name", "").strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    cards = payload.get("cards")
    if not isinstance(cards, list):
        cards = []

    slide_objects = payload.get("slide_objects")
    if not isinstance(slide_objects, dict):
        slide_objects = {}

    persistence_result = await save_exhibition_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        exhibition_config_data={
            "mode": payload.get("mode") or "exhibition",
            "cards": cards,
            "slide_objects": slide_objects,
        },
        collection=collection,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist exhibition layout"),
        )

    timestamp = persistence_result.get("updated_at", datetime.utcnow())
    updated_at = timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)

    return {
        "status": "ok",
        "updated_at": updated_at,
        "documents_inserted": persistence_result.get("documents_written", 0),
    }
