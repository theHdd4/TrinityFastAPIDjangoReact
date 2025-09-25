# ======================= Elasticities from Artifacts (FINAL with Power/Exp) =======================


import math
import logging
import inspect
from typing import Dict, List, Optional, Any, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId

logger = logging.getLogger(__name__)

# Reuse existing router if present; otherwise create one
try:
    router  # type: ignore[name-defined]
except NameError:  # pragma: no cover
    router = APIRouter()

# Project imports (adjust paths if needed):
# - get_csv_from_minio(file_key) -> BytesIO (async)
# - build_collection: Motor/Mongo collection for storing results
# - createandtransform_configs_collection: Motor/Mongo collection for createcolumn operations
from .database import get_csv_from_minio, build_collection, createandtransform_configs_collection


# ─────────────────────────── Pydantic I/O models ───────────────────────────

class ElasticityArtifactsRequest(BaseModel):
    """
    INPUT
    -----
    transform_doc_id : Mongo _id (string) of the "createcolumn" / ops doc (contains `operations`, `columns`, etc.)
    coef_file_key    : MinIO key for the coefficients CSV (columns like '<Feature>_beta' or legacy 'Beta_<Feature>')
    data_file_key    : MinIO key for the TRAINING DATA file (CSV/Parquet/Arrow supported by your loader).
                       Used ONLY if the coeff CSV lacks Mean_* columns.
    y_column         : Optional override for target column (when the ops doc doesn’t store it).
    exclude_vars     : Optional list of features to omit (case/underscore-insensitive), e.g. ["PPU"]
    return_details   : Whether to include per-feature breakdown (recommended during rollout)
    """
    transform_doc_id: str = Field(..., description="Mongo _id of the ops doc")
    coef_file_key: str = Field(..., description="MinIO key for coefficients CSV ('<Feature>_beta')")
    data_file_key: Optional[str] = Field(None, description="MinIO key for training data (means fallback)")
    y_column: Optional[str] = Field(None, description="Override dependent/target column name")
    exclude_vars: Optional[List[str]] = Field(default_factory=list, description="Features to omit (e.g., ['PPU'])")
    return_details: bool = Field(True, description="Include per-feature details")


class ElasticityArtifactsResponse(BaseModel):
    """
    OUTPUT
    ------
    transform_doc_id : The ops doc used
    coef_file_key    : The coefficients CSV used
    data_file_key    : The data file used (if any)
    y_column         : Target column used
    excluded         : Features omitted per request
    elasticities     : { feature_name -> elasticity_value }
    details          : Optional per-feature breakdown (means, derivative, warnings, etc.)
    """
    transform_doc_id: str
    coef_file_key: str
    data_file_key: Optional[str]
    y_column: str
    excluded: List[str]
    elasticities: Dict[str, float]
    details: Optional[Dict[str, Any]] = None


# ───────────────────────────── Helper functions ─────────────────────────────

def _norm(name: str) -> str:
    """Normalize names for fuzzy matching across sources (lowercase + keep [a-z0-9])."""
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())

def _canon_transform(t: Optional[str]) -> str:
    """
    Map any transform hint into one of:
      direct | log | squared | sqrt | power | exp
    """
    t = (t or "direct").strip().lower()
    if t in {"log", "ln"}: return "log"
    if t in {"sqrt", "root"}: return "sqrt"
    if t in {"squared", "square"}: return "squared"
    if t in {"power", "pow"}: return "power"
    if t in {"exp", "exponential"}: return "exp"
    return "direct"

def _extract_betas(df_coef: pd.DataFrame) -> Dict[str, float]:
    """
    Read FIRST ROW; support both:
      • '<Feature>_beta'   (preferred)
      • 'Beta_<Feature>'   (legacy)
    Ignore intercept-like columns.
    Return: { 'Feature': coef }
    """
    if df_coef.empty:
        raise ValueError("Coefficients CSV is empty")
    row0 = df_coef.iloc[0]

    betas: Dict[str, float] = {}
    for col in df_coef.columns:
        c = str(col).strip()
        cl = c.lower()

        base = None
        if cl.endswith("_beta"):      # preferred
            base = c[:-5].strip()
        elif cl.startswith("beta_"):  # legacy
            base = c[5:].strip()
        if not base:
            continue

        if _norm(base) in {"intercept", "const", "bias"}:
            continue

        try:
            betas[base] = float(row0[col])
        except (TypeError, ValueError):
            continue

    return betas

