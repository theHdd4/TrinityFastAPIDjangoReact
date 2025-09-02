# app/routes.py

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from typing import List, Optional
from datetime import datetime
import logging
import pandas as pd
import io, re, json
# Add this import at the top if not already there
from bson import ObjectId
import numpy as np
from typing import Dict, Any

from .database import (
    scopes_collection,
    minio_client,
    check_database_health,
    extract_unique_combinations,
    get_filter_options,
    get_presigned_url,
    get_file_info,
    list_files_in_bucket,
    db,
    get_transformation_metadata,
    get_model_by_transform_and_id,
)

from .schemas import (
    CombinationSelectionOptions,
    UniqueCombination,
    SelectedCombinationDetails,
    HealthCheck,
    FileDownloadResponse,
    FilteredModel,
    ModelFilterRequest,
    ModelVariablesResponse,
    VariableContribution,
    WeightedEnsembleRequest,ComboResult,WeightedEnsembleResponse,
    ModelPerformanceMetrics, ActualVsPredicted,    
    GenericModelSelectionRequest,
    SavedModelResponse,
)

from .config import get_settings, settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health", response_model=HealthCheck, tags=["Health"])
async def health_check():
    """Enhanced health check with detailed diagnostics."""
    health_status = await check_database_health()
    settings_obj = get_settings()
    
    return HealthCheck(
        status="healthy" if all(service["status"] for service in health_status.values()) else "unhealthy",
        timestamp=datetime.now(),
        services=health_status,
        version=settings_obj.app_version,
        database_details={
            "endpoint": settings_obj.mongo_details.split('@')[1] if '@' in settings_obj.mongo_details else settings_obj.mongo_details,
            "database": settings_obj.database_name,
            "collection": settings_obj.collection_name
        },
        minio_details={
            "url": settings_obj.minio_url,
            "bucket": settings_obj.minio_bucket_name,
            "port": "9003"
        }
    )

@router.get("/combinations", response_model=CombinationSelectionOptions, tags=["Combinations"])
async def get_all_combinations():
    """Get all unique combinations available for selection."""
    if scopes_collection is None:
        raise HTTPException(
            status_code=503,
            detail="Database connection not available. Please check MongoDB connection."
        )
    
    try:
        # Test database connectivity
        await scopes_collection.find_one()
        
        # Fetch all scope documents
        scopes_data = []
        async for scope_doc in scopes_collection.find():
            scopes_data.append(scope_doc)
        
        if not scopes_data:
            raise HTTPException(
                status_code=404,
                detail="No scope data found in the collection."
            )
        
        logger.info(f"Found {len(scopes_data)} scopes in the database")
        
        # Extract unique combinations
        unique_combinations = extract_unique_combinations(scopes_data)
        filter_options = get_filter_options(scopes_data)
        
        summary = {
            "total_scopes": len(scopes_data),
            "total_unique_combinations": len(unique_combinations),
            "total_records_across_all": sum(combo['total_records'] for combo in unique_combinations),
            "scope_types": filter_options.get('scope_types', []),
            "validator_ids": filter_options.get('validator_ids', []),
            "mongodb_status": "connected",
            "minio_status": "connected" if minio_client else "disconnected"
        }
        
        return CombinationSelectionOptions(
            total_combinations=len(unique_combinations),
            unique_combinations=unique_combinations,
            filter_options=filter_options,
            summary=summary
        )
        
    except Exception as e:
        logger.error(f"Error fetching combinations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching combinations: {str(e)}"
        )



