from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from datetime import datetime

class Content(BaseModel):
    format: Literal["quill-delta", "markdown", "html", "plain"]
    value: Any

class Spec(BaseModel):
    content: Content
    defaultStyle: Optional[dict] = None
    options: Optional[dict] = None

class TextIn(BaseModel):
    textId: str = Field(..., pattern=r"^[a-z0-9-_]+$")
    appId: str
    type: Literal["widget"]
    name: str
    spec: Spec
    status: Optional[str] = "active"  
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None