def _extract_means_from_coef(df_coef: pd.DataFrame) -> Tuple[Dict[str, float], Optional[float]]:
    """
    Try to read means from the same CSV:
      - 'Mean_<Var>' columns → dict with those exact keys
      - Y mean via one of: 'Mean_Y', 'MeanY', 'Mean_Target', 'Mean_Volume'
    Return: (means_dict, mean_y_or_None)
    """
    if df_coef.empty:
        return {}, None

    row0 = df_coef.iloc[0].to_dict()
    means: Dict[str, float] = {}
    mean_y: Optional[float] = None

    for col in df_coef.columns:
        c = str(col).strip()
        if c.lower().startswith("mean_"):
            try:
                means[c] = float(row0[col])
            except Exception:
                pass

    lower_map = {c.lower(): c for c in df_coef.columns}
    for candidate in ("mean_y", "meany", "mean_target", "meanvolume", "mean_volume"):
        if candidate in lower_map:
            try:
                mean_y = float(row0[lower_map[candidate]])
                break
            except Exception:
                mean_y = None

    return means, mean_y

def _compute_means_from_data(df_data: pd.DataFrame, cols: List[str], y_column: str) -> Tuple[Dict[str, float], float]:
    """
    Compute mean() for each named column and mean(Y) from the provided DataFrame.
    Uses fuzzy matching if a column isn't found verbatim.
    """
    means: Dict[str, float] = {}

    # Per-column mean
    for v in cols:
        if v in df_data.columns:
            means[v] = float(pd.to_numeric(df_data[v], errors="coerce").dropna().mean())
            continue
        target = _norm(v)
        match = next((c for c in df_data.columns if _norm(c) == target), None)
        means[v] = float(pd.to_numeric(df_data[match], errors="coerce").dropna().mean()) if match else float("nan")

    # Mean(Y)
    if y_column in df_data.columns:
        y_col = y_column
    else:
        target_y = _norm(y_column)
        y_match = next((c for c in df_data.columns if _norm(c) == target_y), None)
        if not y_match:
            raise HTTPException(status_code=400, detail=f"y_column '{y_column}' not found in data file.")
        y_col = y_match
    mean_y = float(pd.to_numeric(df_data[y_col], errors="coerce").dropna().mean())

    return means, mean_y

def _derivative_at_mean(
    transform_kind: str,
    xbar_feature: float,
    xbar_base: Optional[float] = None,
    p: Optional[float] = None
) -> Tuple[float, Optional[str]]:
    """
    Derivative of the model feature w.r.t. its *base variable*, evaluated at mean.
      direct : dX/dX                      = 1                      (use feature mean)
      log    : d(log X_base)/dX_base      = 1 / mean(X_base)
      squared: d(X_base^2)/dX_base        = 2 * mean(X_base)
      sqrt   : d(sqrt(X_base))/dX_base    = 1 / (2 * sqrt(mean(X_base)))
      power  : d(X_base^p)/dX_base        = p * mean(X_base)^(p-1)
      exp    : d(exp(X_base))/dX_base     = exp(mean(X_base))
    Notes:
      • For single-input transforms (log/sqrt/power/exp), we prefer the BASE mean.
      • For direct/composite features, derivative is 1 and we use the FEATURE mean.
    """
    kind = _canon_transform(transform_kind)

    # Choose which mean to differentiate at: base (if provided) or feature
    xb = xbar_base if (xbar_base is not None and np.isfinite(xbar_base)) else xbar_feature

    if kind == "direct":
        return 1.0, None

    if kind == "log":
        if not np.isfinite(xb) or xb <= 0:
            return 0.0, f"Skipped log: mean(base)={xb} not > 0"
        return 1.0 / xb, None

    if kind == "squared":
        if not np.isfinite(xb):
            return 0.0, "Skipped squared: mean(base) is NaN"
        return 2.0 * xb, None

    if kind == "sqrt":
        if not np.isfinite(xb) or xb <= 0:
            return 0.0, f"Skipped sqrt: mean(base)={xb} not > 0"
        return 1.0 / (2.0 * math.sqrt(xb)), None

    if kind == "power":
        if p is None or not np.isfinite(xb):
            return 0.0, "Skipped power: missing p or invalid mean(base)"
        return p * (xb ** (p - 1.0)), None

    if kind == "exp":
        if not np.isfinite(xb):
            return 0.0, "Skipped exp: mean(base) is NaN"
        return math.exp(xb), None

    # Fallback: treat unknown transforms as direct
    return 1.0, None


