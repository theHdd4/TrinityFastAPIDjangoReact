"""REST endpoints for managing project image assets."""

from __future__ import annotations

import io
import logging
import mimetypes
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, List
from urllib.parse import urlparse

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status

from app.DataStorageRetrieval.minio_utils import (
    MINIO_BUCKET,
    MINIO_ENDPOINT,
    ensure_minio_bucket,
    get_client,
)
from app.features.data_upload_validate.app.routes import get_object_prefix

from .schemas import ProjectImage, ProjectImageListResponse, ProjectImageUploadResponse

router = APIRouter(prefix="/images", tags=["Images"])

_FILENAME_SANITISER = re.compile(r"[^A-Za-z0-9_.-]+")
_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _normalise_minio_base_url() -> str:
    """Return the public MinIO base URL derived from configuration."""

    public_endpoint = os.getenv("MINIO_PUBLIC_ENDPOINT")
    if public_endpoint:
        return public_endpoint.rstrip("/")

    endpoint = MINIO_ENDPOINT.rstrip("/")
    parsed = urlparse(endpoint)
    if parsed.scheme:
        return endpoint

    is_secure = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes"}
    scheme = "https" if is_secure else "http"
    return f"{scheme}://{endpoint}"


async def _resolve_images_prefix(client_name: str, app_name: str, project_name: str) -> str:
    """Return the MinIO prefix dedicated to stored project images."""

    base_prefix = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )
    if not base_prefix.endswith("/"):
        base_prefix = f"{base_prefix}/"
    return f"{base_prefix}Images/"


def _build_image_url(object_name: str) -> str:
    base_url = _normalise_minio_base_url()
    return f"{base_url}/{MINIO_BUCKET}/{object_name}"


def _is_allowed_image(filename: str, content_type: str | None) -> bool:
    extension = Path(filename or "").suffix.lower()
    if extension in _ALLOWED_EXTENSIONS:
        return True

    if content_type:
        return content_type.lower() in {"image/jpeg", "image/png"}

    return False


def _normalise_filename(original: str, content_type: str | None) -> str:
    candidate = Path(original or "").name
    stem = Path(candidate).stem or "image"
    extension = Path(candidate).suffix.lower()

    safe_stem = _FILENAME_SANITISER.sub("_", stem).strip("._") or "image"

    if not extension:
        guessed = mimetypes.guess_extension(content_type or "") or ""
        extension = guessed.lower()

    safe_extension = ""
    if extension:
        safe_extension = extension if extension.startswith(".") else f".{extension}"

    unique_suffix = uuid.uuid4().hex[:8]
    return f"{safe_stem}_{unique_suffix}{safe_extension}".strip()


def _object_to_schema(obj) -> ProjectImage:
    filename = Path(obj.object_name).name
    uploaded_at = getattr(obj, "last_modified", None)
    return ProjectImage(
        object_name=obj.object_name,
        filename=filename,
        url=_build_image_url(obj.object_name),
        uploaded_at=uploaded_at,
    )


@router.get("", response_model=ProjectImageListResponse)
async def list_project_images(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ProjectImageListResponse:
    """Return all images uploaded for the supplied project."""

    prefix = await _resolve_images_prefix(client_name, app_name, project_name)
    if not ensure_minio_bucket():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image storage bucket is unavailable",
        )

    client = get_client()
    try:
        objects: Iterable[Any] = client.list_objects(MINIO_BUCKET, prefix=prefix, recursive=True)
    except Exception as exc:  # pragma: no cover - network/storage failure
        logging.error("Failed to list project images for %s: %s", prefix, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to list stored images",
        ) from exc

    images: List[ProjectImage] = []
    for obj in objects:
        if getattr(obj, "is_dir", False):
            continue
        try:
            images.append(_object_to_schema(obj))
        except Exception as exc:  # pragma: no cover - defensive guard
            logging.warning("Failed to translate MinIO object %s: %s", obj.object_name, exc)

    images.sort(key=lambda img: img.uploaded_at or datetime.min, reverse=True)
    return ProjectImageListResponse(images=images)


@router.post("/upload", response_model=ProjectImageUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_project_image(
    file: UploadFile = File(...),
    client_name: str = Form(..., min_length=1),
    app_name: str = Form(..., min_length=1),
    project_name: str = Form(..., min_length=1),
) -> ProjectImageUploadResponse:
    """Upload a new image to the project's MinIO namespace."""

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image uploads are supported")

    prefix = await _resolve_images_prefix(client_name, app_name, project_name)
    if not ensure_minio_bucket():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image storage bucket is unavailable",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file was empty")

    if not _is_allowed_image(file.filename, file.content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .jpg, .jpeg, or .png uploads are supported",
        )

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
        logging.error("Failed to upload project image %s: %s", filename, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to upload image to storage",
        ) from exc

    uploaded_at = datetime.utcnow()
    image = ProjectImage(
        object_name=object_name,
        filename=filename,
        url=_build_image_url(object_name),
        uploaded_at=uploaded_at,
    )

    return ProjectImageUploadResponse(image=image)
