# app/scenario/data_service1.py
"""
DataService: Fetch model metadata using specific _id, handle the nested model structure,
prepare for scenario planning, cache D0 datasets and cluster/identifier slices.
"""

import json
import hashlib
import logging
import pickle
import uuid
from io import BytesIO
from typing import List, Dict, Tuple, Optional, Any, Set
from datetime import datetime, timedelta

import pandas as pd

from ..config import (
    cache,
    minio_client,
    MINIO_BUCKET,
    MINIO_OUTPUT_BUCKET,
    select_models_collection,
)
from ..utils.file_loader import FileLoader

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────── #
# Redis helpers                                                              #
# ─────────────────────────────────────────────────────────────────────────── #
def _redis_set(key: str, obj, ttl: int = 60 * 60) -> None:
    try:
        cache.set(key, pickle.dumps(obj), ex=ttl)
    except Exception:
        # fallback: try storing as JSON if pickle fails
        try:
            cache.set(key, json.dumps(obj, default=str), ex=ttl)
        except Exception as e:
            logger.error("Failed to _redis_set key=%s: %s", key, e)


def _redis_get(key: str):
    try:
        blob = cache.get(key)
        if not blob:
            return None
        # try pickle first
        try:
            return pickle.loads(blob)
        except Exception:
            # if not pickled (maybe JSON), try decode
            try:
                return json.loads(blob)
            except Exception:
                # fallback to raw blob
                return blob
    except Exception as e:
        logger.warning("Redis get failed for key=%s: %s", key, e)
        return None


# ─────────────────────────────────────────────────────────────────────────── #
# Utilities                                                                  #
# ─────────────────────────────────────────────────────────────────────────── #
def _hash_str(s: str, algo: str = "sha256") -> str:
    """Hash a string deterministically. Default: sha256 for fewer collisions."""
    b = s.encode("utf-8")
    if algo == "sha256":
        return hashlib.sha256(b).hexdigest()
    return hashlib.md5(b).hexdigest()