# ───────────── Ops doc adapter: extract feature list, base map, and transform kinds ─────────────

def _xvars_and_transforms_from_ops_doc(
    doc: Dict[str, Any],
    y_override: Optional[str]
) -> Tuple[List[str], str, Dict[str, str], Dict[str, str], Dict[str, float]]:
    """
    Reads your "createcolumn" ops doc and returns:
      x_vars       : final candidate features (strings)
      y_col        : target column (override or heuristic)
      transform_map: { feature -> 'direct' | 'log' | 'sqrt' | 'squared' | 'power' | 'exp' }
      base_of      : { feature -> base_column_name } for single-input transforms
      power_p      : { feature -> p } for general power
    Rules:
      • power(param=2)   -> 'squared'
      • power(param=0.5) -> 'sqrt'
      • power(param≠{1,2,0.5}) -> 'power' with p recorded
      • log/ln, sqrt, exp/exponential detected on single-column ops
      • add/subtract/multiply/divide/unknown -> 'direct' (treat created feature as-is)
      • Op codes supported: 12=power, 13=log, 14=sqrt, 2=add, 3=subtract, 4=multiply, 5=divide
    """
    created_cols: List[str] = []
    transform_map: Dict[str, str] = {}
    base_of: Dict[str, str] = {}
    power_p: Dict[str, float] = {}

    code_map = {"12": "power", "13": "log", "14": "sqrt", "2": "add", "3": "subtract", "4": "multiply", "5": "divide"}

    ops = doc.get("operations") or []
    if isinstance(ops, list):
        for op in ops:
            if not isinstance(op, dict):
                continue
            created = op.get("created_column_name") or op.get("rename")
            if not isinstance(created, str) or not created:
                continue

            created_cols.append(created)

            # Normalize op type (string or numeric code as string)
            op_type_raw = op.get("operation_type")
            op_type = str(op_type_raw).strip().lower()
            if op_type.isdigit():
                op_type = code_map.get(op_type, op_type)

            cols = op.get("columns") or []
            param = op.get("param", None)

            # Single-input transforms: log/sqrt/power/exp
            if op_type in {"log", "ln"} and isinstance(cols, list) and len(cols) == 1:
                transform_map[created] = "log";  base_of[created] = cols[0]

            elif op_type in {"sqrt"} and isinstance(cols, list) and len(cols) == 1:
                transform_map[created] = "sqrt"; base_of[created] = cols[0]

            elif op_type in {"exp", "exponential"} and isinstance(cols, list) and len(cols) == 1:
                transform_map[created] = "exp";  base_of[created] = cols[0]

            elif op_type == "power" and isinstance(cols, list) and len(cols) == 1:
                base_of[created] = cols[0]
                try:
                    p = float(param) if param is not None else None
                except Exception:
                    p = None
                if p == 2:
                    transform_map[created] = "squared"
                elif p in (0.5, 1/2):
                    transform_map[created] = "sqrt"
                elif p == 1:
                    transform_map[created] = "direct"
                elif p is not None:
                    transform_map[created] = "power"
                    power_p[created] = p
                else:
                    transform_map[created] = "direct"

            else:
                # Multi-input ops or unknown → treat created feature as direct
                # (add, subtract, multiply, divide, ratio, etc.)
                transform_map[created] = "direct"

    # Also include final dataset columns as candidates
    all_cols = [c for c in (doc.get("columns") or []) if isinstance(c, str)]
    candidates = list(dict.fromkeys(created_cols + all_cols))  # de-dupe & preserve order

    # Choose Y: override → heuristic → error
    if y_override and isinstance(y_override, str):
        y_col = y_override
    else:
        lower_set = {c.lower(): c for c in candidates}
        y_col = None
        for guess in ("sales", "volume", "target", "y"):
            if guess in lower_set:
                y_col = lower_set[guess]
                break
        if not y_col:
            raise HTTPException(
                status_code=400,
                detail="Could not determine y_column from doc; pass 'y_column' in the request."
            )

    # Remove obvious non-feature columns
    non_feature_like = {"id", "date", "timestamp", y_col.lower()}
    x_vars = [c for c in candidates if isinstance(c, str) and c.lower() not in non_feature_like]

    # Default any missing transforms to 'direct'
    for x in x_vars:
        transform_map.setdefault(x, "direct")

    return x_vars, y_col, transform_map, base_of, power_p


