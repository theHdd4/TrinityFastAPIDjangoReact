"""
Simple SuperAgent AI for Trinity Laboratory Mode

Direct AI communication - send prompt, get answer.
Includes atom mapping for consistent atomId usage across frontend/backend.
"""

from .main_app import router as superagent_router
from .atom_mapping import (
    ATOM_MAPPING,
    detect_atom_from_prompt,
    get_atom_info,
    normalize_atom_id,
    fetch_atom_name_to_atomid
)

__version__ = "1.0.0"
__all__ = [
    "superagent_router",
    "ATOM_MAPPING",
    "detect_atom_from_prompt",
    "get_atom_info",
    "normalize_atom_id",
    "fetch_atom_name_to_atomid"
]
