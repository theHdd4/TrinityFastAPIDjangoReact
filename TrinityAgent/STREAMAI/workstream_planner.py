"""DAG-first workstream planner for Trinity AI.

This module builds canonical DAG templates for intents and instantiates them
with request-specific context. It enforces static validation (cycles,
dependencies) and captures atom metadata (version, idempotency).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from .workstream_runtime import WorkstreamValidationError, WorkstreamValidator

logger = logging.getLogger("trinity.trinityai.workstream.planner")


TEMPLATE_PATH = Path(__file__).parent / "config" / "workstream_templates.json"


@dataclass
class AtomTemplate:
    atom_id: str
    endpoint: str
    purpose: str
    idempotency: str = "pure"
    version: str = "v1"
    depends_on: Optional[List[str]] = None

    def instantiate(self, context: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            "atom_id": self.atom_id,
            "endpoint": self.endpoint,
            "purpose": self.purpose,
            "idempotency": self.idempotency,
            "version": self.version,
            "depends_on": self.depends_on or [],
        }
        payload.update(context)
        return payload


@dataclass
class DAGTemplate:
    intent: str
    version: str
    atoms: List[AtomTemplate]

    def instantiate(self, context: Dict[str, Any]) -> Dict[str, Any]:
        instantiated_atoms = [atom.instantiate(context) for atom in self.atoms]
        WorkstreamValidator.validate_dag(instantiated_atoms)
        return {
            "intent": self.intent,
            "version": self.version,
            "sequence": instantiated_atoms,
            "total_atoms": len(instantiated_atoms),
        }


class WorkstreamPlanner:
    def __init__(self, template_path: Path = TEMPLATE_PATH):
        self.template_path = template_path
        self.templates: Dict[str, DAGTemplate] = {}
        self._load_templates()

    def _load_templates(self) -> None:
        if not self.template_path.exists():
            logger.warning("Workstream template config not found at %s", self.template_path)
            return
        with self.template_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        for intent, spec in data.items():
            atoms = [
                AtomTemplate(
                    atom_id=node["atom_id"],
                    endpoint=node.get("endpoint", "/api/stream/atom"),
                    purpose=node.get("purpose", ""),
                    idempotency=node.get("idempotency", "pure"),
                    version=node.get("version", spec.get("version", "v1")),
                    depends_on=node.get("depends_on", []),
                )
                for node in spec.get("atoms", [])
            ]
            self.templates[intent] = DAGTemplate(intent=intent, version=spec.get("version", "v1"), atoms=atoms)
        logger.info("Loaded %s workstream templates", len(self.templates))

    def plan(self, intent: str, request_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if intent not in self.templates:
            raise WorkstreamValidationError(f"No DAG template found for intent: {intent}")
        template = self.templates[intent]
        context = request_context or {}
        plan = template.instantiate(context)
        logger.info("Instantiated DAG for intent '%s' using template v%s", intent, template.version)
        return plan


__all__ = ["WorkstreamPlanner", "WorkstreamValidationError", "DAGTemplate", "AtomTemplate"]
