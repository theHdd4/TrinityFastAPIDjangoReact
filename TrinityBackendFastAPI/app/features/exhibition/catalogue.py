from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence, Tuple

ComponentEntry = Dict[str, Any]
FeatureOverviewEntry = Dict[str, Any]

_COMPONENT_LABELS = {
    "skuStatistics": "SKU Statistics",
    "trendAnalysis": "Trend Analysis",
}

_DEFAULT_COMPONENT_KEY = "overview"
_DEFAULT_COMPONENT_LABEL = "Overview Insight"


def _normalise_identifier(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if value is None:
        return fallback
    return str(value).strip() or fallback


def _component_label(component_type: str) -> str:
    if component_type == _DEFAULT_COMPONENT_KEY:
        return _DEFAULT_COMPONENT_LABEL
    return _COMPONENT_LABELS.get(component_type, component_type.replace("_", " ").title())


def _slugify(*parts: Any) -> str:
    raw = "-".join(str(part) for part in parts if part is not None)
    slug = re.sub(r"[^a-z0-9]+", "-", raw.lower())
    return slug.strip("-") or "catalogue-item"


def _enabled_components(entry: FeatureOverviewEntry) -> List[str]:
    components = entry.get("components")
    if isinstance(components, dict):
        enabled = [key for key, value in components.items() if bool(value)]
        if enabled:
            return enabled
    return [_DEFAULT_COMPONENT_KEY]


def build_catalogue_metadata(
    feature_overview: Iterable[FeatureOverviewEntry],
) -> Tuple[List[FeatureOverviewEntry], List[ComponentEntry]]:
    """Return a copy of feature overview entries with catalogue metadata and catalogue docs.

    Each SKU is decorated with a ``catalogue_components`` array describing the atoms
    that should appear inside the exhibition catalogue.  The second return value
    contains the flattened catalogue entries that should be persisted to MongoDB.
    """

    updated_entries: List[FeatureOverviewEntry] = []
    catalogue_entries: List[ComponentEntry] = []

    for entry in feature_overview or []:
        if not isinstance(entry, dict):
            continue

        atom_id = _normalise_identifier(entry.get("atomId"), "atom")
        card_id = _normalise_identifier(entry.get("cardId"), atom_id)
        enabled_components = _enabled_components(entry)

        updated_entry = dict(entry)
        raw_skus = entry.get("skus") if isinstance(entry.get("skus"), Sequence) else []
        updated_skus: List[Dict[str, Any]] = []

        for index, sku in enumerate(raw_skus):
            if not isinstance(sku, dict):
                continue

            sku_copy = dict(sku)
            sku_id = _normalise_identifier(sku_copy.get("id"), f"{atom_id}-{index}")
            sku_copy["id"] = sku_id

            base_title = _normalise_identifier(
                sku_copy.get("title"),
                f"SKU {index + 1}",
            )
            details = sku_copy.get("details")

            component_payloads: List[Dict[str, Any]] = []
            for component_type in enabled_components:
                label = _component_label(component_type)
                catalogue_title = f"{base_title} • {label}"
                catalogue_id = _slugify(atom_id, card_id, sku_id, component_type)

                component_payloads.append(
                    {
                        "type": component_type,
                        "label": label,
                        "title": catalogue_title,
                        "catalogue_id": catalogue_id,
                    }
                )

                catalogue_entries.append(
                    {
                        "catalogue_id": catalogue_id,
                        "catalogue_title": catalogue_title,
                        "component_type": component_type,
                        "component_label": label,
                        "atom_id": atom_id,
                        "card_id": card_id,
                        "sku_id": sku_id,
                        "sku_title": base_title,
                        "sku_details": details,
                    }
                )

            sku_copy["catalogue_components"] = component_payloads
            updated_skus.append(sku_copy)

        updated_entry["skus"] = updated_skus
        updated_entries.append(updated_entry)

    return updated_entries, catalogue_entries


def merge_catalogue_components(
    feature_overview: Any,
    catalogue_entries: Iterable[ComponentEntry],
) -> List[FeatureOverviewEntry]:
    """Attach persisted catalogue entries to the in-memory feature overview payload."""

    if not isinstance(feature_overview, Sequence):
        return []

    lookup: Dict[Tuple[str, str, str], List[ComponentEntry]] = {}
    for entry in catalogue_entries:
        atom_id = _normalise_identifier(entry.get("atom_id"), "atom")
        card_id = _normalise_identifier(entry.get("card_id"), atom_id)
        sku_id = _normalise_identifier(entry.get("sku_id"), "sku")
        key = (atom_id, card_id, sku_id)
        lookup.setdefault(key, []).append(entry)

    merged_entries: List[FeatureOverviewEntry] = []
    for entry in feature_overview:
        if not isinstance(entry, dict):
            continue

        atom_id = _normalise_identifier(entry.get("atomId"), "atom")
        card_id = _normalise_identifier(entry.get("cardId"), atom_id)

        merged_entry = dict(entry)
        raw_skus = entry.get("skus") if isinstance(entry.get("skus"), Sequence) else []
        merged_skus: List[Dict[str, Any]] = []

        for index, sku in enumerate(raw_skus):
            if not isinstance(sku, dict):
                continue

            sku_copy = dict(sku)
            sku_id = _normalise_identifier(sku_copy.get("id"), f"{atom_id}-{index}")
            sku_copy["id"] = sku_id

            components = lookup.get((atom_id, card_id, sku_id), [])
            if components:
                sku_copy["catalogue_components"] = [
                    {
                        "type": component.get("component_type"),
                        "label": component.get("component_label"),
                        "title": component.get("catalogue_title"),
                        "catalogue_id": component.get("catalogue_id"),
                    }
                    for component in sorted(
                        components,
                        key=lambda item: (
                            _normalise_identifier(item.get("component_label"), ""),
                            _normalise_identifier(item.get("catalogue_title"), ""),
                        ),
                    )
                ]

            merged_skus.append(sku_copy)

        merged_entry["skus"] = merged_skus
        merged_entries.append(merged_entry)

    return merged_entries


__all__ = ["build_catalogue_metadata", "merge_catalogue_components"]