# In routes.py - Generic / dataset-agnostic endpoint
@router.get("/combinations/{combination_id}", response_model=SelectedCombinationDetails, tags=["Combinations"])
async def select_unique_combination(
    combination_id: str = Path(..., description="Legacy combination token (e.g., 'A_B_C'). Ignored if filters_json provided."),
    scope_name: Optional[str] = Query(None, description="Specific scope name to filter (e.g., 'Scope_1')"),
    filters_json: Optional[str] = Query(
        None,
        description="JSON dict of {column: value, ...} to identify the combination (e.g., '{\"Market\":\"ALLINDIA\",\"SKU\":\"COLA_330ML\"}')"
    ),
    key_order: Optional[str] = Query(
        "Channel,Brand,PPG",
        description="Comma-separated key order to decode legacy combination_id (used only if filters_json is not provided)"
    ),
):
    """
    Select and get detailed information about a specific combination across scopes.

    ✅ New (preferred): pass `filters_json` with arbitrary column=value pairs.
    ↩️  Legacy fallback: if `filters_json` is not provided, we parse `combination_id`
        using the comma-separated `key_order` (default: Channel,Brand,PPG).

    We match combinations by exact string equality on those columns (case-insensitive column names).
    """
    if scopes_collection is None:
        raise HTTPException(status_code=503, detail="Database connection not available.")

    # ---- build a normalized filter map (column -> value) ----
    try:
        if filters_json:
            # Preferred path: explicit mapping
            filt_map = json.loads(filters_json)
            if not isinstance(filt_map, dict) or not filt_map:
                raise ValueError("filters_json must be a non-empty JSON object")
            # normalize keys to strings
            filt_map = {str(k): v for k, v in filt_map.items()}
        else:
            # Back-compat path: parse combination_id by key_order
            parts = str(combination_id).split("_")
            keys = [k.strip() for k in str(key_order or "").split(",") if k.strip()]
            if not keys:
                raise ValueError("key_order is empty; provide filters_json or a valid key_order.")
            if len(parts) != len(keys):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot parse combination_id with provided key_order. "
                           f"Got {len(parts)} parts but {len(keys)} keys ({keys})."
                )
            filt_map = {keys[i]: parts[i] for i in range(len(keys))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid filters_json/key_order: {e}")

    try:
        # Utilities
        def _match_combo(combo_dict: Dict[str, Any], filters: Dict[str, Any]) -> bool:
            """
            Case-insensitive column matching; string equality on values.
            """
            if not isinstance(combo_dict, dict):
                return False
            # map of lower->actual key in this combo record
            lower_map = {str(k).lower(): k for k in combo_dict.keys()}
            for fk, fv in filters.items():
                lk = str(fk).lower()
                if lk not in lower_map:
                    return False
                actual_key = lower_map[lk]
                if str(combo_dict.get(actual_key)) != str(fv):
                    return False
            return True

        related_scopes = []
        file_details: List[Dict[str, Any]] = []
        minio_files: List[Dict[str, Any]] = []
        total_records = 0
        any_match = False

        async for scope_doc in scopes_collection.find():
            scope_has_combination = False
            scope_info = {
                "scope_id": scope_doc.get("scope_id"),
                "scope_name": scope_doc.get("name"),
                "scope_type": scope_doc.get("scope_type"),
                "validator_id": scope_doc.get("validator_id"),
                "matching_sets": []
            }

            for filter_set in scope_doc.get("filter_set_results", []):
                if scope_name and filter_set.get("set_name") != scope_name:
                    continue

                for combo_file in filter_set.get("combination_files", []):
                    combo = combo_file.get("combination", {}) or {}
                    if _match_combo(combo, filt_map):
                        any_match = True
                        scope_has_combination = True
                        scope_info["matching_sets"].append(filter_set.get("set_name"))

                        total_records += combo_file.get("record_count", 0)
                        file_detail = {
                            "scope_name": scope_doc.get("name"),
                            "set_name": filter_set.get("set_name"),
                            "file_key": combo_file.get("file_key"),
                            "filename": combo_file.get("filename"),
                            "record_count": combo_file.get("record_count"),
                            "start_date": filter_set.get("start_date"),
                            "end_date": filter_set.get("end_date"),
                            "combination": combo,  # include the raw combo dict for transparency
                        }
                        file_details.append(file_detail)

                        # Enrich with MinIO metadata (best-effort)
                        if minio_client and combo_file.get("file_key"):
                            try:
                                if minio_client.bucket_exists(settings.minio_bucket_name):
                                    file_info = get_file_info(combo_file["file_key"])
                                    download_url = get_presigned_url(combo_file["file_key"])
                                    minio_files.append({
                                        **file_info,
                                        "download_url": download_url,
                                        "scope_name": scope_doc.get("name"),
                                        "set_name": filter_set.get("set_name"),
                                    })
                            except Exception as e:
                                logger.warning(f"Could not get MinIO info for {combo_file.get('file_key')}: {e}")

            if scope_has_combination:
                related_scopes.append(scope_info)

        if not any_match:
            scope_msg = f" with scope '{scope_name}'" if scope_name else ""
            # Show a compact preview of what we looked for
            raise HTTPException(
                status_code=404,
                detail=f"No combination found matching {filt_map}{scope_msg}."
            )

        # Build availability summary
        date_coverage_keys = []
        for f in file_details:
            sd = f.get("start_date", "")
            ed = f.get("end_date", "")
            date_coverage_keys.append(f"{sd}_{ed}")
        date_coverage_unique = len(set(date_coverage_keys))

        return SelectedCombinationDetails(
            combination=filt_map,  # return the filter map (dataset-agnostic)
            related_scopes=related_scopes,
            total_records=total_records,
            file_details=file_details,
            minio_files=minio_files,
            data_availability={
                "total_files": len(file_details),
                "total_scopes": len(related_scopes),
                "files_in_minio": len(minio_files),
                "date_range_coverage": date_coverage_unique,
                "selected_scope": scope_name if scope_name else "all"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching combination details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching combination details: {str(e)}")



@router.get("/models/variables", response_model=ModelVariablesResponse, tags=["Models"])
async def list_variables_in_model_file(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    mode: str = Query("columns", pattern="^(columns|base)$",
                      description="Return raw beta columns ('columns') or deduped base predictor names ('base')"),
    include_intercept: bool = Query(False, description="Whether to include intercept-like beta columns"),
):
    """
    Return model variables with beta coefficients.

    Supports beta patterns:
      - Weighted_Beta_<x>
      - Beta_<x>
      - <x>_beta

    `mode='columns'`  -> raw column names that contain beta
    `mode='base'`     -> deduped base predictor names extracted from the above patterns
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    import io
    import pandas as pd
    import numpy as np

    # ---- load file (CSV first, Arrow/Feather fallback)
    try:
        obj = minio_client.get_object(settings.minio_bucket_name, file_key)
        blob = obj.read()
        obj.close()
        obj.release_conn()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO read error: {e}")

    try:
        df = pd.read_csv(io.BytesIO(blob))
    except Exception:
        try:
            import pyarrow.feather as feather
            import pyarrow.ipc as ipc
            try:
                table = feather.read_table(io.BytesIO(blob))
            except Exception:
                table = ipc.RecordBatchFileReader(io.BytesIO(blob)).read_all()
            df = table.to_pandas()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

    cols = [str(c) for c in df.columns]

    # ---- find beta columns (case-insensitive)
    beta_cols = []
    for c in cols:
        lc = c.lower()
        if "beta" in lc:
            beta_cols.append(c)

    if not include_intercept:
        # filter out common intercept names
        intercept_like = {"beta_intercept", "intercept", "const", "weighted_b0"}
        beta_cols = [c for c in beta_cols if c.lower() not in intercept_like]

    if not beta_cols:
        raise HTTPException(status_code=404, detail="No variables with beta coefficients found in the file.")

    if mode == "columns":
        variables = beta_cols
    else:
        # mode = "base": extract deduped predictor names from patterns
        bases = set()
        for c in beta_cols:
            name = str(c)
            low  = name.lower()
            if low.startswith("weighted_beta_"):
                base = name[len("Weighted_Beta_"):]
            elif low.startswith("beta_"):
                base = name[len("Beta_"):]
            elif low.endswith("_beta"):
                base = name[:-5]
            else:
                # fallback: keep original if weirdly named
                base = name
            # strip any accidental leftover whitespace
            base = base.strip()
            if not include_intercept and base.lower() in {"intercept", "const"}:
                continue
            bases.add(base)
        variables = sorted(bases)

    return ModelVariablesResponse(
        file_key=file_key,
        variables=variables,
        total_variables=len(variables)
    )




def _detect_column(cols: List[str], candidates: List[str], regex: Optional[str] = None) -> Optional[str]:
    lower = {c.lower(): c for c in cols}
    for c in candidates:
        if c.lower() in lower:
            return lower[c.lower()]
    if regex:
        pat = re.compile(regex, re.IGNORECASE)
        for c in cols:
            if pat.search(c):
                return c
    return None

def _weighted_avg_series(s: pd.Series, w: pd.Series):
    mask = s.notna() & w.notna()
    if not mask.any():
        return None
    return float(np.average(s[mask], weights=w[mask]))

def _exp_mape_weights(mape_col: pd.Series):
    # handle NaNs by excluding them from weights
    mask = mape_col.notna()
    if not mask.any():
        return None, None, None
    m = mape_col[mask]
    best = float(m.min())
    raw = np.exp(-0.5 * (m - best))
    total = float(raw.sum())
    if total == 0.0:
        # fallback: uniform
        raw = np.ones_like(m, dtype=float)
        total = float(raw.sum())
    norm = raw / total
    return pd.Series(norm, index=m.index), best, total

def _numeric_cols(df: pd.DataFrame, exclude: List[str]) -> List[str]:
    cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return [c for c in cols if c not in exclude]

@router.post("/models/weighted-ensemble", response_model=WeightedEnsembleResponse, tags=["Models"])
async def weighted_ensemble(req: WeightedEnsembleRequest):
    """
    For each categorical combination (grouping_keys), compute MAPE-based weighted averages
    across *all models* in that combo — for whatever numeric columns exist in the file.

    Weighting: w_i = exp(-0.5 * (MAPE_test_i - best_mape_in_combo))
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    # ---- load file
    try:
        resp = minio_client.get_object(settings.minio_bucket_name, req.file_key)
        blob = resp.read()
        resp.close()
        resp.release_conn()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO read error: {e}")

    # CSV first, Arrow/Feather fallback
    try:
        df = pd.read_csv(io.BytesIO(blob))
    except Exception:
        try:
            import pyarrow as pa
            import pyarrow.feather as feather
            import pyarrow.ipc as ipc
            # try feather
            try:
                table = feather.read_table(io.BytesIO(blob))
            except Exception:
                # try arrow IPC file
                table = ipc.RecordBatchFileReader(io.BytesIO(blob)).read_all()
            df = table.to_pandas()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File has no rows.")

    # ---- sanity on grouping keys
    for g in req.grouping_keys:
        if g not in df.columns:
            raise HTTPException(status_code=400, detail=f"Grouping key '{g}' not found. Columns: {df.columns.tolist()[:50]}")

    # ---- optional pre-filter
    if req.filter_criteria:
        mask = pd.Series([True] * len(df))
        for col, val in req.filter_criteria.items():
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Filter column '{col}' not in file.")
            mask &= (df[col] == val)
        df = df[mask]
        if df.empty:
            return WeightedEnsembleResponse(grouping_keys=req.grouping_keys, total_combos=0, results=[])

    # ---- detect model + mape test + fold
    model_col = _detect_column(
        df.columns.tolist(),
        ["Model", "model", "model_name", "MODEL_NAME"]
    )
    if not model_col:
        raise HTTPException(status_code=400, detail="No model column found (tried: Model, model, model_name, MODEL_NAME).")

    mape_test_col = _detect_column(
        df.columns.tolist(),
        ["MAPE Test", "MAPE_test", "test_mape", "Weighted_MAPE_Test", "MAPE"],
        regex=r"mape[^a-zA-Z0-9]*test|^mape$"
    )
    if not mape_test_col:
        raise HTTPException(status_code=400, detail="No test MAPE column found (e.g., 'MAPE Test').")

    fold_col = _detect_column(df.columns.tolist(), ["Fold", "fold"])
    group_cols = req.grouping_keys + [model_col]

    # ---- average across folds first (if Fold exists)
    if fold_col:
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # keep numeric only for aggregation
        df_avg = df.groupby(group_cols, dropna=False)[num_cols].mean().reset_index()
        # copy over non-numeric mape/model if needed (we already have mape in num_cols)
        base = df[group_cols].drop_duplicates()
        df = pd.merge(base, df_avg, on=group_cols, how="left")
    else:
        # ensure mape is numeric
        if not np.issubdtype(df[mape_test_col].dtype, np.number):
            with pd.option_context('mode.use_inf_as_na', True):
                df[mape_test_col] = pd.to_numeric(df[mape_test_col], errors="coerce")

    # ---- set up exclusions
    exclude = set(req.grouping_keys + [model_col])
    if fold_col:
        exclude.add(fold_col)

    # numeric candidates to weight
    numeric_candidates = _numeric_cols(df, exclude=list(exclude))
    if req.include_numeric:
        numeric_candidates = [c for c in numeric_candidates if c in req.include_numeric]
    if req.exclude_numeric:
        numeric_candidates = [c for c in numeric_candidates if c not in req.exclude_numeric]

    if mape_test_col not in numeric_candidates:
        numeric_candidates.append(mape_test_col)

    # ---- per-combo weighting + aggregation
    results: List[ComboResult] = []

    for combo_vals, sub in df.groupby(req.grouping_keys, dropna=False):
        # ensure DataFrame
        combo_df = sub.reset_index(drop=True)
        if combo_df.empty:
            continue

        # weights from MAPE Test
        w_series, best_mape, total_w = _exp_mape_weights(combo_df[mape_test_col])
        if w_series is None:
            # no valid mape -> skip combo
            continue

        # align weight series
        weights = w_series.reindex(combo_df.index).fillna(0.0)

        # best model
        best_idx = combo_df[mape_test_col].idxmin()
        best_model = None
        if pd.notna(best_idx):
            best_model = str(combo_df.loc[best_idx, model_col]) if model_col in combo_df.columns else None

        # weighted averages for every numeric col
        weighted_dict: Dict[str, Optional[float]] = {}
        for col in numeric_candidates:
            val = _weighted_avg_series(combo_df[col], weights)
            weighted_dict[col] = None if val is None else float(val)

        # convenience aliases (if those columns exist)
        def pick_alias(*cols):
            for c in cols:
                if c in weighted_dict and weighted_dict[c] is not None:
                    return weighted_dict[c]
            return None

        aliases = {
            "elasticity": pick_alias("Weighted_Elasticity", "SelfElasticity", "Elasticity"),
            "mape_test": pick_alias(mape_test_col),
            "mape_train": pick_alias("MAPE Train", "MAPE_train", "Weighted_MAPE_Train"),
            "r2_test": pick_alias("R2 Test", "r2_test", "Weighted_R2_Test", "R2"),
            "r2_train": pick_alias("R2 Train", "r2_train", "Weighted_R2_Train"),
            "b0": pick_alias("Weighted_B0", "B0 (Original)", "Intercept", "Beta_Intercept"),
        }

        # model composition by weight
        comp = combo_df[[model_col]].copy()
        comp["w"] = weights.values
        model_shares = comp.groupby(model_col)["w"].sum()
        model_comp = {str(k): float(v) for k, v in model_shares.items()}
        weight_conc = float(max(model_comp.values())) if model_comp else None

        # optional Y_Pred_at_Mean when we have Weighted_B0 + Weighted_Beta_* + Mean_*
        y_pred_at_mean = None
        try:
            b0 = aliases["b0"]
            if b0 is not None:
                # assemble features
                beta_cols = [c for c in weighted_dict.keys() if c.startswith("Beta_") or c.startswith("Weighted_Beta_")]
                # normalize to Weighted_Beta_<feat>
                beta_map = {}
                for c in beta_cols:
                    if c.startswith("Weighted_Beta_"):
                        feat = c.replace("Weighted_Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                    elif c.startswith("Beta_"):
                        feat = c.replace("Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                # mean columns
                mean_cols = {c.replace("Mean_", ""): weighted_dict[c]
                             for c in weighted_dict.keys() if c.startswith("Mean_")}
                # compute only over intersection
                s = float(b0)
                used = False
                for feat, beta in beta_map.items():
                    if beta is None:
                        continue
                    if feat in mean_cols and mean_cols[feat] is not None:
                        s += float(beta) * float(mean_cols[feat])
                        used = True
                if used:
                    y_pred_at_mean = s
        except Exception:
            y_pred_at_mean = None

        # combo dict
        if isinstance(combo_vals, tuple):
            combo_dict = {k: v for k, v in zip(req.grouping_keys, combo_vals)}
        else:
            combo_dict = {req.grouping_keys[0]: combo_vals}

        results.append(ComboResult(
            combo=combo_dict,
            models_used=int(len(combo_df)),
            best_model=best_model,
            best_mape=(None if best_mape is None else float(best_mape)),
            weight_concentration=weight_conc,
            model_composition=model_comp,
            weighted=weighted_dict,
            aliases=aliases,
            y_pred_at_mean=(None if y_pred_at_mean is None else float(y_pred_at_mean))
        ))

    return WeightedEnsembleResponse(
        grouping_keys=req.grouping_keys,
        total_combos=len(results),
        results=results
    )


@router.post("/models/filter", response_model=List[FilteredModel], tags=["Models"])
async def filter_models_by_variable_and_metrics(filter_req: ModelFilterRequest):
    """
    Filter models using a selected variable (column) and metric ranges.
    Returns model name and self-elasticity for that variable.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(settings.minio_bucket_name, filter_req.file_key)
        df = pd.read_csv(io.BytesIO(response.read()))
        response.close()
        response.release_conn()

        # Check if the selected variable (column) exists
        if filter_req.variable not in df.columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Variable '{filter_req.variable}' not found in file columns. Available columns: {list(df.columns)[:20]}..."
            )

        # Check for model column with flexible naming
        model_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_column = col_name
                break
        
        if not model_column:
            raise HTTPException(
                status_code=400,
                detail=f"No model identifier column found. Expected one of: {possible_model_columns}. Found columns: {list(df.columns)[:20]}..."
            )

        # Log the detected model column for debugging
        logger.info(f"Using model column: {model_column}")

        # Prepare a DataFrame with model column and the selected variable's value
        columns_to_select = [model_column, filter_req.variable]
        
        # Add metric columns if they exist
        metric_columns = ['MAPE', 'Test_R2', 'SelfElasticity', 'R2', 'r2', 'Test_r2']
        existing_metric_columns = []
        
        for col in metric_columns:
            if col in df.columns:
                columns_to_select.append(col)
                existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            filter_req.variable: 'selected_variable_value'
        })

        # Apply metric filters based on what exists
        # MAPE filtering
        mape_col = None
        for col in ['MAPE', 'mape', 'Mape']:
            if col in existing_metric_columns:
                mape_col = col
                break
        
        if mape_col and mape_col in filtered.columns:
            if filter_req.min_mape is not None:
                filtered = filtered[filtered[mape_col] >= filter_req.min_mape]
            if filter_req.max_mape is not None:
                filtered = filtered[filtered[mape_col] <= filter_req.max_mape]
        
        # R2 filtering
        r2_col = None
        for col in ['Test_R2', 'R2', 'r2', 'Test_r2']:
            if col in existing_metric_columns:
                r2_col = col
                break
                
        if r2_col and r2_col in filtered.columns:
            if filter_req.min_r2 is not None:
                filtered = filtered[filtered[r2_col] >= filter_req.min_r2]
            if filter_req.max_r2 is not None:
                filtered = filtered[filtered[r2_col] <= filter_req.max_r2]
        
        # Filter by the selected variable's values (self-elasticity)
        if filter_req.min_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] >= filter_req.min_self_elasticity]
        if filter_req.max_self_elasticity is not None:
            filtered = filtered[filtered['selected_variable_value'] <= filter_req.max_self_elasticity]

        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])

        # Prepare response
        result = [
            FilteredModel(
                model_name=str(row["model_name"]),  # Convert to string to handle any data type
                self_elasticity=float(row["selected_variable_value"])  # Ensure it's a float
            )
            for _, row in filtered.iterrows()
        ]
        
        if not result:
            # Provide more helpful error message
            total_models = len(df)
            filtered_by_metrics = len(filtered)
            raise HTTPException(
                status_code=404, 
                detail=f"No models found matching the criteria. Total models: {total_models}, After filtering: {filtered_by_metrics}"
            )
        
        logger.info(f"Found {len(result)} models matching the criteria")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_detail = f"Error processing file: {str(e)}\nTraceback: {traceback.format_exc()}"
        logger.error(error_detail)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")



# --------------------------------
# helpers (self-contained)
# --------------------------------
def _detect_col(cols, *candidates):
    m = {str(c).lower(): c for c in cols}
    for c in candidates:
        if str(c).lower() in m:
            return m[str(c).lower()]
    return None

def _pick_best_row(hit_df: pd.DataFrame) -> pd.Series:
    """Choose the row with the smallest test MAPE if possible; else the first row."""
    mape_candidates = ["Weighted_MAPE_Test", "MAPE Test", "MAPE_test", "test_mape", "MAPE"]
    for c in mape_candidates:
        col = _detect_col(hit_df.columns, c)
        if col:
            s = pd.to_numeric(hit_df[col], errors="coerce")
            idx = s.idxmin()
            if pd.notna(idx):
                return hit_df.loc[idx]
    return hit_df.iloc[0]

def _first_present_value(candidates, row: pd.Series):
    for c in candidates:
        if c in row.index and not pd.isna(row[c]):
            return c
    return None

def _parse_xvars(xvars_cell):
    if xvars_cell is None or (isinstance(xvars_cell, float) and pd.isna(xvars_cell)):
        return None
    if isinstance(xvars_cell, list):
        return [str(x).strip() for x in xvars_cell]
    s = str(xvars_cell).strip()
    if not s:
        return None
    try:
        v = json.loads(s)
        if isinstance(v, list):
            return [str(x).strip() for x in v]
    except Exception:
        pass
    for sep in ["|", ","]:
        if sep in s:
            return [t.strip() for t in s.split(sep) if t.strip()]
    return [s]

def _avg_for(var: str, row: pd.Series):
    # Mean_* or *_avg, fallback to raw column if present
    for c in [f"{var}_avg", f"Mean_{var}", f"mean_{var}", var]:
        if c in row and not pd.isna(row[c]):
            try:
                return float(row[c])
            except Exception:
                return float(pd.to_numeric(pd.Series([row[c]]), errors="coerce").iloc[0])
    return None

def _collect_pairs(row: pd.Series, xvar_filter=None):
    """
    Gather predictors as {variable, beta, avg} supporting:
      betas: Weighted_Beta_X, Beta_X, X_beta
      avgs : Mean_X, X_avg (fallback to X)
    """
    betas = {}

    # Weighted_Beta_X
    for col in row.index:
        name = str(col)
        low  = name.lower()
        if low.startswith("weighted_beta_") and not pd.isna(row[col]):
            base = name[len("Weighted_Beta_"):]
            betas[base] = float(row[col])

    # Beta_X
    for col in row.index:
        name = str(col)
        if name.startswith("Beta_") and not pd.isna(row[col]):
            base = name[5:]
            betas.setdefault(base, float(row[col]))

    # X_beta
    for col in row.index:
        name = str(col)
        if name.endswith("_beta") and not pd.isna(row[col]):
            base = name[:-5]
            betas.setdefault(base, float(row[col]))

    # attach averages
    pairs = {}
    for var, beta in betas.items():
        if var.lower() in ("intercept", "const", "beta_intercept"):
            continue
        avg = _avg_for(var, row)
        if avg is not None:
            pairs[var] = {"beta": float(beta), "avg": float(avg)}

    # optional filter
    if xvar_filter:
        want = {v.lower() for v in xvar_filter}
        filtered = {k: v for k, v in pairs.items() if k.lower() in want}
        if filtered:
            pairs = filtered

    return [{"variable": k, "beta": v["beta"], "avg": v["avg"]} for k, v in pairs.items()]

def _detect_intercept(row: pd.Series) -> float:
    for nm in ["Weighted_B0", "weighted_b0", "Beta_Intercept", "beta_intercept",
               "Intercept", "intercept", "const", "Const"]:
        if nm in row and not pd.isna(row[nm]):
            return float(row[nm])
    if "B0 (Original)" in row and not pd.isna(row["B0 (Original)"]):
        return float(row["B0 (Original)"])
    # Not fatal for contributions; return 0 for A-vs-P if missing
    return 0.0

def _read_minio_csv_or_arrow(bucket: str, file_key: str) -> pd.DataFrame:
    try:
        obj = minio_client.get_object(bucket, file_key)
        try:
            raw = obj.read()
        finally:
            obj.close(); obj.release_conn()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO read error: {e}")

    # CSV first
    try:
        return pd.read_csv(io.BytesIO(raw))
    except Exception:
        pass

    # Arrow/Feather fallback
    try:
        import pyarrow.feather as feather
        import pyarrow.ipc as ipc
        try:
            table = feather.read_table(io.BytesIO(raw))
        except Exception:
            table = ipc.RecordBatchFileReader(io.BytesIO(raw)).read_all()
        return table.to_pandas()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

# --------------------------------
# endpoint (schema-free)
# --------------------------------
@router.post("/models/contributions-generic", tags=["Models"])
async def calculate_model_contributions_generic(payload: dict = Body(...)):
    """
    Schema-free contributions endpoint.

    Request JSON fields (all optional except file_key):
      - file_key: str  (MinIO key for models/results file)   [REQUIRED]
      - row_index: int (select row by index)
      - model_name: str (match any model id column like 'Model', 'model_name', etc.)
      - filter_criteria: {column: value, ...} (generic equality filters)
      - source_data_file_key: str (optional, for Actual vs Predicted)
      - source_data_filters: {column: value, ...} (filters on source data)
      - y_column_hint: str (force target column name in source data)

    Returns JSON with:
      contributions list, performance metrics, and optional actual_vs_predicted block.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    file_key = payload.get("file_key")
    if not file_key:
        raise HTTPException(status_code=400, detail="file_key is required.")

    # read model/results file
    df = _read_minio_csv_or_arrow(settings.minio_bucket_name, file_key)
    if df.empty:
        raise HTTPException(status_code=400, detail="Results file has no rows.")

    # ---- choose a single row
    row = None

    # 1) row_index
    row_index = payload.get("row_index")
    if row_index is not None:
        if not isinstance(row_index, int):
            raise HTTPException(status_code=400, detail="row_index must be an integer.")
        if row_index < 0 or row_index >= len(df):
            raise HTTPException(status_code=400, detail=f"row_index {row_index} out of range (0..{len(df)-1}).")
        row = df.iloc[row_index]

    # 2) model_name
    model_name = payload.get("model_name")
    if row is None and model_name is not None:
        model_col = _detect_col(df.columns, "model_name", "Model", "model", "MODEL_NAME", "ModelName", "model_id", "Model_Name")
        if not model_col:
            raise HTTPException(status_code=400, detail="No model identifier column (e.g., 'Model', 'model_name').")
        hits = df[df[model_col] == model_name]
        if hits.empty:
            raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found.")
        row = _pick_best_row(hits)

    # 3) filter_criteria
    filter_criteria = payload.get("filter_criteria")
    if row is None and isinstance(filter_criteria, dict) and filter_criteria:
        mask = pd.Series([True] * len(df))
        for col, val in filter_criteria.items():
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Filter column '{col}' not in file.")
            mask &= (df[col] == val)
        hits = df[mask]
        if hits.empty:
            raise HTTPException(status_code=404, detail=f"No rows match filter_criteria: {filter_criteria}")
        row = _pick_best_row(hits)

    # 4) fallback: if only one row, use it
    if row is None:
        if len(df) == 1:
            row = df.iloc[0]
        else:
            raise HTTPException(status_code=400, detail="Ambiguous selection: provide row_index, model_name, or filter_criteria.")

    # ---- metrics
    def _first_val(names):
        for nm in names:
            if nm in row and not pd.isna(row[nm]):
                try:
                    return float(row[nm])
                except Exception:
                    return float(pd.to_numeric(pd.Series([row[nm]]), errors="coerce").iloc[0])
        return None

    perf = {}
    mt = _first_val(['Weighted_MAPE_Train','MAPE_train','MAPE Train','mape_train','Train_MAPE','train_mape'])
    me = _first_val(['Weighted_MAPE_Test','MAPE_test','MAPE Test','mape_test','Test_MAPE','test_mape','MAPE'])
    r2t= _first_val(['Weighted_R2_Train','R2_train','R2 Train','r2_train','Train_R2','train_r2'])
    r2e= _first_val(['Weighted_R2_Test','R2_test','R2 Test','r2_test','Test_R2','test_r2','R2'])
    if mt is not None: perf["mape_train"] = mt
    if me is not None: perf["mape_test"]  = me
    if r2t is not None: perf["r2_train"]  = r2t
    if r2e is not None: perf["r2_test"]   = r2e

    # ---- y/x hints (optional)
    y_nm = _first_present_value(['y_variable','Y_Variable','target','Target','Y','y'], row)
    y_variable_name = payload.get("y_column_hint") or (str(row[y_nm]) if y_nm else None)
    xvars_nm = _first_present_value(['x_variables','X_Variables','features','Features'], row)
    xvars = _parse_xvars(row[xvars_nm]) if xvars_nm else None

    # ---- collect (beta, avg) pairs
    pairs = _collect_pairs(row, xvar_filter=xvars)
    if not pairs:
        raise HTTPException(status_code=400, detail="No (beta, average) pairs discovered in the selected row.")

    # ---- contributions
    beta_x = []
    for p in pairs:
        cx = float(p["beta"]) * float(p["avg"])
        beta_x.append({
            "variable_name": p["variable"],
            "beta_coefficient": float(p["beta"]),
            "average_value": float(p["avg"]),
            "contribution_value": float(cx),
        })
    sum_beta_x = float(sum(d["contribution_value"] for d in beta_x))
    if sum_beta_x == 0:
        raise HTTPException(status_code=400, detail="Sum(beta*avg) is zero; cannot compute relative contributions.")

    contributions = []
    for d in beta_x:
        rel = d["contribution_value"] / sum_beta_x
        contributions.append({
            "variable_name": d["variable_name"],
            "beta_coefficient": d["beta_coefficient"],
            "average_value": d["average_value"],
            "contribution_value": d["contribution_value"],
            "relative_contribution": float(rel),
            "percentage_contribution": float(rel * 100.0),
        })
    contributions.sort(key=lambda c: abs(c["percentage_contribution"]), reverse=True)

    # ---- optional Actual vs Predicted
    actual_vs_predicted = None
    src_key = payload.get("source_data_file_key")
    if src_key:
        try:
            src_df = _read_minio_csv_or_arrow(settings.minio_source_bucket_name, src_key)
            # filters on source data
            src_filters = payload.get("source_data_filters") or {}
            if src_filters:
                mask = pd.Series([True] * len(src_df))
                for col, val in src_filters.items():
                    if col not in src_df.columns:
                        raise HTTPException(status_code=400, detail=f"Source filter column '{col}' not in source file.")
                    mask &= (src_df[col] == val)
                src_df = src_df[mask]
            if not len(src_df):
                raise HTTPException(status_code=404, detail="No rows after applying source_data_filters.")

            # target column
            tgt_candidates = []
            if y_variable_name:
                tgt_candidates += [y_variable_name, y_variable_name.upper(), y_variable_name.lower(), y_variable_name.capitalize()]
            tgt_candidates += ['Sales','sales','SALES','Volume','volume','Target','Y','y']
            tgt_col = _detect_col(src_df.columns, *tgt_candidates)
            if not tgt_col:
                raise HTTPException(status_code=400, detail=f"Could not detect target column (tried: {tgt_candidates[:6]}...).")

            # prediction: intercept + sum(beta * X)
            intercept = _detect_intercept(row)
            yhat = np.full(len(src_df), intercept, dtype=float)
            used_vars = 0
            for p in pairs:
                v = p["variable"]
                if v in src_df.columns:
                    yhat += float(p["beta"]) * pd.to_numeric(src_df[v], errors="coerce").fillna(0.0).values
                    used_vars += 1

            y = pd.to_numeric(src_df[tgt_col], errors="coerce").values
            mask = ~(np.isnan(y) | np.isnan(yhat))
            y, yhat = y[mask], yhat[mask]

            if len(y):
                resid = y - yhat
                rmse = float(np.sqrt(np.mean((y - yhat) ** 2)))
                mae  = float(np.mean(np.abs(y - yhat)))
                ss_res = float(np.sum((y - yhat) ** 2))
                ss_tot = float(np.sum((y - np.mean(y)) ** 2))
                r2 = float(1 - ss_res/ss_tot) if ss_tot != 0 else 0.0

                actual_vs_predicted = {
                    "mean_actual": float(np.mean(y)),
                    "mean_predicted": float(np.mean(yhat)),
                    "rmse": rmse,
                    "mae": mae,
                    "r_squared": r2,
                    "residual_stats": {
                        "mean": float(np.mean(resid)),
                        "std": float(np.std(resid, ddof=0)),
                        "min": float(np.min(resid)),
                        "max": float(np.max(resid)),
                        "q25": float(np.quantile(resid, 0.25)),
                        "median": float(np.quantile(resid, 0.50)),
                        "q75": float(np.quantile(resid, 0.75)),
                    },
                    "sample_size": int(len(y)),
                    "plot_data": {
                        "actual": y.tolist(),
                        "predicted": yhat.tolist(),
                        "residuals": resid.tolist()
                    },
                    "data_table": [{
                        "index": int(i),
                        "actual": float(y[i]),
                        "predicted": float(yhat[i]),
                        "residual": float(resid[i]),
                        "percentage_error": float((resid[i] / y[i]) * 100) if y[i] != 0 else 0.0
                    } for i in range(min(len(y), 20))]
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[contributions-generic] actual-vs-predicted skipped: {e}", exc_info=True)

    # ---- response (plain dict)
    response = {
        "model_selector": {
            "row_index": row_index,
            "model_name": model_name,
            "filter_criteria": filter_criteria
        },
        "file_key": file_key,
        "model_performance": perf,
        "total_contribution": float(sum_beta_x),
        "contributions": contributions,
        "actual_vs_predicted": actual_vs_predicted,
        "summary": {
            "total_variables": len(contributions),
            "sum_of_contributions": float(sum_beta_x),
            "top_5_contributors": [
                {"variable": c["variable_name"], "percentage": round(c["percentage_contribution"], 2)}
                for c in contributions[:5]
            ],
            "positive_contributors": len([c for c in contributions if c["contribution_value"] > 0]),
            "negative_contributors": len([c for c in contributions if c["contribution_value"] < 0]),
            "performance_summary": {
                "has_mape_train": "mape_train" in perf,
                "has_mape_test": "mape_test" in perf,
                "has_r2_train": "r2_train" in perf,
                "has_r2_test": "r2_test" in perf,
                "has_actual_vs_predicted": actual_vs_predicted is not None
            },
            "y_variable_detected": y_variable_name,
            "x_variables_used": _parse_xvars(row.get(_first_present_value(['x_variables','X_Variables','features','Features'], row))) if _first_present_value(['x_variables','X_Variables','features','Features'], row) else None
        }
    }
    return response






#############demand curve




# ---------- small helpers ----------

def _first_present(candidates, cols):
    for c in candidates:
        if c in cols:
            return c
    return None

def _collect_betas_avgs(row: pd.Series):
    """
    Parse betas & means with flexible naming:
      Betas:  Weighted_Beta_<x>, Beta_<x>, <x>_beta
      Means:  Mean_<x>, <x>_avg
    Returns (betas: dict[name->float], avgs: dict[name->float])
    """
    betas, avgs = {}, {}
    for col in row.index:
        name = str(col)
        low  = name.lower()
        val  = row[col]
        if pd.isna(val):
            continue
        # betas
        if low.startswith("weighted_beta_"):
            base = name[len("Weighted_Beta_"):]
            betas[base] = float(val)
        elif low.startswith("beta_"):
            base = name[len("Beta_"):]
            betas[base] = float(val)
        elif low.endswith("_beta"):
            base = name[:-5]
            betas[base] = float(val)
        # means
        elif low.startswith("mean_"):
            base = name[len("Mean_"):]
            avgs[base] = float(val)
        elif low.endswith("_avg"):
            base = name[:-4]
            avgs[base] = float(val)
    return betas, avgs

def _detect_intercept(row: pd.Series) -> float:
    for nm in ["Weighted_B0","weighted_b0","Beta_Intercept","beta_intercept","Intercept","intercept","const","Const"]:
        if nm in row and pd.notna(row[nm]):
            return float(row[nm])
    if "B0 (Original)" in row and pd.notna(row["B0 (Original)"]):
        return float(row["B0 (Original)"])
    raise HTTPException(status_code=400, detail="Missing intercept (Weighted_B0 / Intercept / const / B0 (Original)).")

def _find_price(betas: Dict[str, float], avgs: Dict[str, float], row: pd.Series):
    """
    Return (price_pred_name, beta_price, base_price).
    Prefers explicit Mean_PPU; else uses *_avg/Mean_* for the matched price predictor.
    Tries bases: PPU, price, unit_price, unitprice, p.
    """
    candidates = []
    for base in set(list(betas.keys()) + list(avgs.keys())):
        if base.lower() in ("ppu","price","unit_price","unitprice","p"):
            candidates.append(base)

    # strong hint: Mean_PPU exists
    if "Mean_PPU" in row.index and pd.notna(row["Mean_PPU"]):
        for guess in ("PPU","price","unit_price","unitprice","p"):
            beta = betas.get(guess) or betas.get(f"{guess}_beta")
            if beta is not None:
                return guess, float(beta), float(row["Mean_PPU"])

    # otherwise require both beta & avg for same base
    for base in candidates:
        beta = betas.get(base) or betas.get(f"{base}_beta")
        avg  = avgs.get(base)  or avgs.get(f"{base}_avg")
        if beta is not None and avg is not None:
            return base, float(beta), float(avg)

    # final broad scan
    for base in set(list(betas.keys()) + list(avgs.keys())):
        beta = betas.get(base) or betas.get(f"{base}_beta")
        avg  = avgs.get(base)  or avgs.get(f"{base}_avg")
        if beta is not None and avg is not None:
            return base, float(beta), float(avg)

    raise HTTPException(status_code=400, detail="Could not identify price variable with *_beta and Mean_*/*_avg (or Mean_PPU).")

def _is_rpi(name: str) -> bool:
    return "rpi" in name.lower()

def _load_results_from_minio(file_key: str) -> pd.DataFrame:
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")
    resp = minio_client.get_object(settings.minio_bucket_name, file_key)
    blob = resp.read()
    resp.close()
    resp.release_conn()
    # CSV first, Arrow fallback
    try:
        return pd.read_csv(io.BytesIO(blob))
    except Exception:
        try:
            import pyarrow.feather as feather
            import pyarrow.ipc as ipc
            try:
                tbl = feather.read_table(io.BytesIO(blob))
            except Exception:
                tbl = ipc.RecordBatchFileReader(io.BytesIO(blob)).read_all()
            return tbl.to_pandas()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unsupported file format (CSV/Arrow only): {e}")

def _select_row(
    df: pd.DataFrame,
    row_index: Optional[int],
    model_name: Optional[str],
    filter_criteria_json: Optional[str]
) -> pd.Series:
    # 1) by row_index
    if row_index is not None:
        if row_index < 0 or row_index >= len(df):
            raise HTTPException(status_code=400, detail=f"row_index {row_index} out of range (0..{len(df)-1}).")
        return df.iloc[row_index]

    # 2) by model_name
    if model_name:
        model_col = _first_present(['model_name','Model','model','MODEL_NAME','ModelName','model_id','Model_Name'], df.columns)
        if not model_col:
            raise HTTPException(status_code=400, detail="No model identifier column found to use model_name.")
        hit = df[df[model_col] == model_name]
        if len(hit) == 0:
            raise HTTPException(status_code=404, detail=f"model_name '{model_name}' not found.")
        if len(hit) > 1:
            raise HTTPException(status_code=400, detail=f"model_name '{model_name}' is ambiguous ({len(hit)} rows). Use row_index or filter_criteria_json.")
        return hit.iloc[0]

    # 3) by arbitrary filter criteria
    if filter_criteria_json:
        try:
            crit = json.loads(filter_criteria_json)
            if not isinstance(crit, dict):
                raise ValueError("filter_criteria_json must be a JSON object")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid filter_criteria_json: {e}")

        mask = pd.Series([True]*len(df))
        for col, val in crit.items():
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Filter column '{col}' not found in file.")
            mask &= (df[col].astype(str) == str(val))
        hit = df[mask]
        if len(hit) == 0:
            raise HTTPException(status_code=404, detail=f"No row matches filter_criteria {crit}")
        if len(hit) > 1:
            raise HTTPException(status_code=400, detail=f"Filter is not unique ({len(hit)} rows). Add more keys or use row_index.")
        return hit.iloc[0]

    # 4) single-row file fallback
    if len(df) == 1:
        return df.iloc[0]

    raise HTTPException(status_code=400, detail="Selection required. Provide one of: row_index, model_name, or filter_criteria_json (or use a single-row file).")


@router.get("/models/demand-revenue-curves", tags=["Models"])
async def generate_demand_revenue_curves(
    file_key: str = Query(..., description="MinIO file key for the model results"),
    row_index: Optional[int] = Query(None, description="0-based row index to select the model/weighted row"),
    model_name: Optional[str] = Query(None, description="Select row by model identifier (uses Model/model_name/etc.)"),
    filter_criteria_json: Optional[str] = Query(None, description="JSON object of {column: value} to uniquely select a row"),

    price_min_ratio: float = Query(0.5, gt=0.0, description="Min price as a ratio of base price"),
    price_max_ratio: float = Query(2.0, gt=0.0, description="Max price as a ratio of base price"),
    num_points: int = Query(100, ge=2, description="Number of grid points"),

    fixed_predictors_json: str = Query("{}", description="Override mean values for non-RPI predictors, e.g. {\"Display\":0.3}"),
    rpi_pc_overrides_json: str = Query("{}", description="Override competitor price Pc for RPI terms, e.g. {\"RPI_main\":87.5}")
):
    """
    Generic demand & revenue curves for a **single selected row** (single-model or weighted-ensemble).

    Model:
      q̂(P) = Intercept + β_price·P + Σ β_rpi·(P/Pc) + Σ β_other·X̄
      ε(P)  = (β_price + Σ β_rpi/Pc) * (P / q̂(P))

    - Row selection: by row_index, model_name, or filter_criteria_json (no Channel/Brand required).
    - Recognizes betas: Weighted_Beta_*, Beta_*, *_beta
      means: Mean_*, *_avg
      intercept: Weighted_B0 / Beta_Intercept / Intercept / const / B0 (Original)
    - Price variable candidates: PPU, price, unit_price, unitprice, p
      base price from Mean_PPU if available, else that variable's *_avg/Mean_*.
    - RPI Pc: base_price / Mean_RPI (if present), else override, else base_price.
    """
    if price_min_ratio >= price_max_ratio:
        raise HTTPException(status_code=400, detail="price_min_ratio must be < price_max_ratio.")

    # ---- load & select row
    df = _load_results_from_minio(file_key)
    row = _select_row(df, row_index=row_index, model_name=model_name, filter_criteria_json=filter_criteria_json)

    # ---- parse model pieces
    intercept = _detect_intercept(row)
    betas, avgs = _collect_betas_avgs(row)
    price_name, beta_price, base_price = _find_price(betas, avgs, row)

    try:
        fixed_overrides = json.loads(fixed_predictors_json or "{}") or {}
        rpi_pc_overrides = json.loads(rpi_pc_overrides_json or "{}") or {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in fixed_predictors_json or rpi_pc_overrides_json.")

    rpi_terms   = {k: betas[k] for k in betas.keys() if _is_rpi(k)}
    other_terms = {k: betas[k] for k in betas.keys() if (k not in rpi_terms and k != price_name)}

    # infer Pc for each RPI term
    Pc: Dict[str, float] = {}
    for rpi_name in rpi_terms.keys():
        if rpi_name in rpi_pc_overrides:
            Pc[rpi_name] = float(rpi_pc_overrides[rpi_name])
            continue
        rpi_mean = avgs.get(rpi_name) or avgs.get(f"{rpi_name}_avg")
        if rpi_mean and rpi_mean != 0:
            Pc[rpi_name] = float(base_price / rpi_mean)
        else:
            Pc[rpi_name] = float(base_price)

    # scenario mean for non-RPI / non-price
    def xbar(name: str) -> float:
        if name in fixed_overrides:
            return float(fixed_overrides[name])
        return float(avgs.get(name) or avgs.get(f"{name}_avg") or 0.0)

    # q̂(P)
    def q_hat(p: float) -> float:
        q = intercept + beta_price * p
        for rpi_name, beta in rpi_terms.items():
            pc = Pc.get(rpi_name, 0.0)
            q += float(beta) * (p / pc if pc else 0.0)
        for name, beta in other_terms.items():
            q += float(beta) * xbar(name)
        return max(q, 0.0)  # clamp to avoid negative volumes on extremes

    # elasticity(P) = (dQ/dP) * (P/Q), with dQ/dP constant in this linear-in-P setup
    dQdP_const = float(beta_price) + sum(float(rpi_terms[k]) / Pc[k] for k in rpi_terms.keys() if Pc.get(k))

    def elasticity(p: float) -> Optional[float]:
        q = q_hat(p)
        return (dQdP_const * p / q) if q > 0 else None

    # domain & curves
    p_min = float(base_price * price_min_ratio)
    p_max = float(base_price * price_max_ratio)
    prices = np.linspace(p_min, p_max, int(num_points))
    vols   = np.array([q_hat(p) for p in prices], dtype=float)
    revs   = prices * vols

    # baseline & optimum
    base_vol = float(q_hat(float(base_price)))
    base_rev = float(base_price * base_vol)
    opt_idx  = int(np.argmax(revs))

    # quality fields (best-effort)
    def _get_any(names):
        for n in names:
            if n in row and pd.notna(row[n]):
                return row[n]
        return None

    mape_test = _get_any(["Weighted_MAPE_Test","MAPE Test","MAPE_test","MAPE"])
    r2_test   = _get_any(["Weighted_R2_Test","R2 Test","R2_test","R2"])
    best_mod  = _get_any(["Best_Model","Model","model_name"])

    # selection summary (nice to have for debugging)
    selection = {
        "method": ("row_index" if row_index is not None else
                   "model_name" if model_name else
                   "filter_criteria_json" if filter_criteria_json else
                   "single_row_file"),
        "row_index": (int(row_index) if row_index is not None else None),
        "model_name": (str(model_name) if model_name else None),
        "filters": (json.loads(filter_criteria_json) if filter_criteria_json else None)
    }

    return {
        "selection": selection,
        "price_variable": price_name,
        "intercept": float(intercept),
        "base_price": float(base_price),
        "base_volume": float(base_vol),
        "base_revenue": float(base_rev),
        "elasticity_at_base": (float(elasticity(float(base_price))) if elasticity(float(base_price)) is not None else None),
        "rpi_competitor_prices": {k: float(v) for k, v in Pc.items()},
        "quality": {
            "mape_test": (float(mape_test) if mape_test is not None and not pd.isna(mape_test) else None),
            "r2_test":   (float(r2_test) if r2_test is not None and not pd.isna(r2_test) else None),
            "best_model": (None if best_mod is None or (isinstance(best_mod, float) and pd.isna(best_mod)) else str(best_mod)),
        },
        "curve_data": [
            {
                "price": float(p),
                "demand": float(q),
                "revenue": float(r),
                "elasticity": (float(elasticity(float(p))) if elasticity(float(p)) is not None else None)
            }
            for p, q, r in zip(prices, vols, revs)
        ],
        "optimal_revenue": {
            "price": float(prices[opt_idx]),
            "demand": float(vols[opt_idx]),
            "revenue": float(revs[opt_idx]),
            "elasticity": (float(elasticity(float(prices[opt_idx]))) if elasticity(float(prices[opt_idx])) is not None else None)
        }
    }
    
    


# Add this endpoint to routes.py
@router.post("/models/select-save-generic", response_model=SavedModelResponse, tags=["Models"])
async def select_and_save_model_generic(selection_req: GenericModelSelectionRequest):
    """
    Select a specific model from CSV results and save it to MongoDB.
    Works with any CSV structure without assuming column names.
    
    You can select a model by either:
    1. Row index (0-based)
    2. Filter criteria (dictionary of column:value pairs)
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(settings.minio_bucket_name, selection_req.file_key)
        df = pd.read_csv(io.BytesIO(response.read()))
        response.close()
        response.release_conn()
        
        # Select the row
        if selection_req.row_index is not None:
            # Select by index
            if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                )
            model_data = df.iloc[selection_req.row_index]
            
        elif selection_req.filter_criteria:
            # Select by filter criteria
            mask = pd.Series([True] * len(df))
            for col, value in selection_req.filter_criteria.items():
                if col not in df.columns:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                    )
                mask &= (df[col] == value)
            
            filtered_df = df[mask]
            if filtered_df.empty:
                raise HTTPException(
                    status_code=404,
                    detail=f"No rows found matching criteria: {selection_req.filter_criteria}"
                )
            if len(filtered_df) > 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Multiple rows ({len(filtered_df)}) found matching criteria. Please be more specific."
                )
            
            model_data = filtered_df.iloc[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="Either row_index or filter_criteria must be provided"
            )
        
        # Convert to dictionary and handle special values
        model_dict = model_data.to_dict()
        
        # Clean the data - convert numpy types and handle NaN/Inf
        cleaned_dict = {}
        for key, value in model_dict.items():
            if pd.isna(value):
                cleaned_dict[key] = None
            elif isinstance(value, (np.integer, np.floating)):
                if np.isinf(value):
                    cleaned_dict[key] = "inf" if value > 0 else "-inf"
                else:
                    cleaned_dict[key] = float(value)
            else:
                cleaned_dict[key] = value
        
        # Prepare document for MongoDB
        document = {
            # Model data (all columns from CSV)
            "model_data": cleaned_dict,
            
            # Metadata
            "model_name": selection_req.model_name or f"model_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "source_file": selection_req.file_key,
            "selection_criteria": {
                "row_index": selection_req.row_index,
                "filter_criteria": selection_req.filter_criteria
            },
            
            # User metadata
            "tags": selection_req.tags,
            "description": selection_req.description,
            
            # Timestamps
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            
            # Additional info
            "column_names": df.columns.tolist(),
            "total_rows_in_file": len(df)
        }
        
        # Save to MongoDB
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Insert the model
        result = await saved_models_collection.insert_one(document)
        
        # Create index for efficient queries
        await saved_models_collection.create_index([("created_at", -1)])
        await saved_models_collection.create_index([("tags", 1)])
        await saved_models_collection.create_index([("model_name", 1)])
        
        logger.info(f"Successfully saved model {result.inserted_id}")
        
        return SavedModelResponse(
            model_id=str(result.inserted_id),
            saved_at=document["created_at"],
            status="success",
            row_data=cleaned_dict
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving model: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error saving model: {str(e)}")


# Add endpoint to retrieve saved models
@router.get("/models/saved-generic", tags=["Models"])
async def get_saved_models_generic(
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    model_name: Optional[str] = Query(None, description="Filter by model name"),
    limit: int = Query(50, description="Maximum number of models to return"),
    skip: int = Query(0, description="Number of models to skip")
):
    """Retrieve generically saved models from MongoDB."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Build query
        query = {}
        if tags:
            query["tags"] = {"$in": tags}
        if model_name:
            query["model_name"] = {"$regex": model_name, "$options": "i"}
        
        # Get total count
        total_count = await saved_models_collection.count_documents(query)
        
        # Fetch models
        cursor = saved_models_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        models = []
        
        async for model in cursor:
            models.append({
                "model_id": str(model["_id"]),
                "model_name": model.get("model_name"),
                "tags": model.get("tags", []),
                "description": model.get("description"),
                "created_at": model["created_at"],
                "source_file": model.get("source_file"),
                "selection_criteria": model.get("selection_criteria"),
                # Include a preview of the model data
                "data_preview": {k: v for k, v in list(model["model_data"].items())[:5]}
            })
        
        return {
            "total": total_count,
            "models": models,
            "pagination": {
                "skip": skip,
                "limit": limit,
                "has_more": (skip + limit) < total_count
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving saved models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Get full model details
@router.get("/models/saved-generic/{model_id}", tags=["Models"])
async def get_saved_model_generic_by_id(
    model_id: str = Path(..., description="MongoDB ObjectId of the saved model")
):
    """Retrieve full details of a specific saved model."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Validate ObjectId
        try:
            obj_id = ObjectId(model_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid model ID format")
        
        # Fetch model
        model = await saved_models_collection.find_one({"_id": obj_id})
        
        if not model:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
        
        # Convert ObjectId to string
        model["_id"] = str(model["_id"])
        
        return model
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving model: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



# Keep other endpoints as they are
@router.get("/files/download/{file_key:path}", response_model=FileDownloadResponse, tags=["Files"])
async def get_file_download_link(file_key: str = Path(..., description="File key in MinIO")):
    """Get download link for a specific file."""
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection not available.")
    
    try:
        file_info = get_file_info(file_key)
        download_url = get_presigned_url(file_key)
        
        return FileDownloadResponse(
            file_key=file_key,
            filename=file_key.split('/')[-1],
            download_url=download_url,
            file_size=file_info.get("size"),
            last_modified=file_info.get("last_modified")
        )
        
    except Exception as e:
        logger.error(f"Error generating download link: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating download link: {str(e)}")

@router.get("/files/list", tags=["Files"])
async def list_files(
    prefix: str = Query("", description="File path prefix to filter files"),
    limit: int = Query(100, description="Maximum number of files to return")
):
    """List all files in MinIO bucket."""
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection not available.")
    
    try:
        files = list_files_in_bucket(prefix)
        files = files[:limit]
        
        return {
            "total_files": len(files),
            "files": files,
            "bucket": get_settings().minio_bucket_name,
            "prefix": prefix
        }
        
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")

@router.get("/scopes", tags=["Scopes"])
async def list_all_scopes(
    limit: int = Query(100, description="Maximum number of scopes to return"),
    offset: int = Query(0, description="Number of scopes to skip")
):
    """List all available scopes with basic information."""
    if scopes_collection is None:
        raise HTTPException(status_code=503, detail="Database connection not available.")
    
    try:
        scopes = []
        cursor = scopes_collection.find().skip(offset).limit(limit)
        
        async for scope_doc in cursor:
            scopes.append({
                "id": str(scope_doc["_id"]),
                "scope_id": scope_doc.get("scope_id"),
                "name": scope_doc.get("name"),
                "description": scope_doc.get("description"),
                "scope_type": scope_doc.get("scope_type"),
                "validator_id": scope_doc.get("validator_id"),
                "total_filter_sets": scope_doc.get("total_filter_sets"),
                "overall_filtered_records": scope_doc.get("overall_filtered_records"),
                "status": scope_doc.get("status"),
                "created_at": scope_doc.get("created_at")
            })
        
        return {
            "total_scopes": len(scopes),
            "scopes": scopes,
            "pagination": {
                "offset": offset,
                "limit": limit
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching scopes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching scopes: {str(e)}")

    
    #######################mmm


@router.get("/marketing/transformation-curves/{transform_id}", tags=["Marketing Mix Modeling"])
async def generate_transformation_curves(
    transform_id: str = Path(..., description="Transform ID from variable transformation"),
    media_variable: str = Query(..., description="Media variable to visualize (e.g., 'TV', 'Digital')"),
    input_min_ratio: float = Query(0, description="Minimum input as ratio of max historical spend"),
    input_max_ratio: float = Query(2.0, description="Maximum input as ratio of max historical spend"),
    num_points: int = Query(100, description="Number of points for curve generation")
):
    """
    Generate S-curve (transformation curve) for a specific media variable.
    Shows how raw spend is transformed using the stored transformation parameters.
    """
    try:
        # Get transformation metadata
        transform_metadata = await get_transformation_metadata(transform_id)
        
        if not transform_metadata:
            raise HTTPException(status_code=404, detail=f"Transform ID {transform_id} not found")
        
        # Check if variable is in media variables
        media_variables = transform_metadata.get("media_variables", [])
        if media_variable not in media_variables:
            raise HTTPException(
                status_code=400,
                detail=f"Variable '{media_variable}' not found in media variables. Available: {media_variables}"
            )
        
        # Get transformation parameters
        transformation_params = transform_metadata.get("transformation_params", {})
        params = transformation_params.get(media_variable, [])
        
        if not params or len(params) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Transformation parameters not found for {media_variable}"
            )
        
        growth_rate = params[0]
        carryover = params[1]
        midpoint = params[2]
        
        # Get transformation type
        transformation_type = transform_metadata.get("transformation_type", "logistic")
        
        # Get variable statistics to determine input range
        variable_stats = transform_metadata.get("variable_stats", {})
        
        # Find max value across all regions for this variable
        max_value = 0
        for combo_id, combo_stats in variable_stats.items():
            # Original variable name (not transformed)
            if media_variable in combo_stats:
                for region, stats in combo_stats[media_variable].items():
                    max_value = max(max_value, stats.get("max", 0))
        
        if max_value == 0:
            # Fallback to a reasonable default
            max_value = 1000
        
        # Generate input range
        import numpy as np
        input_min = input_min_ratio * max_value
        input_max = input_max_ratio * max_value
        input_range = np.linspace(input_min, input_max, num_points)
        
        # Apply transformation
        curve_data = []
        
        if transformation_type == "logistic":
            # Logistic S-curve transformation
            for i, x in enumerate(input_range):
                # Apply adstock transformation first
                if i == 0:
                    adstock = x * carryover
                else:
                    # Simplified adstock (without full time series)
                    adstock = x * carryover + (x * 0.5) * (1 - carryover)
                
                # Apply logistic transformation
                transformed = 1 / (1 + np.exp(-growth_rate * (adstock - midpoint)))
                
                curve_data.append({
                    "input": float(x),
                    "adstock": float(adstock),
                    "transformed": float(transformed),
                    "marginal_effect": float(growth_rate * transformed * (1 - transformed))
                })
        
        elif transformation_type == "power":
            # Power transformation
            for x in input_range:
                # Apply power transformation
                transformed = np.power(x, growth_rate)
                
                curve_data.append({
                    "input": float(x),
                    "adstock": float(x),  # No adstock in power transformation
                    "transformed": float(transformed),
                    "marginal_effect": float(growth_rate * np.power(x, growth_rate - 1))
                })
        
        # Calculate saturation metrics
        first_transformed = curve_data[0]["transformed"]
        last_transformed = curve_data[-1]["transformed"]
        mid_idx = len(curve_data) // 2
        mid_transformed = curve_data[mid_idx]["transformed"]
        
        # Find inflection point (where marginal effect is highest)
        max_marginal_idx = max(range(len(curve_data)), 
                               key=lambda i: curve_data[i]["marginal_effect"])
        
        return {
            "transform_id": transform_id,
            "media_variable": media_variable,
            "transformation_type": transformation_type,
            "parameters": {
                "growth_rate": growth_rate,
                "carryover": carryover,
                "midpoint": midpoint
            },
            "input_range": {
                "min": input_min,
                "max": input_max,
                "historical_max": max_value
            },
            "curve_data": curve_data,
            "saturation_analysis": {
                "transformation_range": {
                    "min": first_transformed,
                    "max": last_transformed,
                    "range": last_transformed - first_transformed
                },
                "inflection_point": {
                    "input": curve_data[max_marginal_idx]["input"],
                    "transformed": curve_data[max_marginal_idx]["transformed"],
                    "marginal_effect": curve_data[max_marginal_idx]["marginal_effect"]
                },
                "saturation_level": (last_transformed - mid_transformed) / (mid_transformed - first_transformed),
                "current_saturation_pct": (mid_transformed - first_transformed) / (last_transformed - first_transformed) * 100
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating transformation curves: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# Also add an endpoint to show the effect of transformation on model predictions
@router.post("/marketing/transformation-impact", tags=["Marketing Mix Modeling"])
async def analyze_transformation_impact(
    transform_id: str = Query(..., description="Transform ID"),
    model_id: int = Query(..., description="Model ID to analyze"),
    media_variable: str = Query(..., description="Media variable to analyze"),
    spend_levels: List[float] = Query(..., description="List of spend levels to evaluate")
):
    """
    Show how different spend levels translate to volume through transformation and model coefficients.
    Volume = Beta * Transformed_Value
    """
    try:
        # Get transformation metadata
        transform_metadata = await get_transformation_metadata(transform_id)
        
        # Get model results (would need to implement this)
        # This assumes you have a way to get model results by transform_id and model_id
        model_results = await get_model_by_transform_and_id(transform_id, model_id)
        
        if not model_results:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Get transformation parameters
        params = transform_metadata.get("transformation_params", {}).get(media_variable, [])
        if len(params) < 3:
            raise HTTPException(status_code=400, detail="Transformation parameters not found")
        
        growth_rate = params[0]
        carryover = params[1]
        midpoint = params[2]
        
        # Get beta coefficient for the transformed variable
        coefficients = model_results.get("coefficients", {})
        beta_key = f"{media_variable}_transformed"
        beta = coefficients.get(beta_key, 0)
        
        # Calculate impact for each spend level
        impact_data = []
        for spend in spend_levels:
            # Apply transformation (simplified)
            adstock = spend * carryover
            transformed = 1 / (1 + np.exp(-growth_rate * (adstock - midpoint)))
            
            # Calculate volume contribution
            volume_contribution = beta * transformed
            
            impact_data.append({
                "spend": spend,
                "transformed_value": transformed,
                "volume_contribution": volume_contribution,
                "roi": volume_contribution / spend if spend > 0 else 0
            })
        
        return {
            "model_id": model_id,
            "media_variable": media_variable,
            "beta_coefficient": beta,
            "transformation_params": {
                "growth_rate": growth_rate,
                "carryover": carryover,
                "midpoint": midpoint
            },
            "impact_analysis": impact_data
        }
        
    except Exception as e:
        logger.error(f"Error analyzing transformation impact: {e}")
        raise HTTPException(status_code=500, detail=str(e))





# Add this endpoint to routes.py
@router.post("/models/select-save-generic", response_model=SavedModelResponse, tags=["Models"])
async def select_and_save_model_generic(selection_req: GenericModelSelectionRequest):
    """
    Select a specific model from CSV results and save it to MongoDB.
    Works with any CSV structure without assuming column names.
    
    You can select a model by either:
    1. Row index (0-based)
    2. Filter criteria (dictionary of column:value pairs)
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Download file from MinIO
        response = minio_client.get_object(settings.minio_bucket_name, selection_req.file_key)
        df = pd.read_csv(io.BytesIO(response.read()))
        response.close()
        response.release_conn()
        
        # Select the row
        if selection_req.row_index is not None:
            # Select by index
            if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                )
            model_data = df.iloc[selection_req.row_index]
            
        elif selection_req.filter_criteria:
            # Select by filter criteria
            mask = pd.Series([True] * len(df))
            for col, value in selection_req.filter_criteria.items():
                if col not in df.columns:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                    )
                mask &= (df[col] == value)
            
            filtered_df = df[mask]
            if filtered_df.empty:
                raise HTTPException(
                    status_code=404,
                    detail=f"No rows found matching criteria: {selection_req.filter_criteria}"
                )
            if len(filtered_df) > 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Multiple rows ({len(filtered_df)}) found matching criteria. Please be more specific."
                )
            
            model_data = filtered_df.iloc[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="Either row_index or filter_criteria must be provided"
            )
        
        # Convert to dictionary and handle special values
        model_dict = model_data.to_dict()
        
        # Clean the data - convert numpy types and handle NaN/Inf
        cleaned_dict = {}
        for key, value in model_dict.items():
            if pd.isna(value):
                cleaned_dict[key] = None
            elif isinstance(value, (np.integer, np.floating)):
                if np.isinf(value):
                    cleaned_dict[key] = "inf" if value > 0 else "-inf"
                else:
                    cleaned_dict[key] = float(value)
            else:
                cleaned_dict[key] = value
        
        # Prepare document for MongoDB
        document = {
            # Model data (all columns from CSV)
            "model_data": cleaned_dict,
            
            # Metadata
            "model_name": selection_req.model_name or f"model_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "source_file": selection_req.file_key,
            "selection_criteria": {
                "row_index": selection_req.row_index,
                "filter_criteria": selection_req.filter_criteria
            },
            
            # User metadata
            "tags": selection_req.tags,
            "description": selection_req.description,
            
            # Timestamps
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            
            # Additional info
            "column_names": df.columns.tolist(),
            "total_rows_in_file": len(df)
        }
        
        # Save to MongoDB
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Insert the model
        result = await saved_models_collection.insert_one(document)
        
        # Create index for efficient queries
        await saved_models_collection.create_index([("created_at", -1)])
        await saved_models_collection.create_index([("tags", 1)])
        await saved_models_collection.create_index([("model_name", 1)])
        
        logger.info(f"Successfully saved model {result.inserted_id}")
        
        return SavedModelResponse(
            model_id=str(result.inserted_id),
            saved_at=document["created_at"],
            status="success",
            row_data=cleaned_dict
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving model: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error saving model: {str(e)}")


# Add endpoint to retrieve saved models
@router.get("/models/saved-generic", tags=["Models"])
async def get_saved_models_generic(
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    model_name: Optional[str] = Query(None, description="Filter by model name"),
    limit: int = Query(50, description="Maximum number of models to return"),
    skip: int = Query(0, description="Number of models to skip")
):
    """Retrieve generically saved models from MongoDB."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Build query
        query = {}
        if tags:
            query["tags"] = {"$in": tags}
        if model_name:
            query["model_name"] = {"$regex": model_name, "$options": "i"}
        
        # Get total count
        total_count = await saved_models_collection.count_documents(query)
        
        # Fetch models
        cursor = saved_models_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        models = []
        
        async for model in cursor:
            models.append({
                "model_id": str(model["_id"]),
                "model_name": model.get("model_name"),
                "tags": model.get("tags", []),
                "description": model.get("description"),
                "created_at": model["created_at"],
                "source_file": model.get("source_file"),
                "selection_criteria": model.get("selection_criteria"),
                # Include a preview of the model data
                "data_preview": {k: v for k, v in list(model["model_data"].items())[:5]}
            })
        
        return {
            "total": total_count,
            "models": models,
            "pagination": {
                "skip": skip,
                "limit": limit,
                "has_more": (skip + limit) < total_count
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving saved models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Get full model details
@router.get("/models/saved-generic/{model_id}", tags=["Models"])
async def get_saved_model_generic_by_id(
    model_id: str = Path(..., description="MongoDB ObjectId of the saved model")
):
    """Retrieve full details of a specific saved model."""
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Validate ObjectId
        try:
            obj_id = ObjectId(model_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid model ID format")
        
        # Fetch model
        model = await saved_models_collection.find_one({"_id": obj_id})
        
        if not model:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
        
        # Convert ObjectId to string
        model["_id"] = str(model["_id"])
        
        return model
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving model: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



# Keep other endpoints as they are
@router.get("/files/download/{file_key:path}", response_model=FileDownloadResponse, tags=["Files"])
async def get_file_download_link(file_key: str = Path(..., description="File key in MinIO")):
    """Get download link for a specific file."""
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection not available.")
    
    try:
        file_info = get_file_info(file_key)
        download_url = get_presigned_url(file_key)
        
        return FileDownloadResponse(
            file_key=file_key,
            filename=file_key.split('/')[-1],
            download_url=download_url,
            file_size=file_info.get("size"),
            last_modified=file_info.get("last_modified")
        )
        
    except Exception as e:
        logger.error(f"Error generating download link: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating download link: {str(e)}")

@router.get("/files/list", tags=["Files"])
async def list_files(
    prefix: str = Query("", description="File path prefix to filter files"),
    limit: int = Query(100, description="Maximum number of files to return")
):
    """List all files in MinIO bucket."""
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection not available.")
    
    try:
        files = list_files_in_bucket(prefix)
        files = files[:limit]
        
        return {
            "total_files": len(files),
            "files": files,
            "bucket": get_settings().minio_bucket_name,
            "prefix": prefix
        }
        
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")

@router.get("/scopes", tags=["Scopes"])
async def list_all_scopes(
    limit: int = Query(100, description="Maximum number of scopes to return"),
    offset: int = Query(0, description="Number of scopes to skip")
):
    """List all available scopes with basic information."""
    if scopes_collection is None:
        raise HTTPException(status_code=503, detail="Database connection not available.")
    
    try:
        scopes = []
        cursor = scopes_collection.find().skip(offset).limit(limit)
        
        async for scope_doc in cursor:
            scopes.append({
                "id": str(scope_doc["_id"]),
                "scope_id": scope_doc.get("scope_id"),
                "name": scope_doc.get("name"),
                "description": scope_doc.get("description"),
                "scope_type": scope_doc.get("scope_type"),
                "validator_id": scope_doc.get("validator_id"),
                "total_filter_sets": scope_doc.get("total_filter_sets"),
                "overall_filtered_records": scope_doc.get("overall_filtered_records"),
                "status": scope_doc.get("status"),
                "created_at": scope_doc.get("created_at")
            })
        
        return {
            "total_scopes": len(scopes),
            "scopes": scopes,
            "pagination": {
                "offset": offset,
                "limit": limit
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching scopes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching scopes: {str(e)}")
