"""Pydantic models used by the project image storage endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ProjectImage(BaseModel):
    """Metadata describing an image stored for a project."""

    object_name: str = Field(..., description="Full MinIO object path for the image")
    filename: str = Field(..., description="Display file name for the image")
    url: str = Field(..., description="Public URL that can be used to render the image")
    uploaded_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp recorded when the image was uploaded",
    )


class ProjectImageUploadResponse(BaseModel):
    """Response returned after a successful image upload."""

    status: str = Field(default="success")
    image: ProjectImage


class ProjectImageListResponse(BaseModel):
    """Collection of images stored for a project."""

    images: List[ProjectImage] = Field(default_factory=list)
