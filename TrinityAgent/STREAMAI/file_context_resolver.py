"""
file_context_resolver.py
========================

Provides a reusable helper for resolving which files (and related metadata)
should be sent to the LLM based on a user's prompt. This centralises the
logic so every agent (atoms, StreamAI, etc.) can share the same behaviour
for:

- Matching user prompts against available file names and columns.
- Reducing prompt size by only including the most relevant files.
- Supplying lightweight summary metadata (row counts, sample stats) for
  the selected files to improve LLM accuracy.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logger = logging.getLogger("trinity.file_context")


@dataclass
class FileContextResult:
    """
    Normalised result returned by FileContextResolver.resolve().
    """

    relevant_files: Dict[str, List[str]] = field(default_factory=dict)
    file_details: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    other_files: List[str] = field(default_factory=list)
    matched_mentions: List[str] = field(default_factory=list)
    matched_columns: Dict[str, List[str]] = field(default_factory=dict)
    object_mappings: Dict[str, List[str]] = field(default_factory=dict)

    def to_object_column_mapping(self, fallback: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Convert the selection into a mapping keyed by object path with column metadata.

        Parameters
        ----------
        fallback : Optional[dict]
            Mapping to return if no relevant files were selected.
        """
        if self.relevant_files:
            mapping: Dict[str, Dict[str, Any]] = {}
            for display, columns in self.relevant_files.items():
                object_paths = self.object_mappings.get(display) or [display]
                for object_path in object_paths:
                    mapping[object_path] = {
                        "columns": columns,
                        "display_name": display
                    }
            return mapping
        return fallback or {}


