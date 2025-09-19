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
    column_classifier_config,
    build_collection,
)
from ..utils.file_loader import FileLoader

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────── #
# Redis helpers                                                              #
# ─────────────────────────────────────────────────────────────────────────── #
def _redis_set(key: str, obj, ttl: int = 48 * 60 * 60) -> None:  # 2 days default TTL
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
    async def fetch_selected_models(cls, model_id: str) -> List[Dict[str, Any]]:
        """
        Fetch model(s) by model_id provided by user. Process combinations with complete_model_data
        using column classifier metadata for identifier structure.
        """
        try:

            # 1) Fetch model documents by _id
            models = await cls.fetch_models_by_id(model_id)
            if not models:
                logger.warning("No models found for model_id: %s", model_id)
                return []

            # 2) Process models using column classifier metadata for identifier structure
            return await cls._process_models_with_column_classifier(models, model_id)


        except Exception as e:
            logger.error("Failed to fetch selected models: %s", str(e))
            logger.error("Traceback: ", exc_info=True)
            return []


    @classmethod
    async def fetch_models_by_id(cls, model_id: str) -> List[Dict[str, Any]]:
        """Fetch model metadata from MongoDB using the model_id. Assumes _id stored as string."""
        try:
            cursor = select_models_collection.find({"_id": model_id})
            docs = await cursor.to_list(length=None)
            return docs
        except Exception as e:
            logger.error("Failed fetch_models_by_id: %s", e, exc_info=True)
            return []

    @classmethod
    async def fetch_column_classifier_metadata(cls, model_id: str) -> Dict[str, Any]:
        """
        Fetch column classifier metadata using the model_id to get identifier structure.
        """
        try:
            cursor = column_classifier_config.find({"_id": model_id})
            docs = await cursor.to_list(length=None)
            
            if not docs:
                logger.warning("No column classifier metadata found for model_id: %s", model_id)
                return {"error": f"No column classifier metadata found for model_id: {model_id}"}
            
            column_doc = docs[0]
            result = {
                "model_id": model_id,
                "identifiers": column_doc.get("identifiers", []),
                "measures": column_doc.get("measures", []),
                "dimensions": column_doc.get("dimensions", {}),
                "client_name": column_doc.get("client_name", ""),
                "app_name": column_doc.get("app_name", ""),
                "project_name": column_doc.get("project_name", "")
            }
            return result
            
        except Exception as e:
            logger.error("Failed to fetch column classifier metadata: %s", e, exc_info=True)
            return {"error": str(e)}

    @classmethod
    async def fetch_build_metadata(cls, model_id: str) -> Dict[str, Any]:
        """
        Fetch build metadata to get combination file keys.
        """
        try:
            cursor = build_collection.find({"_id": model_id})
            docs = await cursor.to_list(length=None)
            
            if not docs:
                logger.warning("No build metadata found for model_id: %s", model_id)
                return {"combination_file_keys": []}
            
            build_doc = docs[0]
            combination_file_keys = build_doc.get("combination_file_keys", [])
            
            return build_doc
            
        except Exception as e:
            logger.error("Failed to fetch build metadata: %s", e, exc_info=True)
            return {"combination_file_keys": []}


    @classmethod
    async def _process_models_with_column_classifier(cls, models: List[Dict[str, Any]], model_id: str) -> List[Dict[str, Any]]:
        """
        Process models using column classifier metadata for identifier structure.
        Each combination contains complete_model_data with identifiers and coefficients.
        """
        try:
            # Fetch column classifier metadata to get identifier structure
            column_metadata = await cls.fetch_column_classifier_metadata(model_id)
            if "error" in column_metadata:
                logger.error("Failed to fetch column classifier metadata: %s", column_metadata["error"])
                return []
            
            identifier_fields = column_metadata.get("identifiers", [])
            if not identifier_fields:
                logger.warning("No identifier fields found in column classifier metadata")
                return []

            
            # ✅ NEW: Fetch build metadata to get combination file keys
            build_metadata = await cls.fetch_build_metadata(model_id)
            combination_file_keys = build_metadata.get("combination_file_keys", [])

            flattened_models: List[Dict[str, Any]] = []
            seen_training_ids: Set[str] = set()

            for model_doc in models:
                combinations = model_doc.get("combinations", [])
                if not combinations:
                    logger.warning("Model document missing 'combinations' or it's empty. Skipping this doc.")
                    continue


                for combination in combinations:
                    if not isinstance(combination, dict):
                        logger.warning("Combination is not a dict; skipping")
                        continue

                    # Extract data from the new format
                    combination_id = combination.get("combination_id", "")
                    complete_model_data = combination.get("complete_model_data", {})
                    
                    if not combination_id or not complete_model_data:
                        logger.warning("Combination missing combination_id or complete_model_data; skipping")
                        continue

                    # Extract identifiers from complete_model_data using column classifier metadata
                    identifiers = cls._extract_identifiers_from_complete_model_data(complete_model_data, identifier_fields)
                    
                    # Extract model coefficients (convert from string format if needed)
                    x_variables_str = complete_model_data.get("x_variables", "[]")
                    x_variables = cls._parse_x_variables(x_variables_str)
                    
                    # Build coefficients dict from complete_model_data
                    coefficients = cls._build_coefficients_from_complete_model_data(complete_model_data, x_variables)
                    
                    if not coefficients:
                        logger.warning("No coefficients found for combination %s; skipping", combination_id)
                        continue

                    # Extract other model data
                    y_variable = complete_model_data.get("y_variable", "")
                    intercept = complete_model_data.get("intercept", 0)
                    model_name = complete_model_data.get("model_name", "Unknown Model")
                    
                    # ✅ NEW: Match combination_id with build metadata to get correct file_key
                    file_key = ""
                    for combo_file_info in combination_file_keys:
                        if combo_file_info.get("combination") == combination_id:
                            file_key = combo_file_info.get("file_key", "")
                            break
                    
                    if not file_key:
                        logger.warning("🔍 DEBUG: No file_key found for combination '%s' in build metadata", combination_id)
                    
                    # Generate training_id
                    training_id = f"{combination_id}_{model_name}_{_hash_str(combination_id)}"
                    if training_id in seen_training_ids:
                        training_id = f"{training_id}_{uuid.uuid4()}"
                    seen_training_ids.add(training_id)

                    flattened = {
                        "training_id": training_id,
                        "combination": combination_id,
                        "identifiers": identifiers,
                        "model_type": model_name,
                        "coefficients": coefficients,
                        "intercept": intercept,
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
                        "updated_at": model_doc.get("updated_at", ""),
                        # Additional fields from new format
                        "mape_train": complete_model_data.get("mape_train"),
                        "mape_test": complete_model_data.get("mape_test"),
                        "r2_train": complete_model_data.get("r2_train"),
                        "r2_test": complete_model_data.get("r2_test"),
                        "aic": complete_model_data.get("aic"),
                        "bic": complete_model_data.get("bic"),
                        "n_parameters": complete_model_data.get("n_parameters"),
                        "price_elasticity": complete_model_data.get("price_elasticity"),
                        "run_id": complete_model_data.get("run_id"),
                        "timestamp": complete_model_data.get("timestamp"),
                        "tags": combination.get("tags", [])
                    }

                    flattened_models.append(flattened)

            _redis_set(cls.MODELS_KEY, flattened_models)
            return flattened_models

        except Exception as e:
            logger.error("Failed to fetch selected models: %s", str(e))
            logger.error("Traceback: ", exc_info=True)
            return []

    @classmethod
    def _extract_identifiers_from_complete_model_data(cls, complete_model_data: Dict[str, Any], identifier_fields: List[str] = None) -> Dict[str, str]:
        """Extract identifiers from complete_model_data section using dynamic identifier fields."""
        identifiers = {}
        
        # Use provided identifier fields or fallback to common ones
        if not identifier_fields:
            identifier_fields = ["Channel", "Market", "PPG", "Brand", "Category", "Region", "Country"]
            logger.warning("No identifier fields provided, using fallback list: %s", identifier_fields)
        
        for field in identifier_fields:
            # Try both original case and capitalized case
            field_variations = [field, field.capitalize(), field.upper(), field.lower()]
            
            for field_var in field_variations:
                if field_var in complete_model_data:
                    value = complete_model_data[field_var]
                    if value is not None and str(value).strip():
                        # Use the original field name for consistency
                        identifiers[field] = str(value).strip()
                        break
        
        return identifiers

    @classmethod
    def _parse_x_variables(cls, x_variables_str: str) -> List[str]:
        """Parse x_variables from string format like "['SalesValue' 'VolumeUnits' 'D1' 'Week']" or "['Year', 'Month', 'Week', 'SalesValue']"."""
        try:
            if not x_variables_str or x_variables_str == "[]":
                return []
            
            # Remove brackets
            cleaned = x_variables_str.strip("[]")
            if not cleaned:
                return []
            
            variables = []
            
            # Check if the string contains commas (new format)
            if ',' in cleaned:
                # Handle format with commas: "['Year', 'Month', 'Week', 'SalesValue', 'VolumeUnits', 'D1']"
                # Split by commas and clean up quotes and spaces
                for var in cleaned.split(','):
                    var = var.strip().strip("'\"")
                    if var:
                        variables.append(var)
            else:
                # Handle format without commas: "['SalesValue' 'VolumeUnits' 'D1' 'Week']"
                # Split by spaces and clean up quotes
                for var in cleaned.split():
                    var = var.strip("'\"")
                    if var:
                        variables.append(var)
            
            logger.info("✅ Parsed x_variables: %s -> %s", x_variables_str, variables)
            return variables
        except Exception as e:
            logger.warning("Failed to parse x_variables '%s': %s", x_variables_str, e)
            return []

    @classmethod
    def _build_coefficients_from_complete_model_data(cls, complete_model_data: Dict[str, Any], x_variables: List[str]) -> Dict[str, float]:
        """Build coefficients dict from complete_model_data by looking for coefficient patterns."""
        coefficients = {}
        
        # Look for coefficient patterns like "SalesValue_avg", "VolumeUnits_avg", etc.
        for var in x_variables:
            # Try different coefficient naming patterns
            coeff_key = f"{var}_beta"
            if coeff_key in complete_model_data:
                value = complete_model_data[coeff_key]
                if isinstance(value, (int, float)):
                    coefficients[f"Beta_{var}"] = float(value)
                else:
                    logger.warning("Coefficient %s is not numeric: %s", coeff_key, value)
        
        # If no coefficients found with _avg pattern, try other patterns
        if not coefficients:
            for var in x_variables:
                # Try direct variable name
                if var in complete_model_data:
                    value = complete_model_data[var]
                    if isinstance(value, (int, float)):
                        coefficients[f"Beta_{var}"] = float(value)
        
        return coefficients


    # ----------  FULL D0 DATAFRAME  ----------------------------------------
    @classmethod
    def get_d0_dataframe(cls, d0_key: str) -> pd.DataFrame:
        rkey = f"d0:{d0_key}"
        df = _redis_get(rkey)
        if df is not None:
            return df

        df = FileLoader.load_minio_object(minio_client, MINIO_BUCKET, d0_key)
        _redis_set(rkey, df)
        return df

    @classmethod
    def set_current_d0_dataframe(cls, d0_key: str, df: pd.DataFrame) -> None:
        _redis_set(cls.CURRENT_D0_KEY, df)
        _redis_set(cls.CURRENT_D0_FILE_KEY, d0_key)

    @classmethod
    def get_current_d0_dataframe(cls) -> Optional[pd.DataFrame]:
        df = _redis_get(cls.CURRENT_D0_KEY)
        if df is not None:
            current_file = _redis_get(cls.CURRENT_D0_FILE_KEY)
        return df

    @classmethod
    def get_current_d0_file_key(cls) -> Optional[str]:
        return _redis_get(cls.CURRENT_D0_FILE_KEY)

    @classmethod
    def clear_current_d0_cache(cls) -> None:
        cache.delete(cls.CURRENT_D0_KEY)
        cache.delete(cls.CURRENT_D0_FILE_KEY)

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
    async def cache_dataset_smart(cls, d0_key: str, model_id: str, force_refresh: bool = False) -> dict:
        if not force_refresh and await cls.is_cache_fresh(d0_key):
            cache_age = await cls.get_cache_age(d0_key)
            return {"message": "Using existing cache", "cache_age": cache_age, "action": "reused"}

        if not force_refresh and not await cls.has_data_changed(d0_key):
            await cls.extend_cache_ttl(d0_key)
            return {"message": "Cache extended - data unchanged", "action": "extended"}

        cls.clear_dataset_cache(d0_key)

        models = await cls.fetch_selected_models(model_id)
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
            _redis_set(cache_key, metadata, ttl=48 * 3600)  # 2 days TTL
            logger.info("Stored cache metadata for %s", d0_key)
        except Exception as e:
            logger.error("Failed to store cache metadata: %s", e, exc_info=True)
