from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence, Tuple

ComponentEntry = Dict[str, Any]
FeatureOverviewEntry = Dict[str, Any]

_STATISTICAL_COMPONENT = "statistical_summary"
_COMPONENT_LABELS = {
    "skuStatistics": "SKU Statistics",
    "trendAnalysis": "Trend Analysis",
    _STATISTICAL_COMPONENT: "Statistical Summary",
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


def _statistical_summaries(sku: Dict[str, Any]) -> List[Dict[str, Any]]:
    summaries = sku.get("statistical_summaries")
    if not isinstance(summaries, Sequence):
        return []
    return [dict(summary) for summary in summaries if isinstance(summary, dict)]


def _chart_settings(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}

    return {
        "chartType": raw.get("chart_type") or raw.get("chartType"),
        "chartTheme": raw.get("chart_theme") or raw.get("chartTheme"),
        "showDataLabels": bool(raw.get("show_data_labels") if raw.get("show_data_labels") is not None else raw.get("showDataLabels")),
        "showAxisLabels": bool(raw.get("show_axis_labels") if raw.get("show_axis_labels") is not None else raw.get("showAxisLabels", True)),
        "xAxisLabel": raw.get("x_axis_label") or raw.get("xAxisLabel"),
        "yAxisLabel": raw.get("y_axis_label") or raw.get("yAxisLabel"),
    }


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
            summaries = _statistical_summaries(sku_copy)
            if summaries:
                enriched_summaries: List[Dict[str, Any]] = []
                for summary_index, summary in enumerate(summaries):
                    summary_copy = dict(summary)

                    component_type = summary_copy.get("component_type") or _STATISTICAL_COMPONENT
                    metric_name = _normalise_identifier(
                        summary_copy.get("metric"), f"metric-{summary_index}"
                    )
                    metric_label = summary_copy.get("metric_label") or metric_name

                    catalogue_id = _normalise_identifier(
                        summary_copy.get("catalogue_id"),
                        _slugify(atom_id, card_id, sku_id, component_type, metric_name),
                    )
                    catalogue_title = summary_copy.get("catalogue_title") or (
                        f"{base_title} • {metric_label}"
                    )

                    metadata = {
                        "metric": metric_name,
                        "metricLabel": metric_label,
                        "summary": summary_copy.get("summary") or {},
                        "timeseries": summary_copy.get("timeseries") or [],
                        "chartSettings": _chart_settings(summary_copy.get("chart_settings")),
                        "combination": summary_copy.get("combination") or {},
                        "componentType": component_type,
                        "skuId": sku_id,
                        "skuTitle": base_title,
                        "skuDetails": details,
                    }
                    if isinstance(summary_copy.get("metadata"), dict):
                        metadata.update(summary_copy["metadata"])

                    summary_copy["component_type"] = component_type
                    summary_copy["metric"] = metric_name
                    summary_copy["metric_label"] = metric_label
                    summary_copy["catalogue_id"] = catalogue_id
                    summary_copy["catalogue_title"] = catalogue_title
                    summary_copy["metadata"] = metadata

                    component_payloads.append(
                        {
                            "type": component_type,
                            "label": metric_label,
                            "title": catalogue_title,
                            "catalogue_id": catalogue_id,
                            "metadata": metadata,
                        }
                    )

                    catalogue_entries.append(
                        {
                            "catalogue_id": catalogue_id,
                            "catalogue_title": catalogue_title,
                            "component_type": component_type,
                            "component_label": metric_label,
                            "atom_id": atom_id,
                            "card_id": card_id,
                            "sku_id": sku_id,
                            "sku_title": base_title,
                            "sku_details": details,
                            "metadata": metadata,
                        }
                    )

                    enriched_summaries.append(summary_copy)

                sku_copy["statistical_summaries"] = enriched_summaries

            if not component_payloads:
                for component_type in enabled_components:
                    label = _component_label(component_type)
                    catalogue_title = f"{base_title} • {label}"
                    catalogue_id = _slugify(atom_id, card_id, sku_id, component_type)

                    fallback_metadata = {
                        "componentType": component_type,
                        "skuId": sku_id,
                        "skuTitle": base_title,
                        "skuDetails": details,
                    }

                    component_payloads.append(
                        {
                            "type": component_type,
                            "label": label,
                            "title": catalogue_title,
                            "catalogue_id": catalogue_id,
                            "metadata": fallback_metadata,
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
                            "metadata": fallback_metadata,
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
                sorted_components = sorted(
                    components,
                    key=lambda item: (
                        _normalise_identifier(item.get("component_label"), ""),
                        _normalise_identifier(item.get("catalogue_title"), ""),
                    ),
                )

                sku_copy["catalogue_components"] = [
                    {
                        "type": component.get("component_type"),
                        "label": component.get("component_label"),
                        "title": component.get("catalogue_title"),
                        "catalogue_id": component.get("catalogue_id"),
                        "metadata": component.get("metadata"),
                    }
                    for component in sorted_components
                ]

                summaries = sku_copy.get("statistical_summaries")
                if isinstance(summaries, Sequence):
                    component_by_id = {
                        _normalise_identifier(component.get("catalogue_id"), ""): component
                        for component in sorted_components
                    }
                    refreshed_summaries: List[Dict[str, Any]] = []
                    for summary in summaries:
                        if not isinstance(summary, dict):
                            continue
                        summary_copy = dict(summary)
                        lookup_id = _normalise_identifier(summary_copy.get("catalogue_id"), "")
                        component = component_by_id.get(lookup_id)
                        if component:
                            summary_copy["catalogue_id"] = component.get("catalogue_id")
                            summary_copy["catalogue_title"] = component.get("catalogue_title")
                            summary_copy["component_type"] = component.get("component_type")
                            summary_copy["metadata"] = component.get("metadata")
                        refreshed_summaries.append(summary_copy)
                    sku_copy["statistical_summaries"] = refreshed_summaries

            merged_skus.append(sku_copy)

        merged_entry["skus"] = merged_skus
        merged_entries.append(merged_entry)

    return merged_entries


__all__ = ["build_catalogue_metadata", "merge_catalogue_components"]