# ──────────────────────────────── Endpoint ────────────────────────────────

@router.post("/elasticities/from-artifacts", response_model=ElasticityArtifactsResponse, tags=["Elasticity"])
async def compute_elasticities_from_artifacts(req: ElasticityArtifactsRequest):
    """
    Flow:
      1) Read ops doc → features (X), transforms, base-of map, power(p), and Y.
      2) Read coefficients CSV (supports '<Feature>_beta' and 'Beta_<Feature>').
      3) Intersect features with coeffs; only compute where both exist.
      4) Get means:
           • Prefer 'Mean_*' cols in coeff CSV (fast path).
           • Else read data_file_key and compute means for (features + needed bases) and mean(Y).
      5) For each feature:
           • derivative at mean (using base mean when it's a single-input transform)
           • elasticity = (β * derivative_at_mean) * ( scale_mean / mean(Y) )
             where scale_mean = mean(base) for single-input transforms, else mean(feature).
      6) Exclude any requested features; return elasticities + optional details.
    """
    # 1) --- Load ops doc from Mongo ---
    # Allow string ids like "acme_corp/sales_analytics/q4_2024" or ObjectId
    try:
        _id = ObjectId(req.transform_doc_id)
    except Exception:
        _id = req.transform_doc_id  # use as-is if not an ObjectId

    doc = await createandtransform_configs_collection.find_one({"_id": _id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ops document not found in Mongo")

    x_candidates, y_column, transform_map, base_of, power_p = _xvars_and_transforms_from_ops_doc(doc, req.y_column)

    # 2) --- Load coefficients CSV & parse betas ---
    try:
        coef_buffer = await get_csv_from_minio(req.coef_file_key)
        df_coef = pd.read_csv(coef_buffer)
        if not isinstance(df_coef, pd.DataFrame) or df_coef.empty:
            raise ValueError("Coefficients CSV is empty or not a DataFrame")
    except Exception as e:
        logger.error(f"Failed to load coefficients CSV '{req.coef_file_key}': {e}")
        raise HTTPException(status_code=400, detail=f"Cannot read coefficients CSV: {e}")

    betas: Dict[str, float] = _extract_betas(df_coef)
    if not betas:
        raise HTTPException(status_code=400, detail="No '<Feature>_beta' or 'Beta_<Feature>' columns in coefficients CSV")

    # Intersection by fuzzy name
    beta_suffix_loose = {_norm(k): k for k in betas.keys()}
    x_loose = {_norm(x): x for x in x_candidates}
    common_norms = sorted(set(beta_suffix_loose.keys()) & set(x_loose.keys()))
    if not common_norms:
        raise HTTPException(status_code=400, detail="No overlap between Mongo features and coefficients columns")

    features_present = [x_loose[n] for n in common_norms]

    # 3) --- Means from coeff CSV (fast path) ---
    coef_means_raw, coef_mean_y = _extract_means_from_coef(df_coef)
    means_by_feature: Dict[str, float] = {}
    mean_y: Optional[float] = coef_mean_y

    # Try mean(feature) from coeff CSV ('Mean_<Feature>')
    for fv in features_present:
        exact_key = f"Mean_{fv}"
        if exact_key in coef_means_raw:
            try:
                means_by_feature[fv] = float(coef_means_raw[exact_key]); continue
            except Exception:
                pass
        fv_norm = _norm(fv)
        mv = next(
            (val for k, val in coef_means_raw.items()
             if str(k).lower().startswith("mean_") and _norm(str(k)[5:]) == fv_norm),
            None
        )
        if mv is not None:
            means_by_feature[fv] = float(mv)

    # For single-input transforms, we also want mean(base)
    base_names_needed = sorted({base_of[fv] for fv in features_present if fv in base_of})
    base_means: Dict[str, float] = {}
    for b in base_names_needed:
        exact_key = f"Mean_{b}"
        if exact_key in coef_means_raw:
            try:
                base_means[b] = float(coef_means_raw[exact_key]); continue
            except Exception:
                pass
        b_norm = _norm(b)
        mv = next(
            (val for k, val in coef_means_raw.items()
             if str(k).lower().startswith("mean_") and _norm(str(k)[5:]) == b_norm),
            None
        )
        if mv is not None:
            base_means[b] = float(mv)

    # 4) --- If anything missing, read data and compute means ---
    need_feature_means = [v for v in features_present if v not in means_by_feature]
    need_base_means = [b for b in base_names_needed if b not in base_means]
    if need_feature_means or need_base_means or mean_y is None:
        if not req.data_file_key:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Means not found in coefficients CSV and no data_file_key provided. "
                    f"Missing feature means: {need_feature_means}; missing base means: {need_base_means}; "
                    f"mean_y={'missing' if mean_y is None else 'ok'}"
                )
            )
        try:
            data_buffer = await get_csv_from_minio(req.data_file_key)
            df_data = pd.read_csv(data_buffer)
            if not isinstance(df_data, pd.DataFrame) or df_data.empty:
                raise ValueError("Data file is empty or not a DataFrame")
        except Exception as e:
            logger.error(f"Failed to load data file '{req.data_file_key}': {e}")
            raise HTTPException(status_code=400, detail=f"Cannot read data file: {e}")

        # Compute means for features + needed bases
        cols_to_compute = list(dict.fromkeys(features_present + need_base_means))
        computed_means, computed_mean_y = _compute_means_from_data(df_data, cols_to_compute, y_column)

        for k, v in computed_means.items():
            if k in features_present and (k not in means_by_feature or not np.isfinite(means_by_feature.get(k, np.nan))):
                means_by_feature[k] = v
            if k in base_names_needed and (k not in base_means or not np.isfinite(base_means.get(k, np.nan))):
                base_means[k] = v
        if mean_y is None:
            mean_y = computed_mean_y

    # Final sanity on mean(Y)
    if mean_y is None or not np.isfinite(mean_y) or mean_y == 0:
        raise HTTPException(status_code=400, detail="Mean(Y) is zero/NaN; cannot compute elasticities")

    # 5) --- Compute elasticities (respect exclusions) ---
    exclude_norm = {_norm(v) for v in (req.exclude_vars or [])}
    elasticities: Dict[str, float] = {}
    details: Dict[str, Any] = {}

    for nkey in common_norms:
        feat = x_loose[nkey]               # feature name from Mongo/ops
        if _norm(feat) in exclude_norm:
            continue

        beta_suffix = beta_suffix_loose[nkey]  # exact name used in coeffs
        beta_val = float(betas.get(beta_suffix, 0.0))

        # For diagnostics: prefer '<Feature>_beta'; else 'Beta_<Feature>'
        prefer_suffix = f"{beta_suffix}_beta"
        prefer_prefix = f"Beta_{beta_suffix}"
        if prefer_suffix in df_coef.columns:
            beta_col_name = prefer_suffix
        elif prefer_prefix in df_coef.columns:
            beta_col_name = prefer_prefix
        else:
            beta_col_name = prefer_suffix

        # Means
        xbar_feature = float(means_by_feature.get(feat, float("nan")))
        base_name = base_of.get(feat)
        xbar_base = float(base_means.get(base_name, float("nan"))) if base_name else None

        # Transform info
        tkind = transform_map.get(feat, "direct")
        p = power_p.get(feat)

        # Derivative d(feature)/d(base or feature) at mean
        dfeat_dX, warn = _derivative_at_mean(
            transform_kind=tkind,
            xbar_feature=xbar_feature,
            xbar_base=xbar_base,
            p=p
        )
        warn_msgs: List[str] = []
        if warn:
            warn_msgs.append(warn)

        # Local slope ∂Y/∂X_base_or_feature at mean
        dy_dx_at_mean = beta_val * dfeat_dX

        # Elasticity scaling uses mean of the variable with respect to which the derivative is taken:
        #   • single-input transforms (log/sqrt/power/exp) → scale by mean(base)
        #   • direct/composite features → scale by mean(feature)
        scale_mean = xbar_base if (base_name and xbar_base is not None and np.isfinite(xbar_base)) else xbar_feature
        if not np.isfinite(scale_mean):
            warn_msgs.append("Missing/NaN mean for scaling; skipping")
            if req.return_details:
                details[feat] = {
                    "transform": tkind,
                    "coefficient": beta_val,
                    "beta_column": beta_col_name,
                    "mean_feature": xbar_feature,
                    "mean_base": xbar_base,
                    "scale_mean_used": None,
                    "mean_y": mean_y,
                    "partial_derivative_at_mean": dfeat_dX,
                    "dy_dx_at_mean": dy_dx_at_mean,
                    "final_elasticity": None,
                    "warnings": warn_msgs
                }
            continue

        E = float(dy_dx_at_mean * (scale_mean / mean_y))
        elasticities[feat] = E

        if req.return_details:
            details[feat] = {
                "transform": tkind,
                "power_p": p,
                "coefficient": beta_val,
                "beta_column": beta_col_name,
                "mean_feature": xbar_feature,
                "mean_base": xbar_base,
                "scale_mean_used": scale_mean,
                "mean_y": mean_y,
                "partial_derivative_at_mean": dfeat_dX,
                "dy_dx_at_mean": dy_dx_at_mean,
                "final_elasticity": E,
                "warnings": warn_msgs or None
            }

    # 6) --- Response ---
    return ElasticityArtifactsResponse(
        transform_doc_id=req.transform_doc_id,
        coef_file_key=req.coef_file_key,
        data_file_key=req.data_file_key,
        y_column=y_column,
        excluded=req.exclude_vars or [],
        elasticities=elasticities,
        details=details if req.return_details else None
    )






