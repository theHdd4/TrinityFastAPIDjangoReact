import io
import json
import os
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering, Birch
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from minio import Minio
from minio.error import S3Error
from fastapi import HTTPException
from .config import settings
from typing import List, Dict, Any, Literal, Optional, Union, Tuple, Iterable
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from types import SimpleNamespace

from app.DataStorageRetrieval.db import  fetch_client_app_project
from app.core.utils import get_env_vars

# Lazy-loaded MinIO client
_minio_client = None

def get_minio_client():
    """Get MinIO client, initializing if needed"""
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            settings.minio_url,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _minio_client

def parse_minio_path(file_path: str) -> tuple[str, str]:
    """Parse MinIO path into bucket and object path"""
    # Remove leading and trailing slashes
    cleaned_path = file_path.strip('/')
    if not cleaned_path:
        raise ValueError("Invalid MinIO path. Path cannot be empty or just slashes.")
    
    # Since the frontend sends directory paths (not bucket names), 
    # we'll always use the default bucket and treat the entire path as the object path
    # This handles cases like "Quant_Matrix_AI_Schema/forecasting/forecasting project 5/20250812_124940_D0.arrow"
    return settings.minio_bucket, cleaned_path

async def check_bucket_and_file(file_path: str) -> dict:
    """Check if bucket exists and file is accessible"""
    try:
        bucket_name, object_path = parse_minio_path(file_path)
        minio_client = get_minio_client()
        
        # Check if bucket exists
        if not minio_client.bucket_exists(bucket_name):
            return {
                "exists": False,
                "bucket_name": bucket_name,
                "object_path": object_path,
                "message": f"Bucket '{bucket_name}' does not exist"
            }
        
        # Check if object exists by trying to stat it
        try:
            minio_client.stat_object(bucket_name, object_path)
            return {
                "exists": True,
                "bucket_name": bucket_name,
                "object_path": object_path,
                "message": f"File found at {file_path}"
            }
        except S3Error as e:
            if e.code == "NoSuchKey":
                return {
                    "exists": False,
                    "bucket_name": bucket_name,
                    "object_path": object_path,
                    "message": f"File '{object_path}' not found in bucket '{bucket_name}'"
                }
            raise
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

