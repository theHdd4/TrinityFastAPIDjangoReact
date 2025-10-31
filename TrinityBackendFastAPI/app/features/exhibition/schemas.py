from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ExhibitionComponent(BaseModel):
    """Represents a component exhibited from a specific atom."""

    id: str = Field(..., description="Identifier of the exhibited component")
    atomId: Optional[str] = Field(None, description="Source atom identifier for the component")
    title: Optional[str] = Field(None, description="Display label for the exhibited component")
    category: Optional[str] = Field(None, description="Category of the exhibited component")
    color: Optional[str] = Field(None, description="Accent colour associated with the component")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata captured for the exhibited component",
    )
    manifest: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Serialised visualisation manifest for the component",
    )
    manifest_id: Optional[str] = Field(
        default=None,
        description="Stable identifier for the stored manifest",
    )


class ExhibitionAtomEntry(BaseModel):
    """Grouping of exhibited components for a single atom."""

    id: str = Field(..., min_length=1, description="Stable identifier for the exhibited atom entry")
    atom_name: str = Field(..., min_length=1, description="Human friendly name of the atom")
    exhibited_components: List[ExhibitionComponent] = Field(
        default_factory=list,
        description="Components from the atom that should appear in the exhibition catalogue",
    )


class ExhibitionConfigurationBase(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    atoms: List[ExhibitionAtomEntry] = Field(default_factory=list)


class ExhibitionConfigurationIn(ExhibitionConfigurationBase):
    """Payload accepted when saving an exhibition configuration."""


class ExhibitionConfigurationOut(ExhibitionConfigurationBase):
    updated_at: Optional[datetime] = Field(default=None, description="Timestamp of the last update")

    model_config = ConfigDict(from_attributes=True)


class ExhibitionManifestOut(BaseModel):
    """Read-only representation of an exhibited component manifest."""

    component_id: str = Field(..., description="Identifier of the requested exhibition component")
    manifest: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Serialised manifest payload for the component",
    )
    manifest_id: Optional[str] = Field(
        default=None,
        description="Stable manifest identifier if available",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Associated metadata stored alongside the manifest",
    )
    atom_id: Optional[str] = Field(default=None, description="Identifier of the parent atom")
    atom_name: Optional[str] = Field(default=None, description="Display name of the parent atom")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp for the manifest")


class ExhibitionLayoutAtom(BaseModel):
    """Minimal representation of an atom placed on an exhibition slide."""

    id: str = Field(..., min_length=1)
    atomId: str = Field(..., min_length=1)
    title: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ExhibitionLayoutSlideObject(BaseModel):
    """Persisted slide object used when restoring exhibition layouts."""

    id: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    x: float = Field(...)
    y: float = Field(...)
    width: Optional[float] = None
    height: Optional[float] = None
    zIndex: Optional[int] = Field(default=None, alias="zIndex")
    groupId: Optional[str] = Field(default=None, alias="groupId")
    props: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class ExhibitionLayoutCard(BaseModel):
    """Slide level configuration for the exhibition layout."""

    id: str = Field(..., min_length=1)
    atoms: List[ExhibitionLayoutAtom] = Field(default_factory=list)
    catalogueAtoms: List[ExhibitionLayoutAtom] = Field(default_factory=list)
    isExhibited: bool = Field(default=True)
    moleculeId: Optional[str] = None
    moleculeTitle: Optional[str] = None
    title: Optional[str] = None
    lastEditedAt: Optional[str] = None
    presentationSettings: Optional[Dict[str, Any]] = None


class ExhibitionLayoutConfigurationBase(BaseModel):
    client_name: str = Field(..., min_length=1)
    app_name: str = Field(..., min_length=1)
    project_name: str = Field(..., min_length=1)
    cards: List[ExhibitionLayoutCard] = Field(default_factory=list)
    slide_objects: Dict[str, List[ExhibitionLayoutSlideObject]] = Field(
        default_factory=dict, alias="slide_objects"
    )

    model_config = ConfigDict(populate_by_name=True)


class ExhibitionLayoutConfigurationIn(ExhibitionLayoutConfigurationBase):
    """Incoming payload when saving the exhibition layout."""


class ExhibitionLayoutConfigurationOut(ExhibitionLayoutConfigurationBase):
    """Response payload when loading the exhibition layout."""

    updated_at: Optional[datetime] = Field(default=None)


class DocumentStylesPayload(BaseModel):
    inline: List[str] = Field(default_factory=list)
    external: List[str] = Field(default_factory=list)
    base_url: Optional[str] = Field(default=None, alias="baseUrl")

    model_config = ConfigDict(populate_by_name=True)


class SlideScreenshotPayload(BaseModel):
    """Screenshot metadata accompanying an exported slide."""

    data_url: str = Field(..., alias="dataUrl")
    width: int
    height: int
    css_width: Optional[float] = Field(default=None, alias="cssWidth")
    css_height: Optional[float] = Field(default=None, alias="cssHeight")
    pixel_ratio: Optional[float] = Field(default=None, alias="pixelRatio")

    model_config = ConfigDict(populate_by_name=True)


class SlideScreenshotResponse(SlideScreenshotPayload):
    """Screenshot payload returned to clients requesting rendered slides."""

    id: str = Field(..., min_length=1)
    index: int = Field(..., ge=0)


class SlideDomSnapshotPayload(BaseModel):
    """Serialised DOM snapshot used for server-side rendering."""

    html: str
    width: float
    height: float
    pixel_ratio: Optional[float] = Field(default=None, alias="pixelRatio")

    model_config = ConfigDict(populate_by_name=True)


class SlideExportObjectPayload(BaseModel):
    """Object placed on a slide during export generation."""

    id: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    x: float
    y: float
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    z_index: Optional[int] = Field(default=None, alias="zIndex")
    props: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class SlideExportPayload(BaseModel):
    """Structured slide definition used for export rendering."""

    id: str = Field(..., min_length=1)
    index: int = Field(..., ge=0)
    title: Optional[str] = None
    base_width: float = Field(..., alias="baseWidth")
    base_height: float = Field(..., alias="baseHeight")
    presentation_settings: Optional[Dict[str, Any]] = Field(
        default=None, alias="presentationSettings"
    )
    objects: List[SlideExportObjectPayload] = Field(default_factory=list)
    screenshot: Optional[SlideScreenshotPayload] = None
    dom_snapshot: Optional[SlideDomSnapshotPayload] = Field(default=None, alias="domSnapshot")

    model_config = ConfigDict(populate_by_name=True)


class ExhibitionExportRequest(BaseModel):
    """Payload accepted by the presentation export endpoints."""

    title: Optional[str] = None
    slides: List[SlideExportPayload] = Field(default_factory=list)
    document_styles: Optional[DocumentStylesPayload] = Field(
        default=None, alias="documentStyles"
    )


class SlideScreenshotsResponse(BaseModel):
    """Response returned when generating slide screenshots."""

    slides: List[SlideScreenshotResponse] = Field(default_factory=list)