# ======================= Feature Contributions (Mean*Beta Shares) =======================
# This endpoint computes per-feature contribution shares using:
#   contribution_i = (beta_i * mean(feature_i)) / sum_j (beta_j * mean(feature_j))
#
# It:
#   • Reads your ops doc from Mongo (to get the final feature names after renames)
#   • Loads coefficients from MinIO (columns like '<Feature>_beta' or legacy 'Beta_<Feature>')
#   • Gets means for features from the coeff CSV (Mean_*) or, if missing, from the data file
#   • Intersects Mongo features with coeff features (fuzzy match)
#   • Applies the formula and returns normalized shares
#
# NOTE:
#   • Intercept is ignored.
#   • Features with NaN means are skipped (with a warning in details if return_details=True).
#   • If the denominator is 0 (e.g., all scores are 0), we return an error explaining the issue.

from pydantic import BaseModel, Field

class ContributionsRequest(BaseModel):
    """
    INPUT
    -----
    transform_doc_id : Mongo _id of the ops doc (same as elasticity endpoint)
    coef_file_key    : MinIO key of coefficients CSV ('<Feature>_beta' or 'Beta_<Feature>')
    data_file_key    : Optional MinIO key of training data (used only if Mean_* is missing)
    y_column         : Optional override for target column (used only if we need to read data_file_key)
    exclude_vars     : Optional list of features to omit (case/underscore-insensitive)
    return_details   : Include per-feature breakdown (score, mean, beta, etc.)
    """
    transform_doc_id: str = Field(..., description="Mongo _id of ops doc")
    coef_file_key: str = Field(..., description="MinIO key for coefficients CSV")
    data_file_key: str | None = Field(None, description="MinIO key for training data (means fallback)")
    y_column: str | None = Field(None, description="Target column name (only needed if reading data_file_key)")
    exclude_vars: list[str] = Field(default_factory=list, description="Features to omit, e.g. ['PPU']")
    return_details: bool = Field(True, description="Return per-feature details")