class FileContextResolver:
    """
    Resolve relevant files and metadata for a user prompt.

    Parameters
    ----------
    file_loader : Optional object exposing `load_files()` (e.g. FileLoader)
        Used when we need to refresh available files dynamically.
    file_analyzer : Optional FileAnalyzer
        Used to pull detailed metadata for matched files on-demand.
    """

    def __init__(self, file_loader: Any = None, file_analyzer: Any = None):
        self.file_loader = file_loader
        self.file_analyzer = file_analyzer

        # Primary indexes
        self._files_index: Dict[str, List[str]] = {}
        self._display_to_object: Dict[str, Set[str]] = {}
        self._object_to_display: Dict[str, str] = {}
        self._metadata_cache: Dict[str, Dict[str, Any]] = {}

        # Column reverse index (column -> set(files))
        self._column_index: Dict[str, Set[str]] = {}

        # Preserve insertion order for deterministic fallbacks
        self._ordered_files: List[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update_files(
        self,
        files_with_columns: Dict[str, Any],
        files_metadata: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> None:
        """
        Update resolver with the latest available files and optional metadata.

        Parameters
        ----------
        files_with_columns : dict
            Typically `{object_name: {"columns": [...]}}` or `{display: [...]}`.
        files_metadata : dict, optional
            Metadata keyed by display name or object path.
        """
        if not isinstance(files_with_columns, dict):
            logger.warning("update_files called with non-dict input: %s", type(files_with_columns))
            return

        self._files_index.clear()
        self._display_to_object.clear()
        self._object_to_display.clear()
        self._column_index.clear()
        self._ordered_files = []

        for object_key, raw_value in files_with_columns.items():
            columns: List[str] = []
            display_name: Optional[str] = None

            if isinstance(raw_value, dict):
                raw_columns = raw_value.get("columns")
                if isinstance(raw_columns, (list, tuple, set)):
                    columns = [str(col) for col in raw_columns if isinstance(col, str)]
                else:
                    continue
                display_name = raw_value.get("file_name") or os.path.basename(object_key)
            elif isinstance(raw_value, (list, tuple, set)):
                columns = [str(col) for col in raw_value if isinstance(col, str)]
                display_name = os.path.basename(object_key)
            else:
                logger.debug("Skipping unsupported file metadata format for key %s", object_key)
                continue

            display_name = display_name or object_key
            if not columns:
                logger.debug("Skipping file %s because it has no columns", display_name)
                continue

            # Normalise
            self._files_index[display_name] = columns
            self._ordered_files.append(display_name)

            self._display_to_object.setdefault(display_name, set()).add(object_key)
            self._object_to_display[object_key] = display_name

            for col in columns:
                col_norm = str(col).strip().lower()
                if len(col_norm) < 3:
                    continue
                self._column_index.setdefault(col_norm, set()).add(display_name)

        # Prefill metadata cache if provided
        if isinstance(files_metadata, dict):
            for key, meta in files_metadata.items():
                if not isinstance(meta, dict):
                    continue
                display = key
                if display not in self._files_index and key in self._object_to_display:
                    display = self._object_to_display[key]
                self._metadata_cache[display] = meta

        logger.info("FileContextResolver updated with %d files", len(self._files_index))

    def refresh_from_loader(self) -> None:
        """
        Refresh available files using the bound loader (if provided).
        """
        if not self.file_loader:
            logger.debug("refresh_from_loader called without a file_loader attached")
            return

        try:
            loaded = self.file_loader.load_files()
            self.update_files(loaded)
        except Exception as exc:
            logger.error("Failed to refresh files via loader: %s", exc)

    def resolve(
        self,
        prompt: Optional[str] = None,
        user_prompt: Optional[str] = None,
        top_k: int = 3,
        include_metadata: bool = True,
        fallback_limit: int = 10,
    ) -> FileContextResult:
        """
        Resolve the most relevant files for a user prompt.
        """
        effective_prompt = prompt if isinstance(prompt, str) else user_prompt
        if not effective_prompt or not isinstance(effective_prompt, str):
            return FileContextResult()

        if not self._files_index:
            # Attempt a lazy refresh
            self.refresh_from_loader()

        if not self._files_index:
            return FileContextResult()

        top_k = max(top_k, 1)
        normalized_prompt = effective_prompt.lower()
        token_set = self._tokenise(normalized_prompt)

        matches: List[Tuple[str, float, List[str]]] = []
        matched_columns: Dict[str, List[str]] = {}

        for display, columns in self._files_index.items():
            score, mention_hits, column_hits = self._score_file(display, columns, normalized_prompt, token_set)
            if column_hits:
                matched_columns[display] = column_hits

            if score > 0:
                matches.append((display, score, mention_hits))

        matched_mentions: List[str] = []

        if matches:
            matches.sort(key=lambda item: item[1], reverse=True)
            selected = [name for name, _, _ in matches[:top_k]]
            other = [name for name, _, _ in matches[top_k:]]

            for _, _, mentions in matches[:top_k]:
                for mention in mentions:
                    mention_lower = mention.lower()
                    if mention_lower not in matched_mentions:
                        matched_mentions.append(mention_lower)
        else:
            # No direct matches – fallback to the first N files (deterministic)
            selected = self._ordered_files[:top_k]
            other = self._ordered_files[top_k:]

        relevant = {name: self._files_index.get(name, []) for name in selected if name in self._files_index}

        if not relevant and self._files_index:
            # As an ultimate fallback ensure at least one file is returned
            first = self._ordered_files[:top_k]
            relevant = {name: self._files_index[name] for name in first}
            other = self._ordered_files[top_k:]

        file_details: Dict[str, Dict[str, Any]] = {}
        object_mappings: Dict[str, List[str]] = {}
        if include_metadata:
            for name in relevant.keys():
                object_mappings[name] = sorted(self._display_to_object.get(name, {name}))
                metadata = self._get_metadata(name)
                if metadata:
                    file_details[name] = self._condense_metadata(name, metadata, matched_columns.get(name))
        else:
            for name in relevant.keys():
                object_mappings[name] = sorted(self._display_to_object.get(name, {name}))

        return FileContextResult(
            relevant_files=relevant,
            file_details=file_details,
            other_files=other[: max(fallback_limit, 0)],
            matched_mentions=matched_mentions,
            matched_columns={k: v for k, v in matched_columns.items() if k in relevant},
            object_mappings=object_mappings,
        )

    def get_available_files(self) -> Dict[str, List[str]]:
        """
        Return a shallow copy of the available files index.
        """
        return dict(self._files_index)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _tokenise(prompt: str) -> Set[str]:
        pattern = r"[a-z0-9_\-\.\:]+"
        return {match for match in re.findall(pattern, prompt) if match}

    def _score_file(
        self,
        display_name: str,
        columns: Iterable[str],
        normalized_prompt: str,
        token_set: Set[str],
    ) -> Tuple[float, List[str], List[str]]:
        display_lower = display_name.lower()
        display_no_ext = os.path.splitext(display_lower)[0]
        score = 0.0
        mention_hits: List[str] = []

        if display_lower in normalized_prompt:
            score += 6.0
            mention_hits.append(display_lower)
        elif display_no_ext and display_no_ext in normalized_prompt:
            score += 5.0
            mention_hits.append(display_no_ext)
        else:
            for part in re.split(r"[_\-\s\.]+", display_no_ext):
                if len(part) < 3:
                    continue
                if part in token_set:
                    score += 2.0
                    mention_hits.append(part)

        # Fuzzy token matching
        for token in token_set:
            if len(token) < 4:
                continue
            ratio = SequenceMatcher(None, token, display_no_ext).ratio()
            if ratio >= 0.82:
                score += 1.5
                mention_hits.append(token)
                break

        column_hits: List[str] = []
        for col in columns:
            col_norm = str(col).strip().lower()
            if len(col_norm) < 3:
                continue
            if col_norm in normalized_prompt or col_norm in token_set:
                column_hits.append(str(col))
                if len(column_hits) >= 6:  # Cap additions to avoid runaway scoring
                    break

        if column_hits:
            score += min(len(column_hits), 4) * 1.5

        return score, mention_hits, column_hits

    def _get_metadata(self, display_name: str) -> Optional[Dict[str, Any]]:
        if display_name in self._metadata_cache:
            return self._metadata_cache[display_name]

        if not self.file_analyzer:
            return None

        object_paths = list(self._display_to_object.get(display_name, []))
        if not object_paths:
            return None

        try:
            analyses = self.file_analyzer.analyze_specific_files(object_paths)
            if analyses:
                filename = os.path.basename(object_paths[0])
                metadata = analyses.get(filename)
                if metadata:
                    self._metadata_cache[display_name] = metadata
                    return metadata
        except Exception as exc:
            logger.error("Failed to fetch metadata for %s: %s", display_name, exc)

        return self._metadata_cache.get(display_name)

    def _condense_metadata(
        self,
        display_name: str,
        metadata: Dict[str, Any],
        highlight_columns: Optional[List[str]],
    ) -> Dict[str, Any]:
        highlight_columns = highlight_columns or []

        summary: Dict[str, Any] = {
            "file_path": self._pick_object_path(display_name),
            "total_rows": metadata.get("total_rows"),
            "total_columns": metadata.get("total_columns"),
        }

        columns_info = metadata.get("columns") or {}
        if isinstance(columns_info, dict):
            summary["sample_columns"] = list(columns_info.keys())[:8]
        elif isinstance(columns_info, list):
            summary["sample_columns"] = columns_info[:8]

        if highlight_columns:
            summary["highlighted_columns"] = highlight_columns[:8]

        if metadata.get("numeric_columns"):
            summary["numeric_columns"] = metadata["numeric_columns"][:8]
        if metadata.get("categorical_columns"):
            summary["categorical_columns"] = metadata["categorical_columns"][:8]

        # Process columns: unique values for categorical/string, stats for numeric
        columns_info = metadata.get("columns") or {}
        if not isinstance(columns_info, dict):
            columns_info = {}

        # Get all columns (prioritize highlighted columns, then all columns)
        columns_to_process = highlight_columns[:10] if highlight_columns else list(columns_info.keys())[:10]

        categorical_values: Dict[str, List[Any]] = {}
        value_samples: Dict[str, Dict[str, Any]] = {}
        condensed_stats: Dict[str, Dict[str, Any]] = {}

        stats = metadata.get("statistical_summary") or {}

        for col_name in columns_to_process:
            col_info = columns_info.get(col_name, {})
            if not isinstance(col_info, dict):
                continue

            data_type = col_info.get("data_type", "").lower()

            # Check if numeric (int, float, numeric types)
            is_numeric = any(numeric_type in data_type for numeric_type in ["int", "float", "number", "numeric"])

            if is_numeric:
                # For numeric columns: include statistical summary
                stat_key = self._match_key_case_insensitive(stats, col_name)
                if stat_key and stat_key in stats:
                    col_stats = stats.get(stat_key)
                    if isinstance(col_stats, dict):
                        condensed_stats[col_name] = {
                            key: col_stats[key]
                            for key in ("count", "mean", "std", "min", "max", "median")
                            if key in col_stats
                        }
            else:
                # For categorical/object/string columns: include unique values
                unique_vals = col_info.get("unique_values", [])
                if unique_vals:
                    # Limit to reasonable number of unique values (max 50)
                    sanitized_values = [str(val) for val in unique_vals[:50]]
                    categorical_values[col_name] = sanitized_values
                    value_samples[col_name] = {
                        "examples": sanitized_values[:10],
                        "total_unique": len(unique_vals) if isinstance(unique_vals, list) else len(sanitized_values),
                        "note": "Sample values only. Do NOT treat these as column names.",
                    }
                    # If truncated, indicate it
                    if isinstance(unique_vals, list) and len(unique_vals) > 50:
                        categorical_values[col_name].append(f"... (and {len(unique_vals) - 50} more unique values)")

        # Add to summary
        if condensed_stats:
            summary["statistical_summary"] = condensed_stats

        if categorical_values:
            summary["unique_values"] = categorical_values
            summary["value_samples"] = value_samples
            summary["value_sample_note"] = (
                "Sample values are provided for context only. Treat only column names listed in 'sample_columns', "
                "'highlighted_columns', 'numeric_columns', or 'categorical_columns' as valid columns."
            )

        return summary

    def _pick_object_path(self, display_name: str) -> str:
        paths = self._display_to_object.get(display_name)
        if not paths:
            return display_name

        for path in paths:
            if path != display_name:
                return path
        return next(iter(paths))

    @staticmethod
    def _match_key_case_insensitive(source: Dict[str, Any], target: str) -> Optional[str]:
        if target in source:
            return target

        target_lower = target.lower()
        for key in source.keys():
            if key.lower() == target_lower:
                return key
        return None

