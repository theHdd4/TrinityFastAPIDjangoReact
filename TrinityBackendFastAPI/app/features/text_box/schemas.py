from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from datetime import datetime

class Content(BaseModel):
    format: Literal["quill-delta", "markdown", "html", "plain"]
    value: Any

class Spec(BaseModel):
    content: Content
    allow_variables: Optional[bool] = False
    max_chars: Optional[int] = 100
    text_align: Optional[Literal["left", "center", "right", "justify"]] = "left"
    font_size: Optional[int] = 14
    font_family: Optional[str] = "Inter"
    text_color: Optional[str] = "#000000"
    bold: Optional[bool] = False
    italics: Optional[bool] = False
    underline: Optional[bool] = False
    headline: Optional[str] = None
    slide_layout: Optional[Literal["full", "sidebar", "note-callout"]] = "full"
    transition_effect: Optional[Literal["none", "fade", "typewriter"]] = "none"
    lock_content: Optional[bool] = False

class TextIn(BaseModel):
    textId: str = Field(..., pattern=r"^[a-z0-9-_]+$")
    appId: str
    type: Literal["widget"]
    name: str
    spec: Spec
    status: Optional[str] = "active"  
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