class ContributionsResponse(BaseModel):
    """
    OUTPUT
    ------
    transform_doc_id : The ops doc used
    coef_file_key    : Coefficients CSV used
    data_file_key    : Data file used (if any)
    included_features: Features actually used in the computation (post-intersection & exclusions)
    denominator      : Sum_j (beta_j * mean(feature_j))
    contributions    : { feature -> share in [0,1] (can be negative if scores sum positive/negative) }
    details          : Optional per-feature debug info (mean, beta, score, warnings)
    """
    transform_doc_id: str
    coef_file_key: str
    data_file_key: str | None
    included_features: list[str]
    denominator: float
    contributions: dict[str, float]
    details: dict[str, dict] | None = None


@router.post("/contributions", response_model=ContributionsResponse, tags=["Elasticity"])
async def compute_feature_contributions(req: ContributionsRequest):
    """
    Contribution formula:
        score_i = beta_i * mean(feature_i)
        contribution_i = score_i / sum(scores)

    Steps:
      1) Load ops doc (Mongo) → final feature names (after renames), target (if needed).
      2) Load coefficients from MinIO → betas for features.
      3) Intersect features (Mongo) with betas (MinIO) using fuzzy name matching.
      4) Fetch means:
           • Prefer Mean_* columns in coeff CSV,
           • Else compute from data_file_key (requires y_column just for loading helper).
      5) Compute scores and normalized contributions.
    """
    # 1) --- Load ops doc (string _id allowed) ---
    try:
        _id = ObjectId(req.transform_doc_id)
    except Exception:
        _id = req.transform_doc_id  # use as-is if not ObjectId

    doc = await createandtransform_configs_collection.find_one({"_id": _id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ops document not found in Mongo")

    # Reuse the same adapter to collect final feature names (x_vars)
    # We don't need transforms/base maps for this contributions calc, but the adapter returns them;
    # we’ll ignore them here.
    x_candidates, y_column, _transform_map, _base_of, _power_p = _xvars_and_transforms_from_ops_doc(doc, req.y_column)

    # 2) --- Load coefficients CSV & parse betas ---
    try:
        coef_buffer = await get_csv_from_minio(req.coef_file_key)
        df_coef = pd.read_csv(coef_buffer)
        if not isinstance(df_coef, pd.DataFrame) or df_coef.empty:
            raise ValueError("Coefficients CSV is empty or not a DataFrame")
    except Exception as e:
        logger.error(f"Failed to load coefficients CSV '{req.coef_file_key}': {e}")
        raise HTTPException(status_code=400, detail=f"Cannot read coefficients CSV: {e}")

    betas: Dict[str, float] = _extract_betas(df_coef)
    if not betas:
        raise HTTPException(status_code=400, detail="No '<Feature>_beta' or 'Beta_<Feature>' columns in coefficients CSV")

    # 3) --- Intersect features with beta names (fuzzy) & apply exclusions ---
    beta_norm_to_suffix = {_norm(k): k for k in betas.keys()}
    x_norm_to_name = {_norm(x): x for x in x_candidates}

    exclude_norm = {_norm(v) for v in (req.exclude_vars or [])}

    common_norms = [n for n in x_norm_to_name.keys() if n in beta_norm_to_suffix and n not in exclude_norm]
    if not common_norms:
        raise HTTPException(status_code=400, detail="No overlapping features between Mongo and coefficients after exclusions")

    features_present = [x_norm_to_name[n] for n in common_norms]

    # 4) --- Means: prefer Mean_* in coeff CSV; else compute from data file ---
    coef_means_raw, _coef_mean_y_unused = _extract_means_from_coef(df_coef)

    means_by_feature: Dict[str, float] = {}
    missing_means: List[str] = []

    for fv in features_present:
        exact_key = f"Mean_{fv}"
        val = None
        if exact_key in coef_means_raw:
            try:
                val = float(coef_means_raw[exact_key])
            except Exception:
                val = None
        if val is None:
            fv_norm = _norm(fv)
            mv = next(
                (v for k, v in coef_means_raw.items()
                 if str(k).lower().startswith("mean_") and _norm(str(k)[5:]) == fv_norm),
                None
            )
            if mv is not None:
                val = float(mv)

        if val is None or not np.isfinite(val):
            missing_means.append(fv)
        else:
            means_by_feature[fv] = val

    if missing_means:
        if not req.data_file_key:
            raise HTTPException(
                status_code=400,
                detail=f"Means not found in coefficients CSV for features: {missing_means}; "
                       f"provide data_file_key to compute means from data."
            )
        try:
            data_buffer = await get_csv_from_minio(req.data_file_key)
            df_data = pd.read_csv(data_buffer)
            if not isinstance(df_data, pd.DataFrame) or df_data.empty:
                raise ValueError("Data file is empty or not a DataFrame")
        except Exception as e:
            logger.error(f"Failed to load data file '{req.data_file_key}': {e}")
            raise HTTPException(status_code=400, detail=f"Cannot read data file: {e}")

        # Compute mean(feature) only; we don't need mean(Y) for contributions
        computed_means, _ = _compute_means_from_data(df_data, missing_means, y_column or "y")
        for k, v in computed_means.items():
            means_by_feature[k] = v

    # 5) --- Compute scores and normalized contributions ---
    details: Dict[str, Any] = {}
    scores: Dict[str, float] = {}
    for nkey in common_norms:
        feat = x_norm_to_name[nkey]
        beta_suffix = beta_norm_to_suffix[nkey]
        beta_val = float(betas.get(beta_suffix, 0.0))
        mu = float(means_by_feature.get(feat, float("nan")))
        if not np.isfinite(mu):
            # Skip features with invalid mean; record why (if requested)
            if req.return_details:
                details[feat] = {
                    "beta": beta_val,
                    "mean_feature": None,
                    "score": None,
                    "beta_column": f"{beta_suffix}_beta" if f"{beta_suffix}_beta" in df_coef.columns else (
                                   f"Beta_{beta_suffix}" if f"Beta_{beta_suffix}" in df_coef.columns else f"{beta_suffix}_beta"),
                    "warning": "mean(feature) is NaN; skipped"
                }
            continue

        score = beta_val * mu
        scores[feat] = score

        if req.return_details:
            details[feat] = {
                "beta": beta_val,
                "mean_feature": mu,
                "score": score,
                "beta_column": f"{beta_suffix}_beta" if f"{beta_suffix}_beta" in df_coef.columns else (
                               f"Beta_{beta_suffix}" if f"Beta_{beta_suffix}" in df_coef.columns else f"{beta_suffix}_beta"),
                "warning": None
            }

    if not scores:
        raise HTTPException(status_code=400, detail="No valid features to compute contributions (all means missing/NaN?)")

    denom = float(sum(scores.values()))
    if denom == 0.0 or not np.isfinite(denom):
        raise HTTPException(
            status_code=400,
            detail="Denominator is zero or invalid (sum of beta*mean is 0). Cannot compute normalized contributions."
        )

    contributions = {feat: float(val / denom) for feat, val in scores.items()}

    return ContributionsResponse(
        transform_doc_id=req.transform_doc_id,
        coef_file_key=req.coef_file_key,
        data_file_key=req.data_file_key,
        included_features=list(scores.keys()),
        denominator=denom,
        contributions=contributions,
        details=details if req.return_details else None
    )