def _canonical_json_for_obj(obj: Any) -> str:
    """Return canonical JSON string for basic dict-like objects (safe for hashing)."""
    def _safe(o):
        if isinstance(o, (int, float, str, bool)) or o is None:
            return o
        if isinstance(o, (list, tuple)):
            return [_safe(x) for x in o]
        if isinstance(o, dict):
            return {str(k): _safe(v) for k, v in o.items()}
        return str(o)
    return json.dumps(_safe(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _cluster_hash(identifiers: Dict) -> str:
    canonical = _canonical_json_for_obj(identifiers)
    return _hash_str(canonical, algo="sha256")


# ─────────────────────────────────────────────────────────────────────────── #
# Main service                                                                #
# ─────────────────────────────────────────────────────────────────────────── #
class DataService:
    """Central store / cache manager for scenario planning."""

    MODELS_KEY = "models:selected"
    CURRENT_D0_KEY = "current_d0_dataframe"
    CURRENT_D0_FILE_KEY = "current_d0_file_key"

    # ----------  MODEL METADATA  (ASYNC) ------------------------------------
    @classmethod
    async def fetch_selected_models(cls, model_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch model(s) by model_id (or cached id). Flatten nested model_coefficients into
        per-(combination, model_type) flattened_model dicts suitable for scenario planner.
        """
        try:
            logger.info("🔄 Fetching selected models in flattened structure...")

            # 1) Determine model_id (explicitly provided or cached)
            if model_id is None:
                model_id = cls.get_current_model_id()
                if not model_id:
                    model_id = 'Quant_Matrix_AI_Schema/forecasting/New Forecasting Analysis Project'
                    logger.info("No model_id provided or cached, using default: %s", model_id)
            logger.info("Using model_id: %s", model_id)

            # 2) Fetch model documents by _id
            models = await cls.fetch_models_by_id(model_id)
            if not models:
                logger.warning("No models found for model_id: %s", model_id)
                return []

            # 3) Fetch scope metadata (try by model_id; fallback by project_name)
            scope_metadata_resp = await cls.fetch_scope_metadata_by_model_id(model_id, models=models)
            if "error" in scope_metadata_resp:
                logger.error("Failed to fetch scope metadata: %s", scope_metadata_resp["error"])
                return []

            # unwrap scope document if wrapped
            scope_doc = scope_metadata_resp.get("scope_metadata", scope_metadata_resp)

            # 4) Extract identifier structure
            identifier_structure = cls._extract_identifier_structure(scope_doc)
            if not identifier_structure:
                logger.error("No identifier structure found in scope metadata")
                return []

            logger.info("Found identifier structure with keys: %s", list(identifier_structure.keys()))

            # 5) Transform models -> flattened list
            flattened_models: List[Dict[str, Any]] = []
            seen_training_ids: Set[str] = set()

            for model_doc in models:
                combos = model_doc.get("combinations", [])
                coeffs_map = model_doc.get("model_coefficients", {})

                if not combos:
                    logger.warning("Model document missing 'combinations' or it's empty. Skipping this doc.")
                    continue
                if not coeffs_map:
                    logger.warning("Model document missing 'model_coefficients' or it's empty. Skipping this doc.")
                    continue

                logger.info("Processing model_doc _id=%s with %d combinations", model_doc.get("_id"), len(combos))

                # iterate combinations (use declared combinations to preserve ordering)
                for combination in combos:
                    if combination not in coeffs_map:
                        logger.warning("Combination '%s' declared but not present in model_coefficients. Skipping.", combination)
                        continue

                    comb_models = coeffs_map[combination]
                    if not isinstance(comb_models, dict):
                        logger.warning("model_coefficients[%s] is not a dict; skipping", combination)
                        continue

                    for model_type, model_data in comb_models.items():
                        # validate shape
                        if not isinstance(model_data, dict):
                            logger.warning("Model data not a dict for %s/%s; skipping", combination, model_type)
                            continue

                        coefficients = model_data.get("coefficients", {})
                        x_variables = model_data.get("x_variables", [])
                        y_variable = model_data.get("y_variable", model_doc.get("y_variable", ""))

                        if not coefficients or not isinstance(coefficients, dict):
                            logger.warning("Empty/invalid coefficients for %s/%s; skipping", combination, model_type)
                            continue
                        if not x_variables or not isinstance(x_variables, list):
                            logger.warning("Empty/invalid x_variables for %s/%s; skipping", combination, model_type)
                            continue

                        # map combination -> identifiers (normalize & fallback)
                        mapped_identifiers = cls._map_combination_to_identifiers(combination, identifier_structure)
                        if not mapped_identifiers:
                            logger.warning("Could not map combination '%s' to identifiers; attempting fallback mapping", combination)
                            id_keys = list(identifier_structure.keys())
                            parts = combination.split('_')
                            if len(id_keys) >= 2:
                                mapped_identifiers = {
                                    id_keys[0]: parts[0] if len(parts) > 0 else "",
                                    id_keys[1]: parts[1] if len(parts) > 1 else ""
                                }
                                logger.info("Fallback mapped_identifiers=%s", mapped_identifiers)
                            else:
                                mapped_identifiers = {"part_0": parts[0] if len(parts) > 0 else "", "part_1": parts[1] if len(parts) > 1 else ""}

                        # file_key lookup
                        file_key = cls._get_file_key_for_combination(combination, model_doc.get("combination_file_keys", []))
                        if not file_key:
                            logger.warning("No file_key for combination %s (project may not have saved the filtered D0)", combination)

                        training_id = f"{combination}_{model_type}_{_hash_str(combination)}"
                        if training_id in seen_training_ids:
                            training_id = f"{training_id}_{uuid.uuid4()}"
                        seen_training_ids.add(training_id)

                        flattened = {
                            "training_id": training_id,
                            "combination": combination,
                            "identifiers": mapped_identifiers,
                            "model_type": model_type,
                            "coefficients": coefficients,
                            "intercept": model_data.get("intercept", 0),
                            "x_variables": x_variables,
                            "y_variable": y_variable,
                            "transformations": {},
                            "file_key": file_key,
                            "scope_id": model_doc.get("_id", ""),
                            "project_name": model_doc.get("project_name", ""),
                            "client_name": model_doc.get("client_name", ""),
                            "app_name": model_doc.get("app_name", ""),
                            "training_status": model_doc.get("training_status", ""),
                            "created_at": model_doc.get("created_at", ""),
                            "updated_at": model_doc.get("updated_at", "")
                        }

                        flattened_models.append(flattened)
                        logger.debug("Flattened model appended: %s", training_id)

            logger.info("✅ Successfully fetched and flattened %d models", len(flattened_models))
            _redis_set(cls.MODELS_KEY, flattened_models)
            return flattened_models

        except Exception as e:
            logger.error("Failed to fetch selected models: %s", str(e))
            logger.error("Traceback: ", exc_info=True)
            return []

    @classmethod
    def get_current_model_id(cls) -> Optional[str]:
        try:
            return _redis_get("current_model_id")
        except Exception as e:
            logger.warning("Could not get current model_id: %s", e)
            return None

    @classmethod
    def set_current_model_id(cls, model_id: str) -> None:
        try:
            _redis_set("current_model_id", model_id)
            logger.info("Set current model_id to: %s", model_id)
        except Exception as e:
            logger.error("Failed to set current model_id: %s", e)

    @classmethod
    async def fetch_models_by_id(cls, model_id: str) -> List[Dict[str, Any]]:
        """Fetch model metadata from MongoDB using the model_id. Assumes _id stored as string."""
        try:
            logger.info("🔍 DEBUG: Searching select_models_collection for _id=%s", model_id)
            cursor = select_models_collection.find({"_id": model_id})
            docs = await cursor.to_list(length=None)
            logger.info("🔍 DEBUG: Found %d model docs for _id=%s", len(docs), model_id)
            return docs
        except Exception as e:
            logger.error("Failed fetch_models_by_id: %s", e, exc_info=True)
            return []

    @classmethod
    async def fetch_scope_metadata_by_model_id(cls, model_id: str, models: List[dict] = None) -> Dict[str, Any]:
        """
        Fetch scope metadata. First try _id == model_id; if not found, fallback to project_name
        using the first model doc if available.
        """
        try:
            from ..config import scope_collection
            logger.info("🔍 DEBUG: Searching scope_collection for _id=%s", model_id)
            cursor = scope_collection.find({"_id": model_id})
            scope_docs = await cursor.to_list(length=None)

            if not scope_docs and models:
                project_name = models[0].get("project_name")
                if project_name:
                    logger.info("🔍 DEBUG: fallback: searching scope_collection for project_name=%s", project_name)
                    cursor2 = scope_collection.find({"project_name": project_name})
                    scope_docs = await cursor2.to_list(length=None)

            if not scope_docs:
                logger.warning("No scope metadata found for model_id/project_name: %s", model_id)
                return {"error": f"No scope metadata found for model_id: {model_id}"}

            scope_doc = scope_docs[0]
            result = {
                "model_id": model_id,
                "scope_metadata": scope_doc,
                "has_filter_set_results": "filter_set_results" in scope_doc,
                "filter_set_count": len(scope_doc.get("filter_set_results", [])),
                "available_keys": list(scope_doc.keys())
            }
            if "filter_set_results" in scope_doc:
                filter_sets = scope_doc["filter_set_results"]
                result["filter_set_results"] = filter_sets
                identifiers_by_set = {}
                for fs in filter_sets:
                    if "identifier_filters" in fs:
                        identifiers_by_set[fs.get("set_name", "unknown")] = fs["identifier_filters"]
                result["identifiers_by_set"] = identifiers_by_set

            return result
        except Exception as e:
            logger.error("Failed to fetch scope metadata: %s", e, exc_info=True)
            return {"error": str(e)}

    @classmethod
    def _extract_identifier_structure(cls, scope_metadata: Dict[str, Any]) -> Dict[str, List[str]]:
        """
        Extract identifier structure (identifier_name -> list_of_allowed_values)
        from the scope document or wrapper.
        """
        identifier_structure: Dict[str, List[str]] = {}
        actual_scope = scope_metadata.get("scope_metadata", scope_metadata)

        if "filter_set_results" in actual_scope:
            for filter_set in actual_scope["filter_set_results"]:
                if "identifier_filters" in filter_set and isinstance(filter_set["identifier_filters"], dict):
                    identifier_structure.update(filter_set["identifier_filters"])
                else:
                    logger.debug("Filter set missing identifier_filters or invalid format: %s", filter_set.get("set_name"))
        else:
            if "identifier_structure" in actual_scope:
                identifier_structure = actual_scope["identifier_structure"]
            elif "identifiers" in actual_scope:
                identifier_structure = actual_scope["identifiers"]

        for k, v in list(identifier_structure.items()):
            if not isinstance(v, list):
                identifier_structure[k] = [v] if v is not None else []

        logger.debug("Extracted identifier_structure keys=%s", list(identifier_structure.keys()))
        return identifier_structure

    @classmethod
    def _map_combination_to_identifiers(cls, combination: str, identifier_structure: Dict[str, List[str]]) -> Dict[str, str]:
        """
        Map a combination string (e.g., 'Category_India') to identifier_name -> value.
        This implementation normalizes case & whitespace and tries to match parts to allowed values.
        """
        try:
            if not isinstance(combination, str):
                return {}

            parts = combination.split('__') if '__' in combination else combination.split('_')
            parts = [p.strip() for p in parts if p.strip()]
            if not parts:
                return {}

            reverse = {}
            for ident_name, allowed in identifier_structure.items():
                for val in allowed:
                    if val is None:
                        continue
                    reverse[str(val).strip().lower()] = ident_name

            mapped: Dict[str, str] = {}
            for p in parts:
                key = p.strip().lower()
                if key in reverse and reverse[key] not in mapped:
                    mapped[reverse[key]] = p  # preserve original casing

            if len(mapped) < len(parts):
                for p in parts:
                    key = p.strip().lower()
                    for allowed_norm, ident_name in reverse.items():
                        if ident_name in mapped:
                            continue
                        if allowed_norm.startswith(key) or key in allowed_norm:
                            mapped[ident_name] = next(
                                (av for av in identifier_structure[ident_name] if str(av).strip().lower() == allowed_norm),
                                p
                            )

            if not mapped:
                id_keys = list(identifier_structure.keys())
                for i, p in enumerate(parts):
                    if i < len(id_keys):
                        mapped[id_keys[i]] = p

            return mapped
        except Exception as e:
            logger.error("Error mapping combination '%s' to identifiers: %s", combination, e, exc_info=True)
            return {}

    @classmethod
    def _get_file_key_for_combination(cls, combination: str, combination_file_keys: List[Dict]) -> str:
        for cfk in combination_file_keys:
            if cfk.get("combination") == combination:
                return cfk.get("file_key", "")
        return ""

    # ----------  FULL D0 DATAFRAME  ----------------------------------------
    @classmethod
    def get_d0_dataframe(cls, d0_key: str) -> pd.DataFrame:
        rkey = f"d0:{d0_key}"
        df = _redis_get(rkey)
        if df is not None:
            logger.info("Loaded D0 '%s' (%d rows) from Redis", d0_key, len(df))
            return df

        df = FileLoader.load_minio_object(minio_client, MINIO_BUCKET, d0_key)
        _redis_set(rkey, df)
        logger.info("Cached D0 '%s' (%d rows) in Redis", d0_key, len(df))
        return df

    @classmethod
    def set_current_d0_dataframe(cls, d0_key: str, df: pd.DataFrame) -> None:
        _redis_set(cls.CURRENT_D0_KEY, df)
        _redis_set(cls.CURRENT_D0_FILE_KEY, d0_key)
        logger.info("Set current D0 dataset: '%s' (%d rows)", d0_key, len(df))

    @classmethod
    def get_current_d0_dataframe(cls) -> Optional[pd.DataFrame]:
        df = _redis_get(cls.CURRENT_D0_KEY)
        if df is not None:
            current_file = _redis_get(cls.CURRENT_D0_FILE_KEY)
            logger.info("Using current cached dataset: '%s' (%d rows)", current_file, len(df))
        return df

    @classmethod
    def get_current_d0_file_key(cls) -> Optional[str]:
        return _redis_get(cls.CURRENT_D0_FILE_KEY)

    @classmethod
    def clear_current_d0_cache(cls) -> None:
        cache.delete(cls.CURRENT_D0_KEY)
        cache.delete(cls.CURRENT_D0_FILE_KEY)
        logger.info("Cleared current D0 dataset cache")

    # ----------  IDENTIFIER-VALUE SLICES  ----------------------------------
    @classmethod
    def _cache_identifier_slice(cls, d0_key: str, col: str, value, df_full: pd.DataFrame) -> None:
        """Cache and upload the 1-dim slice where df_full[col] == value (normalizing strings)."""
        if col not in df_full.columns:
            return

        series = df_full[col].astype(str).str.strip().str.lower()
        target = str(value).strip().lower()
        mask = series == target
        if not mask.any():
            return

        df_slice = df_full.loc[mask].copy()
        slice_key = f"d0:{d0_key}:ident:{col}:{_hash_str(str(value))}"

        if not cache.exists(slice_key):
            _redis_set(slice_key, df_slice)
            safe_value = str(value).replace('/', '_').replace(' ', '_')
            out_key = f"cache/{d0_key}/ident_{col}_{safe_value}.parquet"
            try:
                buf = BytesIO()
                df_slice.to_parquet(buf, index=False)
                buf.seek(0)
                minio_client.put_object(
                    MINIO_OUTPUT_BUCKET,
                    out_key,
                    data=buf,
                    length=buf.getbuffer().nbytes,
                    content_type="application/octet-stream",
                )
                logger.debug("Uploaded identifier slice: %s", out_key)
            except Exception as e:
                logger.error("Failed to upload identifier slice %s: %s", out_key, e)

    # ----------  CLUSTER & IDENTIFIER BUILD  ------------------------------
    @classmethod
    def build_and_cache_cluster_slices(cls, d0_key: str, models: List[dict]) -> Tuple[int, List[Dict], Dict[str, List]]:
        """
        Build and cache cluster slices by comparing model 'identifiers' to the D0 dataset.

        Missing clusters = unique identifier combinations in D0 for which NO model exists
        that matches those identifier values.

        Matching rule:
          - A model matches a D0 row if ALL key/value pairs in model['identifiers']
            match the row's values (normalized).
          - This allows models that are defined on a subset of identifiers.

        Returns:
            cached_cluster_cnt: number of missing-cluster slices cached
            missing_clusters: list of dicts { "identifiers": {...}, "reason": "no_matching_model", "rows": int, ... }
            missing_id_values: dict { column: [value, ...] } values present in D0 but not covered by any model for that column
        """
        df_full = cls.get_d0_dataframe(d0_key)
        cls.set_current_d0_dataframe(d0_key, df_full)

        def norm_str(v) -> str:
            return "" if v is None else str(v).strip()

        # 1) collect identifier columns referenced by any model
        all_ident_cols: Set[str] = set()
        model_ident_list: List[Dict[str, str]] = []
        for m in models:
            ids = m.get("identifiers", {}) or {}
            norm_ids = {str(k).strip(): norm_str(v).lower() for k, v in ids.items() if v is not None}
            model_ident_list.append(norm_ids)
            for k in ids.keys():
                all_ident_cols.add(str(k).strip())

        # Filter identifier columns to those actually present in df_full
        ident_cols = [c for c in list(all_ident_cols) if c in df_full.columns]
        if not ident_cols:
            logger.warning("No identifier columns from models found in D0 columns. Nothing to build.")
            return 0, [], {}

        logger.info("Identifier columns used for cluster check: %s", ident_cols)

        # 2) compute values covered by models per column (normalized)
        covered_values: Dict[str, Set[str]] = {col: set() for col in ident_cols}
        for mid in model_ident_list:
            for col, val in mid.items():
                if col in covered_values:
                    covered_values[col].add(val)

        # 3) compute missing_id_values: values present in D0 but not covered by models
        missing_id_values: Dict[str, List] = {}
        for col in ident_cols:
            data_vals = set(df_full[col].dropna().astype(str).str.strip().str.lower().unique().tolist())
            uncovered = sorted(list(data_vals - covered_values.get(col, set())))
            if uncovered:
                missing_id_values[col] = uncovered
                for val in uncovered:
                    try:
                        cls._cache_identifier_slice(d0_key, col, val, df_full)
                    except Exception as e:
                        logger.debug("Failed to cache identifier slice for %s=%s: %s", col, val, e)

        # 4) build unique identifier tuples from D0 (for the ident_cols)
        df_id = df_full[ident_cols].fillna("").astype(str).applymap(lambda x: x.strip())
        df_unique = df_id.drop_duplicates().reset_index(drop=True)

        missing_clusters: List[Dict] = []
        cached_cluster_cnt = 0

        for _, row in df_unique.iterrows():
            row_map = {col: row[col].strip() for col in ident_cols}
            row_norm = {col: row_map[col].lower() for col in ident_cols}

            # Check if any model matches this row (model matches if ALL its id keys match row)
            match_found = False
            for mid in model_ident_list:
                if not mid:
                    continue
                ok = True
                for mk, mv in mid.items():
                    if mk not in row_norm or row_norm[mk] != (mv or "").lower():
                        ok = False
                        break
                if ok:
                    match_found = True
                    break

            if match_found:
                continue  # covered by an existing model

            # No model matched -> this is a missing cluster
            missing_entry = {
                "identifiers": {col: row_map[col] for col in ident_cols},
                "reason": "no_matching_model"
            }

            # Cache the slice for this missing cluster (filter D0)
            try:
                mask = pd.Series(True, index=df_full.index)
                for col in ident_cols:
                    mask &= (df_full[col].astype(str).str.strip().str.lower() == row_norm[col])

                df_slice = df_full.loc[mask].copy()
                if df_slice is None or getattr(df_slice, "empty", False):
                    missing_entry["reason"] = "no_rows_after_mask"
                    missing_entry["rows"] = 0
                    logger.warning("Derived unique row but mask produced 0 rows for identifiers: %s", missing_entry["identifiers"])
                else:
                    chash = _cluster_hash(missing_entry["identifiers"])
                    rkey = f"d0:{d0_key}:cluster:{chash}"
                    _redis_set(rkey, df_slice)
                    cached_cluster_cnt += 1
                    missing_entry["rows"] = len(df_slice)

                    # Optional: upload snapshot to MinIO (non-fatal)
                    try:
                        out_key = f"cache/{d0_key}/missing_cluster_{chash}.parquet"
                        buf = BytesIO()
                        df_slice.to_parquet(buf, index=False)
                        buf.seek(0)
                        minio_client.put_object(
                            MINIO_OUTPUT_BUCKET,
                            out_key,
                            data=buf,
                            length=buf.getbuffer().nbytes,
                            content_type="application/octet-stream",
                        )
                        missing_entry["minio_snapshot"] = out_key
                    except Exception as e:
                        logger.debug("Failed to upload missing cluster snapshot for %s: %s", chash, e)

            except Exception as e:
                missing_entry["reason"] = "exception_caching_slice"
                missing_entry["error"] = repr(e)
                logger.error("Error while caching missing cluster slice for %s: %s", missing_entry["identifiers"], e, exc_info=True)

            missing_clusters.append(missing_entry)

        logger.info("Cluster check complete. cached missing slices: %d, missing clusters: %d", cached_cluster_cnt, len(missing_clusters))
        return cached_cluster_cnt, missing_clusters, missing_id_values

    # ----------  Retrieve cached slice -------------------------------------
    @classmethod
    def get_cluster_dataframe(cls, d0_key: str, identifiers: Dict, combination: str = None) -> pd.DataFrame:
        """
        Get cluster dataframe.
        - If 'combination' is provided, attempt to load via combination file_key (for existing model combos).
        - Else, load the cached cluster slice by identifiers (for missing clusters or legacy flow).
        """
        if combination:
            return cls.get_combination_dataframe(combination)
        chash = _cluster_hash(identifiers)
        df_slice = _redis_get(f"d0:{d0_key}:cluster:{chash}")
        if df_slice is None:
            raise KeyError(f"Cluster slice not cached for identifiers: {identifiers}")
        return df_slice

    @classmethod
    def get_combination_dataframe(cls, combination: str) -> pd.DataFrame:
        """
        Load pre-filtered data for a specific combination using its file key (for combos that have models).
        """
        models = _redis_get(cls.MODELS_KEY)
        if not models:
            raise KeyError("No cached models found. Please call fetch_selected_models first.")
        combo_model = next((m for m in models if m.get("combination") == combination and m.get("file_key")), None)
        if not combo_model:
            raise KeyError(f"No model with file_key found for combination: {combination}")
        return cls.get_d0_dataframe(combo_model["file_key"])

    # ----------  SMART CACHE MANAGEMENT  ---------------------------------
    @classmethod
    async def is_cache_fresh(cls, d0_key: str, max_age_hours: int = 24) -> bool:
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        if not metadata:
            return False
        cache_time = metadata.get("cached_at")
        if not cache_time:
            return False
        try:
            cache_datetime = datetime.fromisoformat(cache_time)
        except Exception:
            return False
        max_age = datetime.utcnow() - timedelta(hours=max_age_hours)
        return cache_datetime > max_age

    @classmethod
    async def has_data_changed(cls, d0_key: str) -> bool:
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        if not metadata:
            return True
        cached_hash = metadata.get("data_hash")
        if not cached_hash:
            return True
        try:
            obj = minio_client.stat_object(MINIO_BUCKET, d0_key)
            current_hash = f"{obj.etag}_{obj.last_modified}"
            return current_hash != cached_hash
        except Exception:
            return True

    @classmethod
    async def cache_dataset_smart(cls, d0_key: str, force_refresh: bool = False) -> dict:
        if not force_refresh and await cls.is_cache_fresh(d0_key):
            cache_age = await cls.get_cache_age(d0_key)
            return {"message": "Using existing cache", "cache_age": cache_age, "action": "reused"}

        if not force_refresh and not await cls.has_data_changed(d0_key):
            await cls.extend_cache_ttl(d0_key)
            return {"message": "Cache extended - data unchanged", "action": "extended"}

        logger.info("🔄 Refreshing cache for %s - data changed or force", d0_key)
        cls.clear_dataset_cache(d0_key)

        models = await cls.fetch_selected_models()
        df = cls.get_d0_dataframe(d0_key)
        cls.set_current_d0_dataframe(d0_key, df)

        cached_clusters, missing_clusters, missing_id_vals = cls.build_and_cache_cluster_slices(d0_key, models)

        await cls._store_cache_metadata(d0_key, df, models)

        return {
            "message": "Cache refreshed - data changed",
            "models_cached": len(models),
            "d0_rows": len(df),
            "d0_cols": len(df.columns),
            "missing_clusters": len(missing_clusters),
            "action": "refreshed"
        }

    @classmethod
    async def get_cache_age(cls, d0_key: str) -> str:
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        if not metadata or not metadata.get("cached_at"):
            return "unknown"
        try:
            cache_time = datetime.fromisoformat(metadata["cached_at"])
        except Exception:
            return "unknown"
        age = datetime.utcnow() - cache_time
        if age.days > 0:
            return f"{age.days} days"
        elif age.seconds > 3600:
            return f"{age.seconds // 3600} hours"
        else:
            return f"{age.seconds // 60} minutes"

    @classmethod
    async def extend_cache_ttl(cls, d0_key: str, hours: int = 24):
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        if metadata:
            metadata["cached_at"] = datetime.utcnow().isoformat()
            _redis_set(cache_key, metadata, ttl=hours * 3600)
            logger.info("Extended cache TTL for %s by %s hours", d0_key, hours)

    @classmethod
    def clear_dataset_cache(cls, d0_key: str):
        cache.delete(f"d0:{d0_key}")
        cache.delete(f"cache_metadata:{d0_key}")

        pattern = f"d0:{d0_key}:cluster:*"
        keys = cache.keys(pattern)
        if keys:
            try:
                cache.delete(*keys)
            except Exception:
                try:
                    keys = [k.decode() if isinstance(k, (bytes, bytearray)) else k for k in keys]
                    cache.delete(*keys)
                except Exception as e:
                    logger.warning("Failed to delete cluster keys: %s", e)

        pattern = f"d0:{d0_key}:ident:*"
        keys = cache.keys(pattern)
        if keys:
            try:
                cache.delete(*keys)
            except Exception:
                try:
                    keys = [k.decode() if isinstance(k, (bytes, bytearray)) else k for k in keys]
                    cache.delete(*keys)
                except Exception as e:
                    logger.warning("Failed to delete ident keys: %s", e)

        logger.info("Cleared all cache entries for dataset: %s", d0_key)

    @classmethod
    async def _store_cache_metadata(cls, d0_key: str, df: pd.DataFrame, models: List[dict]):
        try:
            obj = minio_client.stat_object(MINIO_BUCKET, d0_key)
            data_hash = f"{obj.etag}_{obj.last_modified}"
            metadata = {
                "d0_key": d0_key,
                "cached_at": datetime.utcnow().isoformat(),
                "data_hash": data_hash,
                "data_size": len(df),
                "columns": list(df.columns),
                "models_count": len(models),
                "cache_version": "2.0"
            }
            cache_key = f"cache_metadata:{d0_key}"
            _redis_set(cache_key, metadata, ttl=24 * 3600)
            logger.info("Stored cache metadata for %s", d0_key)
        except Exception as e:
            logger.error("Failed to store cache metadata: %s", e, exc_info=True)
