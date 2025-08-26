"""
app/scenario/data_service.py
---------------------------
• Async Mongo fetch of selected models
• Load D0 (any file type) via FileLoader
• Cache per-cluster slices (full identifier combos)
• Detect identifier *values* with no models, cache their 1-dim slices
• Upload every cached slice to MinIO (audit / re-use)
"""

import pickle, json, hashlib, logging
from io import BytesIO
from typing import List, Dict, Tuple, Optional

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
    cache.set(key, pickle.dumps(obj), ex=ttl)

def _redis_get(key: str):
    blob = cache.get(key)
    return pickle.loads(blob) if blob else None

# ─────────────────────────────────────────────────────────────────────────── #
# Utility                                                                     #
# ─────────────────────────────────────────────────────────────────────────── #
def _hash_str(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()

def _cluster_hash(identifiers: Dict) -> str:
    return _hash_str(json.dumps(identifiers, sort_keys=True))

# ─────────────────────────────────────────────────────────────────────────── #
# Main service                                                                #
# ─────────────────────────────────────────────────────────────────────────── #
class DataService:
    """Central store / cache manager."""

    MODELS_KEY = "models:selected"
    CURRENT_D0_KEY = "current_d0_dataframe"  # ✅ Current cached dataset
    CURRENT_D0_FILE_KEY = "current_d0_file_key"  # ✅ Track which file is cached

    # ----------  MODEL METADATA  (ASYNC) ------------------------------------
    @classmethod
    async def fetch_selected_models(cls) -> List[dict]:
        docs = _redis_get(cls.MODELS_KEY)
        if docs is not None:
            logger.info("Loaded %d selected models from Redis", len(docs))
            return docs

        cursor = select_models_collection.find({"selected": True}, {"_id": 0})
        docs = await cursor.to_list(length=None)
        _redis_set(cls.MODELS_KEY, docs)
        logger.info("Fetched %d selected models from Mongo and cached", len(docs))
        return docs

    # ----------  FULL D0 DATAFRAME  ----------------------------------------
    @classmethod
    def get_d0_dataframe(cls, d0_key: str) -> pd.DataFrame:
        """Load specific D0 file (with individual file caching)"""
        rkey = f"d0:{d0_key}"
        df = _redis_get(rkey)
        if df is not None:
            logger.info("Loaded D0 '%s' (%d rows) from Redis", d0_key, len(df))
            return df

        df = FileLoader.load_minio_object(minio_client, MINIO_BUCKET, d0_key)
        _redis_set(rkey, df)
        logger.info("Cached D0 '%s' (%d rows) in Redis", d0_key, len(df))
        return df

    # ✅ NEW: Current dataset management for "cache once, use multiple times"
    @classmethod
    def set_current_d0_dataframe(cls, d0_key: str, df: pd.DataFrame) -> None:
        """Set the current active dataset for scenario processing"""
        _redis_set(cls.CURRENT_D0_KEY, df)
        _redis_set(cls.CURRENT_D0_FILE_KEY, d0_key)
        logger.info("Set current D0 dataset: '%s' (%d rows)", d0_key, len(df))

    @classmethod
    def get_current_d0_dataframe(cls) -> Optional[pd.DataFrame]:
        """Get the currently cached dataset (no file key needed)"""
        df = _redis_get(cls.CURRENT_D0_KEY)
        if df is not None:
            current_file = _redis_get(cls.CURRENT_D0_FILE_KEY)
            logger.info("Using current cached dataset: '%s' (%d rows)", current_file, len(df))
        return df

    @classmethod
    def get_current_d0_file_key(cls) -> Optional[str]:
        """Get the file key of currently cached dataset"""
        return _redis_get(cls.CURRENT_D0_FILE_KEY)

    @classmethod
    def clear_current_d0_cache(cls) -> None:
        """Clear the current dataset cache"""
        cache.delete(cls.CURRENT_D0_KEY)
        cache.delete(cls.CURRENT_D0_FILE_KEY)
        logger.info("Cleared current D0 dataset cache")

    # ----------  IDENTIFIER-VALUE SLICES  ----------------------------------
    @classmethod
    def _cache_identifier_slice(
        cls, d0_key: str, col: str, value, df_full: pd.DataFrame
    ) -> None:
        """Cache and upload the 1-dim slice where df_full[col] == value."""
        mask = df_full[col] == value
        if not mask.any():
            return

        df_slice = df_full.loc[mask].copy()
        slice_key = f"d0:{d0_key}:ident:{col}:{_hash_str(str(value))}"
        
        if not cache.exists(slice_key):
            _redis_set(slice_key, df_slice)

            # ✅ Fixed: sanitize value for filename
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
    def build_and_cache_cluster_slices(
        cls, d0_key: str, models: List[dict]
    ) -> Tuple[int, List[Dict], Dict[str, List]]:
        """
        Returns
        -------
        cached_cluster_cnt : int
        missing_clusters   : list[dict]  (full identifier combos w/ no data)
        missing_id_values  : dict {column: [value, …]} (values w/ no model)
        """
        df_full = cls.get_d0_dataframe(d0_key)
        
        # ✅ Set as current dataset for subsequent POST calls
        cls.set_current_d0_dataframe(d0_key, df_full)

        # 1️⃣ derive which values are covered by models (per column)
        covered_values: Dict[str, set] = {}
        for m in models:
            for col, val in m["identifiers"].items():
                covered_values.setdefault(col, set()).add(val)

        # 2️⃣ unique values in data
        missing_id_values: Dict[str, List] = {}
        for col in covered_values.keys():
            if col not in df_full.columns:
                logger.warning("Column '%s' not found in dataset", col)
                continue
                
            data_vals = set(df_full[col].unique())
            missing_vals = sorted(data_vals - covered_values[col])
            if missing_vals:
                missing_id_values[col] = missing_vals
                for val in missing_vals:
                    cls._cache_identifier_slice(d0_key, col, val, df_full)

        # 3️⃣ full-combo cluster slices (model-based, as before)
        cached_cluster_cnt = 0
        missing_clusters: List[Dict] = []

        for meta in models:
            ident = meta["identifiers"]
            chash = _cluster_hash(ident)
            rkey = f"d0:{d0_key}:cluster:{chash}"

            if cache.exists(rkey):
                cached_cluster_cnt += 1
                continue

            mask = pd.Series(True, index=df_full.index)
            for col, val in ident.items():
                if col not in df_full.columns:
                    logger.warning("Column '%s' not found in dataset for cluster %s", col, ident)
                    mask = pd.Series(False, index=df_full.index)
                    break
                mask &= (df_full[col] == val)

            df_slice = df_full.loc[mask].copy()
            if df_slice.empty:
                missing_clusters.append(ident)
                logger.warning("No rows for cluster %s", ident)
                continue

            _redis_set(rkey, df_slice)

            try:
                out_key = f"cache/{d0_key}/cluster_{chash}.parquet"
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
                logger.debug("Cached cluster %s (%d rows) → %s", chash, len(df_slice), out_key)
            except Exception as e:
                logger.error("Failed to upload cluster slice %s: %s", out_key, e)

            cached_cluster_cnt += 1

        return cached_cluster_cnt, missing_clusters, missing_id_values

    # ----------  Retrieve cached slice -------------------------------------
    @classmethod
    def get_cluster_dataframe(cls, d0_key: str, identifiers: Dict) -> pd.DataFrame:
        chash = _cluster_hash(identifiers)
        df_slice = _redis_get(f"d0:{d0_key}:cluster:{chash}")
        if df_slice is None:
            raise KeyError(f"Cluster slice not cached for identifiers: {identifiers}")
        return df_slice

    # ----------  SMART CACHE MANAGEMENT  ---------------------------------
    @classmethod
    async def is_cache_fresh(cls, d0_key: str, max_age_hours: int = 24) -> bool:
        """Check if cached data is still fresh (within max_age_hours)"""
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        
        if not metadata:
            return False
            
        cache_time = metadata.get("cached_at")
        if not cache_time:
            return False
            
        # Check if cache is within max_age_hours
        from datetime import datetime, timedelta
        cache_datetime = datetime.fromisoformat(cache_time)
        max_age = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        return cache_datetime > max_age

    @classmethod
    async def has_data_changed(cls, d0_key: str) -> bool:
        """Check if source data has changed since last cache"""
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        
        if not metadata:
            return True
            
        cached_hash = metadata.get("data_hash")
        if not cached_hash:
            return True
            
        # Get current data hash from MinIO
        try:
            obj = minio_client.stat_object(MINIO_BUCKET, d0_key)
            current_hash = f"{obj.etag}_{obj.last_modified}"
            return current_hash != cached_hash
        except Exception:
            return True  # Assume changed if we can't check

    @classmethod
    async def cache_dataset_smart(cls, d0_key: str, force_refresh: bool = False) -> dict:
        """Smart cache initialization - only refresh when needed"""
        
        # Check if we can use existing cache
        if not force_refresh and await cls.is_cache_fresh(d0_key):
            cache_age = await cls.get_cache_age(d0_key)
            return {
                "message": "Using existing cache",
                "cache_age": cache_age,
                "action": "reused"
            }
        
        # Check if data has actually changed
        if not force_refresh and not await cls.has_data_changed(d0_key):
            # Extend cache TTL since data hasn't changed
            await cls.extend_cache_ttl(d0_key)
            return {
                "message": "Cache extended - data unchanged",
                "action": "extended"
            }
        
        # Data has changed or force refresh - rebuild cache
        logger.info(f"🔄 Refreshing cache for {d0_key} - data changed or force refresh")
        
        # Clear old cache
        cls.clear_dataset_cache(d0_key)
        
        # Build new cache
        models = await cls.fetch_selected_models()
        df = cls.get_d0_dataframe(d0_key)
        cls.set_current_d0_dataframe(d0_key, df)
        
        cached_clusters, missing_clusters, missing_id_vals = (
            cls.build_and_cache_cluster_slices(d0_key, models)
        )
        
        # Store cache metadata
        await cls._store_cache_metadata(d0_key, df, models)
        
        return {
            "message": "Cache refreshed - data changed",
            "models_cached": len(models),
            "d0_rows": len(df),
            "d0_cols": len(df.columns),
            "action": "refreshed"
        }

    @classmethod
    async def get_cache_age(cls, d0_key: str) -> str:
        """Get human-readable cache age"""
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        
        if not metadata or not metadata.get("cached_at"):
            return "unknown"
            
        from datetime import datetime
        cache_time = datetime.fromisoformat(metadata["cached_at"])
        age = datetime.utcnow() - cache_time
        
        if age.days > 0:
            return f"{age.days} days"
        elif age.seconds > 3600:
            return f"{age.seconds // 3600} hours"
        else:
            return f"{age.seconds // 60} minutes"

    @classmethod
    async def extend_cache_ttl(cls, d0_key: str, hours: int = 24):
        """Extend cache TTL without refreshing data"""
        cache_key = f"cache_metadata:{d0_key}"
        metadata = _redis_get(cache_key)
        
        if metadata:
            metadata["cached_at"] = datetime.utcnow().isoformat()
            _redis_set(cache_key, metadata, ttl=hours * 3600)
            logger.info(f"Extended cache TTL for {d0_key} by {hours} hours")

    @classmethod
    def clear_dataset_cache(cls, d0_key: str):
        """Clear all cache entries for a specific dataset"""
        # Clear main dataset cache
        cache.delete(f"d0:{d0_key}")
        cache.delete(f"cache_metadata:{d0_key}")
        
        # Clear cluster caches
        pattern = f"d0:{d0_key}:cluster:*"
        keys = cache.keys(pattern)
        if keys:
            cache.delete(*keys)
            
        # Clear identifier caches
        pattern = f"d0:{d0_key}:ident:*"
        keys = cache.keys(pattern)
        if keys:
            cache.delete(*keys)
            
        logger.info(f"Cleared all cache entries for dataset: {d0_key}")

    @classmethod
    async def _store_cache_metadata(cls, d0_key: str, df: pd.DataFrame, models: List[dict]):
        """Store metadata about cached dataset"""
        try:
            # Get data hash from MinIO
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
            _redis_set(cache_key, metadata, ttl=24 * 3600)  # 24 hours TTL
            
            logger.info(f"Stored cache metadata for {d0_key}")
            
        except Exception as e:
            logger.error(f"Failed to store cache metadata: {e}")