async def load_csv_from_minio(file_path: str) -> pd.DataFrame:
    """
    Load data from MinIO using full path
    Supports CSV, Parquet, and Arrow/Feather files
    Example: "dataformodel/rpi.csv" or "dataformodel/data.arrow"
    """
    bucket_name, object_path = parse_minio_path(file_path)
    
    minio_client = get_minio_client()
    
    # Verify bucket exists
    if not minio_client.bucket_exists(bucket_name):
        raise HTTPException(404, f"Bucket '{bucket_name}' not found")
    
    try:
        # Get object from MinIO
        response = minio_client.get_object(bucket_name, object_path)
        
        # Read the data into bytes
        file_bytes = response.read()
        response.close()
        response.release_conn()
        
        # Detect file type and read accordingly
        file_extension = object_path.lower()
        
        if file_extension.endswith('.parquet'):
            df = pd.read_parquet(io.BytesIO(file_bytes))
        elif file_extension.endswith(('.arrow', '.feather')):
            df = pd.read_feather(io.BytesIO(file_bytes))
        elif file_extension.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            # Try to read as Parquet first, then fall back to Arrow if that fails
            try:
                df = pd.read_parquet(io.BytesIO(file_bytes))
            except Exception as e:
                df = pd.read_feather(io.BytesIO(file_bytes))
        
        return df
        
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(404, f"File '{object_path}' not found in bucket '{bucket_name}'")
        raise HTTPException(500, f"MinIO error: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"Error reading file: {str(e)}")

# ────────────────────────── K selection helpers ──────────────────────────
def find_k_elbow(
    X: np.ndarray,
    k_min: int = 2,
    k_max: int = 10,
    random_state: int = 0,
    n_init: int = 10,
) -> Tuple[int, Iterable[int], Iterable[float]]:
    """Pick k by elbow using max distance-to-chord on KMeans inertia."""
    n = X.shape[0]
    k_min = max(2, int(k_min))
    k_max = max(k_min, min(int(k_max), max(2, n - 1)))

    ks = list(range(k_min, k_max + 1))
    inertias = []
    for k in ks:
        km = KMeans(n_clusters=k, random_state=random_state, n_init=n_init).fit(X)
        inertias.append(km.inertia_)

    if len(ks) == 1:
        return ks[0], ks, inertias

    x1, y1 = ks[0], inertias[0]
    x2, y2 = ks[-1], inertias[-1]
    denom = np.hypot(x2 - x1, y2 - y1) or 1.0
    # perpendicular distances from each (k, inertia) to the chord (k_min→k_max)
    dists = [abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / denom
             for x, y in zip(ks, inertias)]
    best_k = ks[int(np.argmax(dists))]
    return best_k, ks, inertias


def find_k_silhouette(
    X: np.ndarray,
    k_min: int = 2,
    k_max: int = 10,
    random_state: int = 0,
    n_init: int = 10,
) -> Tuple[int, Iterable[int], Iterable[float]]:
    """
    Pick k by maximizing mean silhouette (computed from KMeans labels).
    Uses Euclidean metric; guards against degenerate 1-cluster results.
    """
    n = X.shape[0]
    k_min = max(2, int(k_min))
    k_max = max(k_min, min(int(k_max), max(2, n - 1)))

    ks = list(range(k_min, k_max + 1))
    scores: list[float] = []

    for k in ks:
        km = KMeans(n_clusters=k, random_state=random_state, n_init=n_init).fit(X)
        labels = km.labels_
        # silhouette requires ≥2 clusters and no empty cluster
        if len(set(labels)) < 2 or min(np.bincount(labels)) <= 1:
            scores.append(-1.0)
            continue
        try:
            s = silhouette_score(X, labels, metric="euclidean")
        except Exception:
            s = -1.0
        scores.append(float(s))

    best_idx = int(np.argmax(scores))
    return ks[best_idx], ks, scores


def _kmeans_inertia(X: np.ndarray, k: int, random_state: int = 0, n_init: int = 10) -> float:
    km = KMeans(n_clusters=k, random_state=random_state, n_init=n_init).fit(X)
    return float(km.inertia_)


def find_k_gap_statistic(
    X: np.ndarray,
    k_min: int = 2,
    k_max: int = 10,
    B: int = 10,
    random_state: int = 0,
    n_init: int = 10,
) -> Tuple[int, Iterable[int], Iterable[float]]:
    """
    Gap statistic (Tibshirani et al., 2001) using KMeans SSE (inertia) as dispersion.
    Reference distribution: uniform within the data's bounding box.
    Returns best k using the "first k with Gap(k) ≥ Gap(k+1) − s_{k+1}" rule.
    """
    rng = np.random.RandomState(random_state)
    n, d = X.shape
    k_min = max(2, int(k_min))
    k_max = max(k_min, min(int(k_max), max(2, n - 1)))
    ks = list(range(k_min, k_max + 1))

    # Data dispersions
    log_Wk = np.array([np.log(_kmeans_inertia(X, k, random_state, n_init)) for k in ks])

    # Bounding box for uniform reference draws
    mins = X.min(axis=0)
    maxs = X.max(axis=0)

    # Reference dispersions
    log_Wk_ref = np.zeros((len(ks), B))
    for b in range(B):
        X_ref = rng.uniform(mins, maxs, size=(n, d))
        for i, k in enumerate(ks):
            log_Wk_ref[i, b] = np.log(_kmeans_inertia(X_ref, k, random_state, n_init))

    gap = log_Wk_ref.mean(axis=1) - log_Wk
    sdk = log_Wk_ref.std(axis=1, ddof=1) * np.sqrt(1 + 1.0 / B)

    # Tibshirani rule: smallest k s.t. Gap(k) >= Gap(k+1) - s_{k+1}
    best_k = ks[-1]
    for i in range(len(ks) - 1):
        if gap[i] >= gap[i + 1] - sdk[i + 1]:
            best_k = ks[i]
            break

    return int(best_k), ks, gap.tolist()


# ───────────────────────────── Utilities ─────────────────────────────
def _to_req(req: Any) -> SimpleNamespace:
    """Accept dict/namespace/obj; return SimpleNamespace with attributes."""
    if isinstance(req, SimpleNamespace):
        return req
    if isinstance(req, dict):
        return SimpleNamespace(**req)
    # generic object with attributes
    return SimpleNamespace(**{k: getattr(req, k) for k in dir(req) if not k.startswith("_")})


# ───────────────────────────── Main API ─────────────────────────────
def cluster_dataframe(df: pd.DataFrame, req: Any) -> np.ndarray:
    """
    Apply clustering with optional K selection:
      - k_selection='manual' | 'elbow' | 'silhouette' | 'gap'
    Then apply chosen k to: kmeans, hac, birch, gmm.
    DBSCAN remains controlled by eps/min_samples and uses StandardScaler.

    Req fields (examples / defaults):
      - algorithm: 'kmeans'|'dbscan'|'hac'|'birch'|'gmm'      [required]
      - k_selection: 'manual'|'elbow'|'silhouette'|'gap'      [default: 'elbow' if use_elbow True; else None]
      - n_clusters: int|None|'auto'                           [ignored for dbscan]
      - k_min, k_max: ints for auto-K                         [default 2..10]
      - gap_b: int, bootstraps for gap                        [default 10]
      - use_elbow: bool (legacy flag, maps to k_selection='elbow' if unset)
      - HAC: linkage ('ward'|'complete'|'average'|'single')
      - Birch: threshold (float)
      - DBSCAN: eps (float), min_samples (int)
      - GMM: covariance_type ('full'|'tied'|'diag'|'spherical'), random_state
      - random_state, n_init: typical KMeans/GMM params
    """
    req = _to_req(req)
    alg = (getattr(req, "algorithm", "") or "").lower()

    # ── Data matrix: numeric only; fill NAs with 0
    data = df.select_dtypes(include=[np.number]).fillna(0).values
    if data.shape[0] < 2:
        raise ValueError("Need at least 2 samples for clustering")
    original_data = data.copy()

    # ── Scale for DBSCAN only (as per your rule)
    if alg == "dbscan":
        data = StandardScaler().fit_transform(data)

    # ── Decide n_clusters for non-DBSCAN
    n_clusters = getattr(req, "n_clusters", None)
    k_sel = getattr(req, "k_selection", None)
    if isinstance(k_sel, str):
        k_sel = k_sel.lower()

    # Explicit MANUAL overrides everything for algorithms that use K
    manual_requested = (k_sel == "manual")

    use_elbow_flag = bool(getattr(req, "use_elbow", False))
    wants_auto_k = (
        (k_sel in {"elbow", "silhouette", "gap"}) or
        (use_elbow_flag and k_sel is None) or
        (n_clusters in (None, 0, "auto"))
    )

    # ── Auto-K path
    if alg in {"kmeans", "hac", "birch", "gmm"}:
        if manual_requested:
            # Validate manual n_clusters
            if not isinstance(n_clusters, (int, np.integer)) or int(n_clusters) < 2:
                raise ValueError("For k_selection='manual', provide n_clusters >= 2.")
            n_clusters = int(n_clusters)
        elif wants_auto_k:
            k_min = int(getattr(req, "k_min", getattr(req, "elbow_k_min", 2)))
            k_max = int(getattr(req, "k_max", getattr(req, "elbow_k_max", 10)))
            random_state = int(getattr(req, "random_state", 0))
            n_init = int(getattr(req, "n_init", 10))

            # Choose selection method, defaulting legacy use_elbow→'elbow'
            method = k_sel or ("elbow" if use_elbow_flag else "elbow")
            method = method.lower()

            if method == "silhouette":
                best_k, _, _ = find_k_silhouette(original_data, k_min, k_max, random_state, n_init)
            elif method == "gap":
                B = int(getattr(req, "gap_b", 10))
                best_k, _, _ = find_k_gap_statistic(original_data, k_min, k_max, B, random_state, n_init)
            else:  # 'elbow' or anything else → elbow
                best_k, _, _ = find_k_elbow(original_data, k_min, k_max, random_state, n_init)

            n_clusters = int(best_k)
        else:
            # Implicit manual provided? If still None, use a sensible default.
            if n_clusters is None:
                n_clusters = 3
            else:
                n_clusters = int(n_clusters)

    # ── Fit final model
    if alg == "kmeans":
        model = KMeans(
            n_clusters=int(n_clusters),
            random_state=int(getattr(req, "random_state", 0)),
            n_init=int(getattr(req, "n_init", 10)),
        )
        return model.fit_predict(original_data)

    if alg == "dbscan":
        eps = getattr(req, "eps", None)
        min_samples = getattr(req, "min_samples", None)
        if eps is None or min_samples is None:
            raise ValueError("DBSCAN requires both 'eps' (float) and 'min_samples' (int).")
        model = DBSCAN(eps=float(eps), min_samples=int(min_samples))
        return model.fit_predict(data)

    if alg == "hac":
        linkage = str(getattr(req, "linkage", "ward"))
        model = AgglomerativeClustering(linkage=linkage, n_clusters=int(n_clusters))
        return model.fit_predict(original_data)

    if alg == "birch":
        threshold = float(getattr(req, "threshold", 0.5))
        model = Birch(n_clusters=int(n_clusters), threshold=threshold)
        return model.fit_predict(original_data)

    if alg == "gmm":
        covariance_type = str(getattr(req, "covariance_type", "full"))
        model = GaussianMixture(
            n_components=int(n_clusters),
            covariance_type=covariance_type,
            random_state=int(getattr(req, "random_state", 0)),
        )
        model.fit(original_data)
        return model.predict(original_data)

    raise ValueError("Unsupported algorithm: expected one of {'kmeans','dbscan','hac','birch','gmm'}")

def get_output_dataframe(df: pd.DataFrame, labels: np.ndarray) -> pd.DataFrame:
    """Get the full output dataframe with cluster IDs added"""
    # Add cluster labels to dataframe (same logic as save_clusters_to_minio)
    df_out = df.copy()
    df_out["cluster_id"] = labels
    return df_out

def save_clusters_to_minio(df: pd.DataFrame, labels: np.ndarray, file_path: str) -> str:
    """Save clustered results back to MinIO - ONLY called when user explicitly saves data"""
    bucket_name, object_path = parse_minio_path(file_path)
    
    # Get standard prefix using environment variables (same approach as get_object_prefix)
    # Since this function is not async, we'll use the environment variables directly
    client = os.getenv("CLIENT_NAME", "default_client")
    app = os.getenv("APP_NAME", "default_app")
    project = os.getenv("PROJECT_NAME", "default_project")
    prefix = f"{client}/{app}/{project}/"
    
    # Create output path with standard prefix structure (same as concat atom)
    base_name = object_path.rsplit('.', 1)[0]
    out_path = f"{prefix}clustering-data/{base_name}-clusters.arrow"
    
    # Add cluster labels to dataframe
    df_out = df.copy()
    df_out["cluster_id"] = labels
    
    # Convert to Arrow format for efficiency
    table = pa.Table.from_pandas(df_out)
    arrow_buffer = pa.BufferOutputStream()
    with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
        writer.write_table(table)
    arrow_bytes = arrow_buffer.getvalue().to_pybytes()
    
    # Save to MinIO
    minio_client = get_minio_client()
    minio_client.put_object(
        bucket_name, 
        out_path, 
        data=io.BytesIO(arrow_bytes),
        length=len(arrow_bytes),
        content_type="application/octet-stream"
    )
    
    # Cache in Redis for 1 hour
    try:
        import redis
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
        redis_client.setex(f"{bucket_name}/{out_path}", 3600, arrow_bytes)
        print(f"✅ Cached clustered data in Redis: {bucket_name}/{out_path}")
    except Exception as e:
        print(f"⚠️ Redis caching failed: {e}")
    
    return f"{bucket_name}/{out_path}"



from .schemas import IdentifierFilter, MeasureFilter
import pyarrow as pa
import pyarrow.ipc as ipc

def apply_identifier_filters(df: pd.DataFrame, identifier_filters: List[IdentifierFilter]) -> pd.DataFrame:
    """Apply identifier value filters to dataframe"""
    print(f"🔍 DEBUG: apply_identifier_filters called with {len(identifier_filters)} filters")
    print(f"🔍 DEBUG: DataFrame columns: {df.columns.tolist()}")
    
    # Create case-insensitive column mapping
    column_mapping = {col.lower(): col for col in df.columns}
    print(f"🔍 DEBUG: Column mapping (lowercase -> actual): {column_mapping}")
    
    for filter_item in identifier_filters:
        print(f"🔍 DEBUG: Processing filter: column='{filter_item.column}', values={filter_item.values}")
        
        # Find the actual column name (case-insensitive)
        actual_column = column_mapping.get(filter_item.column.lower())
        print(f"🔍 DEBUG: Column exists in df? {actual_column is not None}")
        print(f"🔍 DEBUG: Actual column name: '{actual_column}'")
        
        if actual_column:
            print(f"🔍 DEBUG: Before filter '{actual_column}': {len(df)} rows")
            print(f"🔍 DEBUG: Unique values in column '{actual_column}': {df[actual_column].unique()[:10].tolist()}")
            
            # Apply the filter using the actual column name
            df = df[df[actual_column].isin(filter_item.values)]
            
            print(f"🔍 DEBUG: After filter '{actual_column}': {len(df)} rows")
            print(f"🔍 DEBUG: Remaining unique values: {df[actual_column].unique()[:10].tolist()}")
        else:
            print(f"❌ DEBUG: Column '{filter_item.column}' not found in dataframe (case-insensitive search failed)")
    
    return df

def apply_measure_filters(df: pd.DataFrame, measure_filters: List[MeasureFilter]) -> pd.DataFrame:
    """Apply measure value filters to dataframe"""
    # Create case-insensitive column mapping
    column_mapping = {col.lower(): col for col in df.columns}
    
    for filter_item in measure_filters:
        # Find the actual column name (case-insensitive)
        actual_column = column_mapping.get(filter_item.column.lower())
        
        if actual_column:
            col = df[actual_column]
            
            if filter_item.operator == "eq":
                df = df[col == filter_item.value]
            elif filter_item.operator == "gt":
                df = df[col > filter_item.value]
            elif filter_item.operator == "lt":
                df = df[col < filter_item.value]
            elif filter_item.operator == "gte":
                df = df[col >= filter_item.value]
            elif filter_item.operator == "lte":
                df = df[col <= filter_item.value]
            elif filter_item.operator == "between":
                df = df[(col >= filter_item.min_value) & (col <= filter_item.max_value)]
    
    return df

async def get_unique_values(file_path: str, column: str, limit: int = 100) -> List[Any]:
    """Get unique values for a specific column"""
    df = await load_csv_from_minio(file_path)
    
    if column not in df.columns:
        raise HTTPException(404, f"Column '{column}' not found")
    
    unique_values = df[column].dropna().unique()[:limit]
    return unique_values.tolist()

async def save_filtered_data_to_minio(df: pd.DataFrame, original_path: str, filter_name: str) -> str:
    """Save filtered dataframe as a new file in MinIO - ONLY called when user explicitly saves data"""
    bucket_name, object_path = parse_minio_path(original_path)
    
    # Get standard prefix using get_object_prefix (same as concat atom)
    prefix = await get_object_prefix()
    
    # Create new path for filtered file with standard prefix structure (same as concat atom)
    base_name = object_path.rsplit('.', 1)[0]
    filtered_path = f"{prefix}clustering-data/{base_name}-{filter_name}.arrow"
    
    # Convert to Arrow format for efficiency
    table = pa.Table.from_pandas(df)
    arrow_buffer = pa.BufferOutputStream()
    with pa.ipc.new_file(arrow_buffer, table.schema) as writer:
        writer.write_table(table)
    arrow_bytes = arrow_buffer.getvalue().to_pybytes()
    
    # Save to MinIO
    minio_client = get_minio_client()
    minio_client.put_object(
        bucket_name, 
        filtered_path, 
        data=io.BytesIO(arrow_bytes),
        length=len(arrow_bytes),
        content_type="application/octet-stream"
    )
    
    # Cache in Redis for 1 hour
    try:
        import redis
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
        redis_client.setex(f"{bucket_name}/{filtered_path}", 3600, arrow_bytes)
        print(f"✅ Cached filtered data in Redis: {bucket_name}/{filtered_path}")
    except Exception as e:
        print(f"⚠️ Redis caching failed: {e}")
    
    return f"{bucket_name}/{filtered_path}"

def calculate_cluster_stats(df: pd.DataFrame, labels: np.ndarray) -> List[dict]:
    """Calculate centroid, min, and max for each cluster"""
    # Add cluster labels to dataframe
    df_with_clusters = df.copy()
    df_with_clusters['cluster_id'] = labels
    
    # Get numeric columns only (exclude cluster_id)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    cluster_stats = []
    unique_labels = np.unique(labels)
    
    # Create a mapping to ensure sequential cluster IDs starting from 0
    label_mapping = {old_label: new_label for new_label, old_label in enumerate(sorted(unique_labels))}
    
    for old_label in unique_labels:
        # Get rows for this cluster
        cluster_data = df_with_clusters[df_with_clusters['cluster_id'] == old_label]
        
        # Calculate stats for numeric columns
        centroid = {}
        min_values = {}
        max_values = {}
        
        for col in numeric_cols:
            centroid[col] = float(cluster_data[col].mean())
            min_values[col] = float(cluster_data[col].min())
            max_values[col] = float(cluster_data[col].max())
        
        # Use the new sequential cluster ID
        new_cluster_id = label_mapping[old_label]
        
        cluster_stats.append({
            "cluster_id": new_cluster_id,
            "size": len(cluster_data),
            "centroid": centroid,
            "min_values": min_values,
            "max_values": max_values
        })
    
    return cluster_stats


def _parse_numeric_id(value: str) -> int:
    """Parse numeric ID from string, returning 0 if invalid"""
    try:
        return int(value) if value else 0
    except (ValueError, TypeError):
        return 0


async def get_object_prefix(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    include_env: bool = False,
) -> str | tuple[str, dict[str, str], str]:
    """Return the MinIO prefix for the current client/app/project.

    When ``include_env`` is True a tuple of ``(prefix, env, source)`` is
    returned where ``source`` describes where the environment variables were
    loaded from.
    """
    USER_ID = _parse_numeric_id(os.getenv("USER_ID"))
    PROJECT_ID = _parse_numeric_id(project_id or os.getenv("PROJECT_ID", "0"))
    client_id_env = client_id or os.getenv("CLIENT_ID", "")
    app_id_env = app_id or os.getenv("APP_ID", "")
    project_id_env = project_id or os.getenv("PROJECT_ID", "")

    # Resolve environment variables using ``get_env_vars`` which consults the
    # Redis cache keyed by ``<client>/<app>/<project>`` and falls back to
    # Postgres when missing.  This ensures we always load the latest names for
    # the currently selected namespace instead of defaulting to
    # ``default_client/default_app/default_project``.
    env: dict[str, str] = {}
    env_source = "unknown"
    fresh = await get_env_vars(
        client_id_env,
        app_id_env,
        project_id_env,
        client_name=client_name or os.getenv("CLIENT_NAME", ""),
        app_name=app_name or os.getenv("APP_NAME", ""),
        project_name=project_name or os.getenv("PROJECT_NAME", ""),
        use_cache=True,
        return_source=True,
    )
    if isinstance(fresh, tuple):
        env, env_source = fresh
    else:
        env, env_source = fresh, "unknown"

    print(f"🔧 fetched env {env} (source={env_source})")
    client = env.get("CLIENT_NAME", os.getenv("CLIENT_NAME", "default_client"))
    app = env.get("APP_NAME", os.getenv("APP_NAME", "default_app"))
    project = env.get("PROJECT_NAME", os.getenv("PROJECT_NAME", "default_project"))

    if PROJECT_ID and (client == "default_client" or app == "default_app" or project == "default_project"):
        try:
            client_db, app_db, project_db = await fetch_client_app_project(
                USER_ID if USER_ID else None, PROJECT_ID
            )
            client = client_db or client
            app = app_db or app
            project = project_db or project
        except Exception as exc:  # pragma: no cover - database unreachable
            print(f"⚠️ Failed to load names from DB: {exc}")

    os.environ["CLIENT_NAME"] = client
    os.environ["APP_NAME"] = app
    os.environ["PROJECT_NAME"] = project
    prefix = f"{client}/{app}/{project}/"
    print(
        f"📦 prefix {prefix} (CLIENT_ID={client_id or os.getenv('CLIENT_ID','')} APP_ID={app_id or os.getenv('APP_ID','')} PROJECT_ID={PROJECT_ID})"
    )
    if include_env:
        return prefix, env, env_source
    return prefix