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

# app/routes.py

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from typing import List, Optional
from datetime import datetime
import logging
import pandas as pd
import io, re, json
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
    get_model_by_transform_and_id  
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
    WeightedEnsembleRequest,
    ComboResult,
    WeightedEnsembleResponse,
    ModelPerformanceMetrics,
    ActualVsPredicted,
    GenericModelSelectionRequest,
    SavedModelResponse,
    SavedCombinationsStatusResponse
)

from .database import MINIO_BUCKET, MONGO_URI, MONGO_DB, OBJECT_PREFIX

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health", response_model=HealthCheck, tags=["Health"])
async def health_check():
    """Enhanced health check with detailed diagnostics."""
    health_status = await check_database_health()
    
    return HealthCheck(
        status="healthy" if all(service["status"] for service in health_status.values()) else "unhealthy",
        timestamp=datetime.now(),
        services=health_status,
        version="1.0.0",
        database_details={
            "endpoint": MONGO_URI.split('@')[1] if '@' in MONGO_URI else MONGO_URI,
            "database": MONGO_DB,
            "collection": "validator_atoms"
        },
        minio_details={
            "url": "minio:9000",
            "bucket": MINIO_BUCKET
        }
    )

@router.get("/combination-ids", tags=["Combinations"])
async def get_unique_combination_ids(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)")
):
    """
    Get unique combination_id values from a model results file.
    Returns a list of unique combination_id values for dropdown selection.
    """
    logger.info(f"🔧 COMBINATION-IDS ENDPOINT CALLED with file_key: {file_key}")
    
    if not minio_client:
        logger.error("❌ MinIO client is not available")
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Use the same pattern as merge/concat atoms - construct full path with OBJECT_PREFIX
        # Check if file_key already contains the prefix pattern
        if file_key.startswith(OBJECT_PREFIX):
            full_file_key = file_key
        else:
            full_file_key = f"{OBJECT_PREFIX}{file_key}"
        
        logger.info(f"Original file_key: {file_key}")
        logger.info(f"OBJECT_PREFIX: {OBJECT_PREFIX}")
        logger.info(f"Final full_file_key: {full_file_key}")
        response = minio_client.get_object(MINIO_BUCKET, full_file_key)
        content = response.read()
        
        # Read file based on extension (same pattern as merge/concat)
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Check if combination_id column exists - more robust detection
        combination_id_columns = []
        logger.info(f"Checking for combination_id columns in: {list(df.columns)}")
        
        for col in df.columns:
            col_lower = col.lower()
            logger.info(f"Checking column: '{col}' (lowercase: '{col_lower}')")
            
            # Check for various combination_id patterns
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                col_lower == 'combo_id' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_columns.append(col)
                logger.info(f"Found matching column: '{col}'")

        if not combination_id_columns:
            # Log available columns for debugging
            logger.info(f"Available columns in file: {list(df.columns)}")
            raise HTTPException(
                status_code=404, 
                detail=f"No combination_id column found. Available columns: {', '.join(df.columns[:10])}"
            )

        # Use the first matching column
        combination_id_col = combination_id_columns[0]
        
        # Get unique values, excluding NaN/None
        unique_values = df[combination_id_col].dropna().unique().tolist()
        
        # Convert to strings and sort
        unique_values = sorted([str(val) for val in unique_values if val is not None and str(val).strip()])
        
        if not unique_values:
            raise HTTPException(
                status_code=404,
                detail=f"No valid combination_id values found in column '{combination_id_col}'"
            )

        return {
            "file_key": file_key,
            "combination_id_column": combination_id_col,
            "unique_combination_ids": unique_values,
            "total_unique_values": len(unique_values),
            "total_rows_in_file": len(df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unique combination IDs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/contribution", tags=["Models"])
async def get_model_contribution(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get contribution for")
):
    """
    Get contribution data for a specific model and combination.
    Returns data from columns that end with _contribution for pie chart.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise HTTPException(status_code=404, detail="No model_name column found")

        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id} and model_name: {model_name}")

        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]

        # Find columns that end with _contribution
        contribution_columns = []
        for col in df.columns:
            if col.lower().endswith('_contribution'):
                contribution_columns.append(col)
        
        if not contribution_columns:
            raise HTTPException(status_code=404, detail="No contribution columns found (columns ending with _contribution)")

        # Extract contribution data
        contribution_data = []
        for col in contribution_columns:
            value = model_row[col]
            if pd.notna(value):  # Check if value is not NaN
                # Extract variable name from column (remove _contribution suffix)
                variable_name = col.replace('_contribution', '').replace('_Contribution', '')
                contribution_data.append({
                    "name": variable_name,
                    "value": float(value)
                })

        if not contribution_data:
            raise HTTPException(status_code=404, detail="No valid contribution data found")

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "contribution_data": contribution_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model contribution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/performance", tags=["Models"])
async def get_model_performance(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get performance for")
):
    """
    Get performance metrics for a specific model and combination.
    Returns mape_train, mape_test, r2_train, r2_test, aic, bic values.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Find model_name column
        model_name_column = None
        possible_model_columns = ['model_name', 'Model', 'model', 'MODEL_NAME', 'ModelName', 'model_id', 'Model_Name']
        
        for col_name in possible_model_columns:
            if col_name in df.columns:
                model_name_column = col_name
                break
        
        if not model_name_column:
            raise HTTPException(status_code=404, detail="No model_name column found")

        # Filter by combination_id and model_name
        filtered_df = df[(df[combination_id_column] == combination_id) & (df[model_name_column] == model_name)]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id} and model_name: {model_name}")

        # Get the first (and should be only) row
        model_row = filtered_df.iloc[0]

        # Define the metric columns we want to check
        metric_columns = {
            'mape_train': ['mape_train', 'MAPE_train', 'Mape_train'],
            'mape_test': ['mape_test', 'MAPE_test', 'Mape_test'],
            'r2_train': ['r2_train', 'R2_train', 'R2_Train'],
            'r2_test': ['r2_test', 'R2_test', 'R2_Test'],
            'aic': ['aic', 'AIC', 'Aic'],
            'bic': ['bic', 'BIC', 'Bic']
        }

        performance_metrics = {}
        
        for metric_name, possible_columns in metric_columns.items():
            found_value = None
            for col in possible_columns:
                if col in model_row.index:
                    value = model_row[col]
                    if pd.notna(value):  # Check if value is not NaN
                        found_value = float(value)
                        break
            
            performance_metrics[metric_name] = found_value if found_value is not None else None

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "performance_metrics": performance_metrics
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model performance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/filters", tags=["Models"])
async def get_available_filters(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    variable: str = Query(..., description="Variable name to get filters for")
):
    """
    Get available filter ranges for a specific combination and variable.
    Returns min/max values for mape_train, mape_test, r2_train, r2_test, aic, bic.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Filter by combination_id
        filtered_df = df[df[combination_id_column] == combination_id]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")

        # Define the filter columns we want to check
        filter_columns = {
            'mape_train': ['mape_train', 'MAPE_train', 'Mape_train'],
            'mape_test': ['mape_test', 'MAPE_test', 'Mape_test'],
            'r2_train': ['r2_train', 'R2_train', 'R2_Train'],
            'r2_test': ['r2_test', 'R2_test', 'R2_Test'],
            'aic': ['aic', 'AIC', 'Aic'],
            'bic': ['bic', 'BIC', 'Bic']
        }

        available_filters = {}
        
        for filter_name, possible_columns in filter_columns.items():
            found_column = None
            for col in possible_columns:
                if col in filtered_df.columns:
                    found_column = col
                    break
            
            if found_column:
                # Get min and max values, excluding NaN
                valid_values = filtered_df[found_column].dropna()
                if len(valid_values) > 0:
                    available_filters[filter_name] = {
                        'column_name': found_column,
                        'min': float(valid_values.min()),
                        'max': float(valid_values.max()),
                        'current_min': float(valid_values.min()),
                        'current_max': float(valid_values.max())
                    }

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variable": variable,
            "available_filters": available_filters,
            "total_models": len(filtered_df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting available filters: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.get("/models/variable-ranges", tags=["Models"])
async def get_variable_ranges(
    file_key: str = Query(..., description="MinIO file key for the model results file (CSV/Arrow/Feather)"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    variables: str = Query(..., description="Comma-separated list of variables"),
    method: str = Query("elasticity", description="Method type: elasticity, beta, or average")
):
    """
    Get min/max ranges for multiple variables based on the selected method.
    Returns ranges for each variable's method values (e.g., elasticity, beta, average).
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")

        # Find combination_id column
        combination_id_column = None
        for col in df.columns:
            col_lower = col.lower()
            if (col_lower == 'combination_id' or 
                col_lower == 'combo_id' or 
                col_lower == 'combinationid' or
                'combination_id' in col_lower or 
                'combo_id' in col_lower or 
                'combination' in col_lower):
                combination_id_column = col
                break
        
        if not combination_id_column:
            raise HTTPException(status_code=404, detail="No combination_id column found")

        # Filter by combination_id
        filtered_df = df[df[combination_id_column] == combination_id]
        
        if filtered_df.empty:
            raise HTTPException(status_code=404, detail=f"No data found for combination_id: {combination_id}")

        # Parse variables list
        variable_list = [v.strip() for v in variables.split(',') if v.strip()]
        
        # Handle method suffix
        method_suffix = "avg" if method.lower() == "average" else method.lower()
        
        variable_ranges = {}
        
        for variable in variable_list:
            # Look for method column with pattern: {variable}_{method}
            method_column = None
            for col in filtered_df.columns:
                if col.lower() == f"{variable.lower()}_{method_suffix}":
                    method_column = col
                    break
            
            if method_column and method_column in filtered_df.columns:
                # Get min and max values, excluding NaN
                valid_values = filtered_df[method_column].dropna()
                if len(valid_values) > 0:
                    variable_ranges[variable] = {
                        'column_name': method_column,
                        'min': float(valid_values.min()),
                        'max': float(valid_values.max()),
                        'current_min': float(valid_values.min()),
                        'current_max': float(valid_values.max())
                    }
                else:
                    variable_ranges[variable] = {
                        'column_name': method_column,
                        'min': 0.0,
                        'max': 0.0,
                        'current_min': 0.0,
                        'current_max': 0.0
                    }
            else:
                # Variable not found, provide default values
                variable_ranges[variable] = {
                    'column_name': f"{variable}_{method_suffix}",
                    'min': 0.0,
                    'max': 0.0,
                    'current_min': 0.0,
                    'current_max': 0.0
                }

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "variables": variable_list,
            "method": method,
            "variable_ranges": variable_ranges,
            "total_models": len(filtered_df)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting variable ranges: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

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

    # ---- load file (CSV first, Arrow/Feather fallback)
    try:
        obj = minio_client.get_object(MINIO_BUCKET, file_key)
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

@router.post("/models/filter-filtered", response_model=List[FilteredModel], tags=["Models"])
async def filter_models_by_variable_and_metrics_with_filters(filter_req: ModelFilterRequest):
    """
    Filter models using a selected variable (column) and metric ranges.
    This endpoint is specifically for when filters are applied.
    Returns model name and self-elasticity for that variable.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, filter_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()

        # Read file based on extension (same pattern as combination-ids endpoint)
        if filter_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filter_req.file_key}")

        # Find the method column for the selected variable
        method_column = None
        method_type = filter_req.method or "elasticity"
        logger.info(f"Looking for {method_type} column for variable: {filter_req.variable}")
        logger.info(f"Available columns: {list(df.columns)}")
        
        # Look for method column with pattern: {variable}_{method}
        # Handle special case for "average" method which uses "avg" in column names
        method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
        
        for col in df.columns:
            if col.lower() == f"{filter_req.variable.lower()}_{method_suffix}":
                method_column = col
                logger.info(f"Found {method_type} column: '{col}'")
                break
        
        if not method_column:
            expected_column = f"{filter_req.variable}_{method_suffix}"
            raise HTTPException(
                status_code=400, 
                detail=f"No {method_type} column found for variable '{filter_req.variable}'. Expected column: '{expected_column}'. Available columns: {list(df.columns)[:20]}..."
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

        # Prepare a DataFrame with model column and the method column
        columns_to_select = [model_column, method_column]
        
        # Add combination_id column if filtering by combination
        combination_id_column = None
        if filter_req.combination_id:
            # Find combination_id column
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    logger.info(f"Found combination_id column: '{col}'")
                    break
            
            if combination_id_column:
                columns_to_select.append(combination_id_column)
            else:
                logger.warning(f"Combination ID filtering requested but no combination_id column found")
        
        # Add metric columns if they exist
        metric_columns = ['MAPE', 'Test_R2', 'SelfElasticity', 'R2', 'r2', 'Test_r2', 'mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic', 'AIC', 'BIC']
        existing_metric_columns = []
        
        for col in metric_columns:
            if col in df.columns:
                columns_to_select.append(col)
                existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Filter by combination_id if specified
        if filter_req.combination_id and combination_id_column:
            logger.info(f"Filtering by combination_id: {filter_req.combination_id}")
            filtered = filtered[filtered[combination_id_column] == filter_req.combination_id]
            logger.info(f"After combination filtering: {len(filtered)} rows")
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            method_column: 'selected_variable_value'
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

        # MAPE Train filtering
        mape_train_col = None
        for col in ['mape_train', 'MAPE_train', 'Mape_train']:
            if col in existing_metric_columns:
                mape_train_col = col
                break
        
        if mape_train_col and mape_train_col in filtered.columns:
            if filter_req.min_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] >= filter_req.min_mape_train]
            if filter_req.max_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] <= filter_req.max_mape_train]

        # MAPE Test filtering
        mape_test_col = None
        for col in ['mape_test', 'MAPE_test', 'Mape_test']:
            if col in existing_metric_columns:
                mape_test_col = col
                break
        
        if mape_test_col and mape_test_col in filtered.columns:
            if filter_req.min_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] >= filter_req.min_mape_test]
            if filter_req.max_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] <= filter_req.max_mape_test]

        # R2 Train filtering
        r2_train_col = None
        for col in ['r2_train', 'R2_train', 'R2_Train']:
            if col in existing_metric_columns:
                r2_train_col = col
                break
        
        if r2_train_col and r2_train_col in filtered.columns:
            if filter_req.min_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] >= filter_req.min_r2_train]
            if filter_req.max_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] <= filter_req.max_r2_train]

        # R2 Test filtering
        r2_test_col = None
        for col in ['r2_test', 'R2_test', 'R2_Test']:
            if col in existing_metric_columns:
                r2_test_col = col
                break
        
        if r2_test_col and r2_test_col in filtered.columns:
            if filter_req.min_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] >= filter_req.min_r2_test]
            if filter_req.max_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] <= filter_req.max_r2_test]

        # AIC filtering
        aic_col = None
        for col in ['aic', 'AIC', 'Aic']:
            if col in existing_metric_columns:
                aic_col = col
                break
        
        if aic_col and aic_col in filtered.columns:
            if filter_req.min_aic is not None:
                filtered = filtered[filtered[aic_col] >= filter_req.min_aic]
            if filter_req.max_aic is not None:
                filtered = filtered[filtered[aic_col] <= filter_req.max_aic]

        # BIC filtering
        bic_col = None
        for col in ['bic', 'BIC', 'Bic']:
            if col in existing_metric_columns:
                bic_col = col
                break
        
        if bic_col and bic_col in filtered.columns:
            if filter_req.min_bic is not None:
                filtered = filtered[filtered[bic_col] >= filter_req.min_bic]
            if filter_req.max_bic is not None:
                filtered = filtered[filtered[bic_col] <= filter_req.max_bic]

        # Per-variable filtering for multiple variables
        if filter_req.variable_filters:
            for variable_name, variable_filter in filter_req.variable_filters.items():
                # For the current variable being processed, filter by selected_variable_value
                # For other variables, we need to find their specific columns
                if variable_name.lower() == filter_req.variable.lower():
                    # This is the current variable being processed
                    # Filter by selected_variable_value column
                    min_val = variable_filter.get('min')
                    max_val = variable_filter.get('max')
                    
                    if min_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] >= min_val]
                    if max_val is not None:
                        filtered = filtered[filtered['selected_variable_value'] <= max_val]
                else:
                    # This is a different variable, need to find its specific column
                    var_method_column = None
                    method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
                    
                    # Try exact match first
                    for col in df.columns:
                        if col.lower() == f"{variable_name.lower()}_{method_suffix}":
                            var_method_column = col
                            break
                    
                    # If not found, try case-insensitive partial match
                    if not var_method_column:
                        for col in df.columns:
                            col_lower = col.lower()
                            if (variable_name.lower() in col_lower and method_suffix in col_lower):
                                var_method_column = col
                                break
                    
                    if var_method_column and var_method_column in filtered.columns:
                        min_val = variable_filter.get('min')
                        max_val = variable_filter.get('max')
                        
                        if min_val is not None:
                            filtered = filtered[filtered[var_method_column] >= min_val]
                        if max_val is not None:
                            filtered = filtered[filtered[var_method_column] <= max_val]

        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])

        # Filter out ensemble models
        filtered = filtered[~filtered['model_name'].str.lower().str.contains('ensemble', na=False)]

        # Prepare response
        result = []
        for _, row in filtered.iterrows():
            model_data = {
                "model_name": str(row["model_name"]),  # Convert to string to handle any data type
                "self_elasticity": float(row["selected_variable_value"])  # Ensure it's a float
            }
            
            # Add method-specific field based on the method type
            if method_type == "beta":
                model_data["self_beta"] = float(row["selected_variable_value"])
            elif method_type == "average":
                model_data["self_avg"] = float(row["selected_variable_value"])
            
            result.append(FilteredModel(**model_data))
        
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

@router.post("/models/filter", response_model=List[FilteredModel], tags=["Models"])
async def filter_models_by_variable_and_metrics(filter_req: ModelFilterRequest):
    """
    Filter models using a selected variable (column) and metric ranges.
    This endpoint is for initial data fetch without filters applied.
    Returns model name and self-elasticity for that variable.
    """
    if not minio_client:
        raise HTTPException(status_code=503, detail="MinIO connection is not available.")

    try:
        # Download file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, filter_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()

        # Read file based on extension (same pattern as combination-ids endpoint)
        if filter_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            logger.info(f"Successfully read CSV file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
            logger.info(f"Successfully read Excel file. Columns: {list(df.columns)}")
        elif filter_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            logger.info(f"Successfully read Arrow file. Columns: {list(df.columns)}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filter_req.file_key}")

        # Find the method column for the selected variable
        method_column = None
        method_type = filter_req.method or "elasticity"
        logger.info(f"Looking for {method_type} column for variable: {filter_req.variable}")
        logger.info(f"Available columns: {list(df.columns)}")
        
        # Look for method column with pattern: {variable}_{method}
        # Handle special case for "average" method which uses "avg" in column names
        method_suffix = "avg" if method_type.lower() == "average" else method_type.lower()
        
        for col in df.columns:
            if col.lower() == f"{filter_req.variable.lower()}_{method_suffix}":
                method_column = col
                logger.info(f"Found {method_type} column: '{col}'")
                break
        
        if not method_column:
            expected_column = f"{filter_req.variable}_{method_suffix}"
            raise HTTPException(
                status_code=400, 
                detail=f"No {method_type} column found for variable '{filter_req.variable}'. Expected column: '{expected_column}'. Available columns: {list(df.columns)[:20]}..."
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

        # Prepare a DataFrame with model column and the method column
        columns_to_select = [model_column, method_column]
        
        # Add combination_id column if filtering by combination
        combination_id_column = None
        if filter_req.combination_id:
            # Find combination_id column
            for col in df.columns:
                col_lower = col.lower()
                if (col_lower == 'combination_id' or 
                    col_lower == 'combo_id' or 
                    col_lower == 'combinationid' or
                    'combination_id' in col_lower or 
                    'combo_id' in col_lower or 
                    'combination' in col_lower):
                    combination_id_column = col
                    logger.info(f"Found combination_id column: '{col}'")
                    break
            
            if combination_id_column:
                columns_to_select.append(combination_id_column)
            else:
                logger.warning(f"Combination ID filtering requested but no combination_id column found")
        
        # Add metric columns if they exist
        metric_columns = ['MAPE', 'Test_R2', 'SelfElasticity', 'R2', 'r2', 'Test_r2', 'mape_train', 'mape_test', 'r2_train', 'r2_test', 'aic', 'bic', 'AIC', 'BIC']
        existing_metric_columns = []
        
        for col in metric_columns:
            if col in df.columns:
                columns_to_select.append(col)
                existing_metric_columns.append(col)
        
        # Select only the columns we need
        filtered = df[columns_to_select].copy()
        
        # Filter by combination_id if specified
        if filter_req.combination_id and combination_id_column:
            logger.info(f"Filtering by combination_id: {filter_req.combination_id}")
            filtered = filtered[filtered[combination_id_column] == filter_req.combination_id]
            logger.info(f"After combination filtering: {len(filtered)} rows")
        
        # Rename columns for consistent processing
        filtered = filtered.rename(columns={
            model_column: 'model_name',
            method_column: 'selected_variable_value'
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

        # MAPE Train filtering
        mape_train_col = None
        for col in ['mape_train', 'MAPE_train', 'Mape_train']:
            if col in existing_metric_columns:
                mape_train_col = col
                break
        
        if mape_train_col and mape_train_col in filtered.columns:
            if filter_req.min_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] >= filter_req.min_mape_train]
            if filter_req.max_mape_train is not None:
                filtered = filtered[filtered[mape_train_col] <= filter_req.max_mape_train]

        # MAPE Test filtering
        mape_test_col = None
        for col in ['mape_test', 'MAPE_test', 'Mape_test']:
            if col in existing_metric_columns:
                mape_test_col = col
                break
        
        if mape_test_col and mape_test_col in filtered.columns:
            if filter_req.min_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] >= filter_req.min_mape_test]
            if filter_req.max_mape_test is not None:
                filtered = filtered[filtered[mape_test_col] <= filter_req.max_mape_test]

        # R2 Train filtering
        r2_train_col = None
        for col in ['r2_train', 'R2_train', 'R2_Train']:
            if col in existing_metric_columns:
                r2_train_col = col
                break
        
        if r2_train_col and r2_train_col in filtered.columns:
            if filter_req.min_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] >= filter_req.min_r2_train]
            if filter_req.max_r2_train is not None:
                filtered = filtered[filtered[r2_train_col] <= filter_req.max_r2_train]

        # R2 Test filtering
        r2_test_col = None
        for col in ['r2_test', 'R2_test', 'R2_Test']:
            if col in existing_metric_columns:
                r2_test_col = col
                break
        
        if r2_test_col and r2_test_col in filtered.columns:
            if filter_req.min_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] >= filter_req.min_r2_test]
            if filter_req.max_r2_test is not None:
                filtered = filtered[filtered[r2_test_col] <= filter_req.max_r2_test]

        # AIC filtering
        aic_col = None
        for col in ['aic', 'AIC', 'Aic']:
            if col in existing_metric_columns:
                aic_col = col
                break
        
        if aic_col and aic_col in filtered.columns:
            if filter_req.min_aic is not None:
                filtered = filtered[filtered[aic_col] >= filter_req.min_aic]
            if filter_req.max_aic is not None:
                filtered = filtered[filtered[aic_col] <= filter_req.max_aic]

        # BIC filtering
        bic_col = None
        for col in ['bic', 'BIC', 'Bic']:
            if col in existing_metric_columns:
                bic_col = col
                break
        
        if bic_col and bic_col in filtered.columns:
            if filter_req.min_bic is not None:
                filtered = filtered[filtered[bic_col] >= filter_req.min_bic]
            if filter_req.max_bic is not None:
                filtered = filtered[filtered[bic_col] <= filter_req.max_bic]

        # Remove rows with NaN values in critical columns
        filtered = filtered.dropna(subset=['model_name', 'selected_variable_value'])

        # Filter out ensemble models
        filtered = filtered[~filtered['model_name'].str.lower().str.contains('ensemble', na=False)]

        # Prepare response
        result = []
        for _, row in filtered.iterrows():
            model_data = {
                "model_name": str(row["model_name"]),  # Convert to string to handle any data type
                "self_elasticity": float(row["selected_variable_value"])  # Ensure it's a float
            }
            
            # Add method-specific field based on the method type
            if method_type == "beta":
                model_data["self_beta"] = float(row["selected_variable_value"])
            elif method_type == "average":
                model_data["self_avg"] = float(row["selected_variable_value"])
            
            result.append(FilteredModel(**model_data))
        
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

@router.post("/models/select-save-generic", response_model=SavedModelResponse, tags=["Models"])
async def select_and_save_model_generic(selection_req: GenericModelSelectionRequest):
    """
    Select a specific model from CSV results and save it to MongoDB.
    Also adds a 'selected_models' column to the source file indicating which combinations were selected.
    
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
        response = minio_client.get_object(MINIO_BUCKET, selection_req.file_key)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Read file based on extension
        if selection_req.file_key.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif selection_req.file_key.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        elif selection_req.file_key.endswith(".arrow"):
            import pyarrow as pa
            import pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {selection_req.file_key}")
        
        # Check if this is an ensemble model selection first
        is_ensemble = False
        selected_combination_id = None
        
        if selection_req.filter_criteria and 'model_name' in selection_req.filter_criteria:
            model_name = selection_req.filter_criteria['model_name']
            if 'ensemble' in model_name.lower() or model_name.lower() == 'ensemble':
                is_ensemble = True
                logger.info(f"🔍 DEBUG: Detected ensemble model selection: {model_name}")
                # For ensemble, get the combination_id from filter criteria
                if 'combination_id' in selection_req.filter_criteria:
                    selected_combination_id = selection_req.filter_criteria['combination_id']
                    logger.info(f"🔍 DEBUG: Ensemble combination_id: {selected_combination_id}")
                # For ensemble, we don't need to find existing data, we'll create new
                model_data = None
            else:
                # Select the row for non-ensemble models
                if selection_req.row_index is not None:
                    # Select by index
                    if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                        )
                    model_data = df.iloc[selection_req.row_index]
                    
                elif selection_req.filter_criteria:
                    # Select by filter criteria - use simple string comparison to avoid array issues
                    mask = pd.Series([True] * len(df))
                    for col, value in selection_req.filter_criteria.items():
                        if col not in df.columns:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                            )
                        # Convert both column and value to strings to avoid array comparison issues
                        col_str = df[col].astype(str)
                        value_str = str(value)
                        mask &= (col_str == value_str)
                    
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
        else:
            # Handle case where no model_name in filter_criteria
            if selection_req.row_index is not None:
                # Select by index
                if selection_req.row_index >= len(df) or selection_req.row_index < 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Row index {selection_req.row_index} out of range. File has {len(df)} rows."
                    )
                model_data = df.iloc[selection_req.row_index]
            
            elif selection_req.filter_criteria:
                # Select by filter criteria - use simple string comparison to avoid array issues
                mask = pd.Series([True] * len(df))
                for col, value in selection_req.filter_criteria.items():
                    if col not in df.columns:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{col}' not found in file. Available columns: {df.columns.tolist()}"
                        )
                    # Convert both column and value to strings to avoid array comparison issues
                    col_str = df[col].astype(str)
                    value_str = str(value)
                    mask &= (col_str == value_str)
                
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
        if is_ensemble:
            # For ensemble, fetch the actual ensemble metrics data
            logger.info(f"🔍 DEBUG: Fetching ensemble metrics for combination_id: {selected_combination_id}")
            
            try:
                # Create ensemble request to get weighted metrics
                from .schemas import WeightedEnsembleRequest
                ensemble_req = WeightedEnsembleRequest(
                    file_key=selection_req.file_key,
                    grouping_keys=["combination_id"],
                    filter_criteria={"combination_id": selected_combination_id}
                )
                
                logger.info(f"🔍 DEBUG: Ensemble request: {ensemble_req}")
                
                # Call the weighted ensemble endpoint to get actual metrics
                ensemble_result = await weighted_ensemble(ensemble_req)
                
                logger.info(f"🔍 DEBUG: Ensemble result: {ensemble_result}")
                logger.info(f"🔍 DEBUG: Ensemble result type: {type(ensemble_result)}")
                
                if ensemble_result and hasattr(ensemble_result, 'results') and ensemble_result.results:
                    logger.info(f"🔍 DEBUG: Number of ensemble results: {len(ensemble_result.results)}")
                    ensemble_data = ensemble_result.results[0]  # Get the first (and should be only) result
                    logger.info(f"🔍 DEBUG: Ensemble data: {ensemble_data}")
                    
                    if hasattr(ensemble_data, 'weighted'):
                        weighted_metrics = ensemble_data.weighted
                        logger.info(f"🔍 DEBUG: Found ensemble metrics: {weighted_metrics}")
                    else:
                        logger.warning(f"⚠️ WARNING: No 'weighted' attribute in ensemble data")
                        weighted_metrics = {}
                else:
                    logger.warning(f"⚠️ WARNING: No ensemble results found")
                    weighted_metrics = {}
                
                # Handle x_variables properly - convert numpy array to string
                x_vars = df['x_variables'].iloc[0] if len(df) > 0 else '[]'
                if isinstance(x_vars, (list, np.ndarray)):
                    x_vars_str = str(list(x_vars)) if isinstance(x_vars, np.ndarray) else str(x_vars)
                else:
                    x_vars_str = str(x_vars)
                
                # Create ensemble model_dict with actual metrics
                model_dict = {
                    'model_name': 'Ensemble',
                    'combination_id': selected_combination_id,
                    'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                    'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                    'x_variables': x_vars_str,
                    'mape_train': weighted_metrics.get('mape_train', 0.0),
                    'mape_test': weighted_metrics.get('mape_test', 0.0),
                    'r2_train': weighted_metrics.get('r2_train', 0.0),
                    'r2_test': weighted_metrics.get('r2_test', 0.0),
                    'aic': weighted_metrics.get('aic', 0.0),
                    'bic': weighted_metrics.get('bic', 0.0),
                    'intercept': weighted_metrics.get('intercept', 0.0),  # Use 'intercept' directly, not 'b0'
                    'n_parameters': weighted_metrics.get('n_parameters', 0),
                    'price_elasticity': weighted_metrics.get('price_elasticity', 0.0),  # Use 'price_elasticity' directly
                    'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'timestamp': datetime.now().isoformat()
                }
                
                # Add all the weighted metrics to the model_dict
                logger.info(f"🔍 DEBUG: Adding weighted metrics to model_dict. Keys: {list(weighted_metrics.keys())}")
                for key, value in weighted_metrics.items():
                    if key not in model_dict:
                        model_dict[key] = value
                        logger.info(f"🔍 DEBUG: Added {key} = {value}")
                    else:
                        logger.info(f"🔍 DEBUG: Skipped {key} (already exists in model_dict)")
                
                cleaned_dict = model_dict
                logger.info(f"🔍 DEBUG: Created ensemble model_dict with actual metrics")
                logger.info(f"🔍 DEBUG: Final model_dict keys: {list(model_dict.keys())}")
                logger.info(f"🔍 DEBUG: Final model_dict values: {model_dict}")
                    
            except Exception as e:
                logger.error(f"❌ Error fetching ensemble metrics: {str(e)}")
                # Fallback to default values if ensemble fetch fails
                x_vars = df['x_variables'].iloc[0] if len(df) > 0 else '[]'
                if isinstance(x_vars, (list, np.ndarray)):
                    x_vars_str = str(list(x_vars)) if isinstance(x_vars, np.ndarray) else str(x_vars)
                else:
                    x_vars_str = str(x_vars)
                
                model_dict = {
                    'model_name': 'Ensemble',
                    'combination_id': selected_combination_id,
                    'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                    'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                    'x_variables': x_vars_str,
                    'mape_train': 0.0,
                    'mape_test': 0.0,
                    'r2_train': 0.0,
                    'r2_test': 0.0,
                    'aic': 0.0,
                    'bic': 0.0,
                    'intercept': 0.0,
                    'n_parameters': 0,
                    'price_elasticity': 0.0,
                    'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'timestamp': datetime.now().isoformat()
                }
                cleaned_dict = model_dict
        else:
            # For regular models, process the existing data
            model_dict = model_data.to_dict()
        
        # Clean the data - convert numpy types and handle NaN/Inf
        cleaned_dict = {}
        for key, value in model_dict.items():
            try:
                # Handle arrays/lists by converting to string
                if isinstance(value, (list, np.ndarray)):
                    cleaned_dict[key] = str(value)
                elif pd.isna(value):
                    cleaned_dict[key] = None
                elif isinstance(value, (np.integer, np.floating)):
                    if np.isinf(value):
                        cleaned_dict[key] = "inf" if value > 0 else "-inf"
                    else:
                        cleaned_dict[key] = float(value)
                else:
                    cleaned_dict[key] = value
            except Exception as e:
                # If any error occurs, convert to string as fallback
                cleaned_dict[key] = str(value)
        
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
        
        # Now modify the source file to add 'selected_models' column
        try:
            # Add 'selected_models' column if it doesn't exist
            if 'selected_models' not in df.columns:
                df['selected_models'] = 'no'
            
            # First, set all rows with the same combination_id to 'no' to ensure only one 'yes' per combination
            if 'combination_id' in df.columns:
                # Find the combination_id of the selected model
                selected_combination_id = None
                if selection_req.row_index is not None:
                    selected_combination_id = df.loc[selection_req.row_index, 'combination_id']
                elif selection_req.filter_criteria and 'combination_id' in selection_req.filter_criteria:
                    selected_combination_id = selection_req.filter_criteria['combination_id']
                
                logger.info(f"🔍 DEBUG: Selected combination_id: {selected_combination_id}")
                logger.info(f"🔍 DEBUG: Filter criteria: {selection_req.filter_criteria}")
                
                if selected_combination_id is not None:
                    # Set all rows with the same combination_id to 'no'
                    rows_to_reset = df[df['combination_id'] == selected_combination_id]
                    logger.info(f"🔍 DEBUG: Rows to reset to 'no': {len(rows_to_reset)} rows with combination_id {selected_combination_id}")
                    df.loc[df['combination_id'] == selected_combination_id, 'selected_models'] = 'no'
                    logger.info(f"🔍 DEBUG: Reset completed for combination_id {selected_combination_id}")
                else:
                    logger.warning(f"⚠️ WARNING: Could not determine combination_id from request")
            
            # Now set the selected model row to 'yes'
            if selection_req.row_index is not None:
                # Select by index
                df.loc[selection_req.row_index, 'selected_models'] = 'yes'
                logger.info(f"🔍 DEBUG: Set row {selection_req.row_index} to 'yes'")
            elif selection_req.filter_criteria:
                # Check if this is an ensemble model selection
                is_ensemble = False
                if 'model_name' in selection_req.filter_criteria:
                    model_name = selection_req.filter_criteria['model_name']
                    if 'ensemble' in model_name.lower() or model_name.lower() == 'ensemble':
                        is_ensemble = True
                        logger.info(f"🔍 DEBUG: Detected ensemble model selection: {model_name}")
                
                if is_ensemble:
                    # Check if ensemble already exists for this combination
                    existing_ensemble_mask = (df['combination_id'] == selected_combination_id) & (df['model_name'] == 'Ensemble')
                    existing_ensemble_rows = df[existing_ensemble_mask]
                    
                    if len(existing_ensemble_rows) > 0:
                        # Ensemble already exists, just mark it as selected
                        df.loc[existing_ensemble_mask, 'selected_models'] = 'yes'
                        logger.info(f"🔍 DEBUG: Ensemble already exists for combination {selected_combination_id}, marked as selected")
                    else:
                        # Create new ensemble row with actual ensemble data
                        # Get the weighted metrics from the ensemble calculation
                        weighted_metrics_for_file = {}
                        if 'weighted_metrics' in locals():
                            weighted_metrics_for_file = weighted_metrics
                        elif hasattr(ensemble_data, 'weighted'):
                            weighted_metrics_for_file = ensemble_data.weighted
                        
                        ensemble_row = {
                            'Scope': df['Scope'].iloc[0] if len(df) > 0 else 'Scope_1',
                            'combination_id': selected_combination_id,
                            'y_variable': df['y_variable'].iloc[0] if len(df) > 0 else 'Volume',
                            'x_variables': df['x_variables'].iloc[0] if len(df) > 0 else '[]',
                            'model_name': 'Ensemble',
                            'mape_train': weighted_metrics_for_file.get('mape_train', 0.0),
                            'mape_test': weighted_metrics_for_file.get('mape_test', 0.0),
                            'r2_train': weighted_metrics_for_file.get('r2_train', 0.0),
                            'r2_test': weighted_metrics_for_file.get('r2_test', 0.0),
                            'aic': weighted_metrics_for_file.get('aic', 0.0),
                            'bic': weighted_metrics_for_file.get('bic', 0.0),
                            'intercept': weighted_metrics_for_file.get('intercept', 0.0),
                            'n_parameters': weighted_metrics_for_file.get('n_parameters', 0),
                            'price_elasticity': weighted_metrics_for_file.get('price_elasticity', 0.0),
                            'run_id': f"ensemble_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                            'timestamp': datetime.now().isoformat(),
                            'selected_models': 'yes'
                        }
                        
                        # Add all other columns with default values or weighted metrics
                        for col in df.columns:
                            if col not in ensemble_row:
                                # Check if this column exists in weighted metrics
                                if col in weighted_metrics_for_file:
                                    ensemble_row[col] = weighted_metrics_for_file[col]
                                else:
                                    ensemble_row[col] = 0.0 if df[col].dtype in ['float64', 'int64'] else ''
                        
                        # Append the ensemble row to the dataframe
                        df = pd.concat([df, pd.DataFrame([ensemble_row])], ignore_index=True)
                        logger.info(f"🔍 DEBUG: Added new ensemble row to dataframe")
                    
                else:
                    # Regular model selection - use filter criteria
                    mask = pd.Series([True] * len(df))
                    for col, value in selection_req.filter_criteria.items():
                        col_str = df[col].astype(str)
                        value_str = str(value)
                        mask &= (col_str == value_str)
                    
                    rows_to_select = df[mask]
                    logger.info(f"🔍 DEBUG: Rows matching filter criteria: {len(rows_to_select)} rows")
                    logger.info(f"🔍 DEBUG: Filter mask: {mask.sum()} True values")
                    
                    df.loc[mask, 'selected_models'] = 'yes'
                    logger.info(f"🔍 DEBUG: Set filtered rows to 'yes'")
            
            # Log the final state
            if 'combination_id' in df.columns:
                final_selected = df[df['selected_models'] == 'yes']
                logger.info(f"🔍 DEBUG: Final selected rows: {len(final_selected)} rows")
                for _, row in final_selected.iterrows():
                    logger.info(f"🔍 DEBUG: Selected - combination_id: {row.get('combination_id')}, model: {row.get('model_name', 'N/A')}")
            
            # Save the modified source file back to MinIO
            # logger.info(f"🔍 DEBUG: About to save file back to MinIO: {selection_req.file_key}")
            # logger.info(f"🔍 DEBUG: File type detected: {selection_req.file_key.split('.')[-1]}")
            # logger.info(f"🔍 DEBUG: DataFrame shape after modifications: {df.shape}")
            # logger.info(f"🔍 DEBUG: DataFrame columns: {df.columns.tolist()}")
            # logger.info(f"🔍 DEBUG: Sample of 'selected_models' column values: {df['selected_models'].value_counts().to_dict()}")
            
            if selection_req.file_key.endswith(".csv"):
                # Save as CSV
                csv_buffer = io.StringIO()
                df.to_csv(csv_buffer, index=False)
                csv_content = csv_buffer.getvalue().encode('utf-8')
                
                logger.info(f"🔍 DEBUG: CSV content size: {len(csv_content)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(csv_content),
                        length=len(csv_content),
                        content_type="text/csv",
                    )
                    logger.info(f"🔍 DEBUG: CSV file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for CSV: {str(minio_error)}")
                    raise
                
            elif selection_req.file_key.endswith(".xlsx"):
                # Save as Excel
                excel_buffer = io.BytesIO()
                df.to_excel(excel_buffer, index=False)
                excel_content = excel_buffer.getvalue()
                
                logger.info(f"🔍 DEBUG: Excel content size: {len(excel_content)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(excel_content),
                        length=len(excel_content),
                        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                    logger.info(f"🔍 DEBUG: Excel file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for Excel: {str(minio_error)}")
                    raise
                
            elif selection_req.file_key.endswith(".arrow"):
                # Save as Arrow
                import pyarrow as pa
                import pyarrow.ipc as ipc
                table = pa.Table.from_pandas(df)
                arrow_buffer = pa.BufferOutputStream()
                with ipc.new_file(arrow_buffer, table.schema) as writer:
                    writer.write_table(table)
                arrow_bytes = arrow_buffer.getvalue().to_pybytes()
                
                logger.info(f"🔍 DEBUG: Arrow content size: {len(arrow_bytes)} bytes")
                
                try:
                    # Verify the file exists before upload
                    try:
                        existing_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Existing file size before update: {existing_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Existing file ETag before update: {existing_obj.etag}")
                    except Exception as stat_error:
                        logger.info(f"🔍 DEBUG: File does not exist before update (will create new)")
                    
                    # Force overwrite by first removing the existing object
                    try:
                        minio_client.remove_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Removed existing file to force overwrite")
                    except Exception as remove_error:
                        logger.info(f"🔍 DEBUG: Could not remove existing file (may not exist): {str(remove_error)}")
                    
                    # Now upload the new file
                    minio_client.put_object(
                        MINIO_BUCKET,
                        selection_req.file_key,
                        data=io.BytesIO(arrow_bytes),
                        length=len(arrow_bytes),
                        content_type="application/octet-stream",
                    )
                    logger.info(f"🔍 DEBUG: Arrow file uploaded to MinIO successfully")
                    
                    # Verify the file was updated
                    try:
                        updated_obj = minio_client.stat_object(MINIO_BUCKET, selection_req.file_key)
                        logger.info(f"🔍 DEBUG: Updated file size after update: {updated_obj.size} bytes")
                        logger.info(f"🔍 DEBUG: Updated file ETag after update: {updated_obj.etag}")
                        if 'existing_obj' in locals():
                            logger.info(f"🔍 DEBUG: File size change: {updated_obj.size - existing_obj.size} bytes")
                            logger.info(f"🔍 DEBUG: ETag changed: {existing_obj.etag != updated_obj.etag}")
                        else:
                            logger.info(f"🔍 DEBUG: New file created")
                    except Exception as stat_error:
                        logger.warning(f"⚠️ WARNING: Could not verify file update: {str(stat_error)}")
                        
                except Exception as minio_error:
                    logger.error(f"❌ MinIO upload error for Arrow: {str(minio_error)}")
                    raise
            
            else:
                logger.warning(f"⚠️ WARNING: Unknown file extension, cannot save: {selection_req.file_key}")
            
            # Note: Redis cache update removed due to import issues
            # The file is successfully updated in MinIO
            
            logger.info(f"Successfully updated source file with 'selected_models' column: {selection_req.file_key}")
            
        except Exception as e:
            logger.error(f"Error updating source file with 'selected_models' column: {str(e)}")
            # Continue with MongoDB save even if file update fails
        
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

@router.get("/get-source-files", tags=["Source Files"])
async def get_source_files_from_build_config(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get source file information from build-model_featurebased_configs collection for actual vs predicted comparison"""
    try:
        # Connect to MongoDB
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        
        MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
        client = AsyncIOMotorClient(MONGO_URI)
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Extract combination file keys
        combination_file_keys = build_config.get("combination_file_keys", [])
        
        # Get actual values from source files
        actual_values_data = {}
        
        for combo_info in combination_file_keys:
            combination_name = combo_info.get("combination", "")
            file_key = combo_info.get("file_key", "")
            
            if file_key and minio_client:
                try:
                    # Get the file from MinIO
                    response = minio_client.get_object(MINIO_BUCKET, file_key)
                    file_bytes = response.read()
                    
                    # Read file based on extension
                    if file_key.lower().endswith('.parquet'):
                        df = pd.read_parquet(io.BytesIO(file_bytes))
                    elif file_key.lower().endswith(('.arrow', '.feather')):
                        df = pd.read_feather(io.BytesIO(file_bytes))
                    else:
                        # Try to read as parquet first, then fall back to arrow
                        try:
                            df = pd.read_parquet(io.BytesIO(file_bytes))
                        except:
                            df = pd.read_feather(io.BytesIO(file_bytes))
                    
                    # Get the actual values for all variables
                    actual_values = {}
                    for column in df.columns:
                        actual_values[column] = df[column].tolist()
                    
                    actual_values_data[combination_name] = {
                        "file_key": file_key,
                        "actual_values": actual_values,
                        "row_count": len(df)
                    }
                    
                except Exception as e:
                    logger.error(f"Error reading file {file_key}: {str(e)}")
                    actual_values_data[combination_name] = {
                        "file_key": file_key,
                        "error": f"Failed to read file: {str(e)}"
                    }
        
        return {
            "success": True,
            "build_config_id": document_id,
            "combination_actual_values": actual_values_data,
            "build_config_summary": {
                "run_id": build_config.get("run_id"),
                "scope_number": build_config.get("scope_number"),
                "x_variables": build_config.get("x_variables", []),
                "y_variable": build_config.get("y_variable"),
                "total_combinations": len(combination_file_keys)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting source files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting source files: {str(e)}")

@router.get("/models/actual-vs-predicted-ensemble", tags=["Ensemble Actual vs Predicted"])
async def calculate_ensemble_actual_vs_predicted(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Calculate actual vs predicted values using ensemble weighted metrics and source file data"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Connect to MongoDB to get the source file key
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        
        MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
        client = AsyncIOMotorClient(MONGO_URI)
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get the source file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No source file key found for combination '{combination_id}'"
            )
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Get the source file data
        try:
            response = minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination {combination_id}")
            
            # Get the target variable (Y variable)
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                # Try to find a numeric column that could be the target
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]  # Use first numeric column as target
            
            if not y_variable:
                raise HTTPException(status_code=400, detail="Could not identify target variable")
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Calculate predicted values using ensemble betas
            actual_values = df[y_variable].tolist()
            predicted_values = []
            
            for index, row in df.iterrows():
                predicted_value = intercept
                
                # Add contribution from each variable using ensemble betas
                for col in df.columns:
                    if col != y_variable:
                        beta_key = f"{col}_beta"
                        if beta_key in weighted_metrics:
                            x_value = row[col] if pd.notna(row[col]) else 0
                            beta_value = weighted_metrics[beta_key]
                            contribution = beta_value * x_value
                            predicted_value += contribution
                            
                            # Debug logging for first few rows
                            if index < 3:
                                logger.info(f"🔍 DEBUG: Row {index}, {col}: {x_value}, Beta_{col}: {beta_value}, Contribution: {contribution}")
                
                # Debug logging for first few predictions
                if index < 3:
                    logger.info(f"🔍 DEBUG: Row {index}, Final predicted value: {predicted_value}")
                
                predicted_values.append(predicted_value)
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                # Calculate MAPE
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "performance_metrics": {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                    "mape": mape
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')],
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating ensemble actual vs predicted: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating ensemble actual vs predicted: {str(e)}")

@router.get("/models/yoy-calculation-ensemble", tags=["Ensemble YoY Calculation"])
async def calculate_ensemble_yoy(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Calculate Year-over-Year (YoY) growth using ensemble weighted metrics and source file data"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Connect to MongoDB to get the source file key
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        
        MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
        client = AsyncIOMotorClient(MONGO_URI)
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get the source file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        source_file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_id:
                source_file_key = combo_info.get("file_key")
                break
        
        if not source_file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No source file key found for combination '{combination_id}'"
            )
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Get the source file data
        try:
            response = minio_client.get_object(MINIO_BUCKET, source_file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Filter data for the specific combination
            if "combination_id" in df.columns:
                df = df[df["combination_id"] == combination_id]
            
            if df.empty:
                raise HTTPException(status_code=404, detail=f"No data found for combination {combination_id}")
            
            # Get ensemble intercept and betas
            intercept = weighted_metrics.get("intercept", 0)
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "Invoice_Date", "Bill_Date", "Order_Date", "Month", "month", "Period", "period", "Year", "year"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise HTTPException(
                    status_code=400,
                    detail="Could not detect date column. Please ensure a date column is present."
                )
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="No valid date data found after conversion."
                )
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Need at least two calendar years in the dataset for YoY calculation."
                )
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found for year {year_first} or {year_last}."
                )
            
            # Get target variable (Y variable)
            y_variable = None
            for col in df.columns:
                if col.lower() in ['target', 'y', 'dependent', 'sales', 'volume', 'value']:
                    y_variable = col
                    break
            
            if not y_variable:
                # Try to find a numeric column that could be the target
                numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    y_variable = numeric_cols[0]  # Use first numeric column as target
            
            if not y_variable:
                raise HTTPException(status_code=400, detail="Could not identify target variable")
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using ensemble coefficients
            explained_delta = 0.0
            contributions = []
            
            # Get all variables that have betas in the ensemble results
            for key in weighted_metrics.keys():
                if key.endswith('_beta'):
                    x_var = key.replace('_beta', '')
                    if x_var in df.columns:
                        beta_value = weighted_metrics[key]
                        
                        # Calculate mean values for each year
                        x_first_mean = df_first_year[x_var].mean()
                        x_last_mean = df_last_year[x_var].mean()
                        
                        # Calculate contribution: beta * (mean_last_year - mean_first_year)
                        delta_contribution = beta_value * (x_last_mean - x_first_mean)
                        explained_delta += delta_contribution
                        
                        contributions.append({
                            "variable": x_var,
                            "beta_coefficient": beta_value,
                            "mean_year1": float(x_first_mean),
                            "mean_year2": float(x_last_mean),
                            "delta_contribution": float(delta_contribution)
                        })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            return {
                "success": True,
                "combination_name": combination_id,
                "model_name": "Ensemble",
                "file_key": source_file_key,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": weighted_metrics,
                    "x_variables": [key.replace('_beta', '') for key in weighted_metrics.keys() if key.endswith('_beta')],
                    "y_variable": y_variable
                }
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating ensemble YoY: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating ensemble YoY: {str(e)}")

@router.get("/models/contribution-ensemble", tags=["Ensemble Contribution"])
async def get_ensemble_contribution(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_id: str = Query(..., description="Client ID"),
    app_id: str = Query(..., description="App ID"),
    project_id: str = Query(..., description="Project ID"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Get contribution data for ensemble using weighted ensemble metrics"""
    try:
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # First, get the weighted ensemble data to get the ensemble betas
        ensemble_request = {
            "file_key": file_key,
            "grouping_keys": ['combination_id'],
            "filter_criteria": {"combination_id": combination_id},
            "include_numeric": None,
            "exclude_numeric": None,
            "filtered_models": None
        }
        
        # Call the weighted ensemble endpoint to get ensemble betas
        from .routes import weighted_ensemble
        ensemble_response = await weighted_ensemble(WeightedEnsembleRequest(**ensemble_request))
        
        if not ensemble_response.results or len(ensemble_response.results) == 0:
            raise HTTPException(status_code=404, detail="No ensemble data found for the given combination")
        
        ensemble_data = ensemble_response.results[0]
        weighted_metrics = ensemble_data.weighted
        
        # Debug logging to see what keys are available
        logger.info(f"🔍 DEBUG: Available weighted metrics keys: {list(weighted_metrics.keys())}")
        
        # Extract contribution data from ensemble weighted metrics
        contribution_data = []
        
        # First, try to find contribution columns
        for key in weighted_metrics.keys():
            if key.endswith('_contribution'):
                variable_name = key.replace('_contribution', '').replace('_Contribution', '')
                value = weighted_metrics[key]
                if value is not None:
                    contribution_data.append({
                        "name": variable_name,
                        "value": float(value)
                    })
        
        # If no contribution data found, try to calculate from betas and means
        if not contribution_data:
            logger.info("🔍 DEBUG: No contribution columns found, calculating from betas and means")
            
            # Get intercept and calculate contributions from betas and means
            intercept = weighted_metrics.get("intercept", 0)
            
            for key in weighted_metrics.keys():
                if key.endswith('_beta'):
                    variable_name = key.replace('_beta', '').replace('_Beta', '')
                    beta_value = weighted_metrics[key]
                    
                    # Try to find corresponding mean value
                    mean_key = f"{variable_name}_avg"
                    if mean_key in weighted_metrics:
                        mean_value = weighted_metrics[mean_key]
                        if beta_value is not None and mean_value is not None:
                            # Calculate contribution: abs(beta * mean)
                            contribution_value = abs(float(beta_value) * float(mean_value))
                            contribution_data.append({
                                "name": variable_name,
                                "value": contribution_value
                            })
                            logger.info(f"🔍 DEBUG: Calculated contribution for {variable_name}: {contribution_value}")
        
        # If still no data, try using elasticities
        if not contribution_data:
            logger.info("🔍 DEBUG: No beta contributions found, trying elasticities")
            
            for key in weighted_metrics.keys():
                if key.endswith('_elasticity'):
                    variable_name = key.replace('_elasticity', '').replace('_Elasticity', '')
                    elasticity_value = weighted_metrics[key]
                    
                    if elasticity_value is not None:
                        # Use absolute elasticity as contribution
                        contribution_value = abs(float(elasticity_value))
                        contribution_data.append({
                            "name": variable_name,
                            "value": contribution_value
                        })
                        logger.info(f"🔍 DEBUG: Using elasticity as contribution for {variable_name}: {contribution_value}")
        
        if not contribution_data:
            logger.error("🔍 DEBUG: No contribution data could be calculated from ensemble results")
            raise HTTPException(status_code=404, detail="No valid contribution data found in ensemble results")
        
        logger.info(f"🔍 DEBUG: Final contribution data: {contribution_data}")

        return {
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": "Ensemble",
            "contribution_data": contribution_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ensemble contribution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting ensemble contribution: {str(e)}")

@router.post("/actual-vs-predicted", tags=["Actual vs Predicted"])
async def calculate_actual_vs_predicted(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    combination_name: str = Query(..., description="Combination name"),
    model_name: str = Query(..., description="Model name")
):
    """Calculate actual vs predicted values using stored coefficients and actual X values"""
    try:
        # Connect to MongoDB
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        
        MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
        client = AsyncIOMotorClient(MONGO_URI)
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get model coefficients for the specified combination and model
        model_coefficients = build_config.get("model_coefficients", {})
        combination_coefficients = model_coefficients.get(combination_name, {})
        model_coeffs = combination_coefficients.get(model_name, {})
        
        if not model_coeffs:
            raise HTTPException(
                status_code=404,
                detail=f"No coefficients found for combination '{combination_name}' and model '{model_name}'"
            )
        
        # Get the file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_name:
                file_key = combo_info.get("file_key")
                break
        
        if not file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No file key found for combination '{combination_name}'"
            )
        
        # Get actual values from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        try:
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            
            # Calculate predicted values
            actual_values = df[y_variable].tolist() if y_variable in df.columns else []
            predicted_values = []
            
            # Debug logging
            logger.info(f"🔍 DEBUG: Model coefficients - intercept: {intercept}, coefficients: {coefficients}")
            logger.info(f"🔍 DEBUG: X variables: {x_variables}, Y variable: {y_variable}")
            
            for index, row in df.iterrows():
                # Calculate predicted value: intercept + sum(beta_i * x_i)
                predicted_value = intercept
                
                for x_var in x_variables:
                    beta_key = f"Beta_{x_var}"
                    if beta_key in coefficients and x_var in df.columns:
                        x_value = row[x_var]
                        beta_value = coefficients[beta_key]
                        contribution = beta_value * x_value
                        predicted_value += contribution
                        
                        # Debug logging for first few rows
                        if index < 3:
                            logger.info(f"🔍 DEBUG: Row {index}, {x_var}: {x_value}, Beta_{x_var}: {beta_value}, Contribution: {contribution}")
                
                # Debug logging for first few predictions
                if index < 3:
                    logger.info(f"🔍 DEBUG: Row {index}, Final predicted value: {predicted_value}")
                
                predicted_values.append(predicted_value)
            
            # Filter out extreme outliers that might be causing axis scaling issues
            if len(predicted_values) > 0:
                import numpy as np
                predicted_array = np.array(predicted_values)
                actual_array = np.array(actual_values)
                
                # Calculate percentiles to identify extreme outliers
                pred_99th = np.percentile(predicted_array, 99)
                pred_1st = np.percentile(predicted_array, 1)
                actual_99th = np.percentile(actual_array, 99)
                actual_1st = np.percentile(actual_array, 1)
                
                logger.info(f"🔍 DEBUG: Predicted values - 1st percentile: {pred_1st}, 99th percentile: {pred_99th}")
                logger.info(f"🔍 DEBUG: Actual values - 1st percentile: {actual_1st}, 99th percentile: {actual_99th}")
                
                # Filter out extreme outliers (beyond 99th percentile)
                filtered_data = []
                for i, (actual, predicted) in enumerate(zip(actual_values, predicted_values)):
                    if (predicted <= pred_99th and predicted >= pred_1st and 
                        actual <= actual_99th and actual >= actual_1st):
                        filtered_data.append((actual, predicted))
                
                if len(filtered_data) < len(actual_values):
                    logger.warning(f"⚠️ Filtered out {len(actual_values) - len(filtered_data)} extreme outliers")
                    actual_values = [item[0] for item in filtered_data]
                    predicted_values = [item[1] for item in filtered_data]
            
            # Calculate performance metrics
            if len(actual_values) > 0 and len(predicted_values) > 0:
                from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
                
                mae = mean_absolute_error(actual_values, predicted_values)
                mse = mean_squared_error(actual_values, predicted_values)
                rmse = mse ** 0.5
                r2 = r2_score(actual_values, predicted_values)
                
                # Calculate MAPE
                mape = 0
                if sum(actual_values) != 0:
                    mape = (sum(abs((actual - pred) / actual) for actual, pred in zip(actual_values, predicted_values) if actual != 0) / len(actual_values)) * 100
            else:
                mae = mse = rmse = r2 = mape = 0
            
            return {
                "success": True,
                "combination_name": combination_name,
                "model_name": model_name,
                "file_key": file_key,
                "actual_values": actual_values,
                "predicted_values": predicted_values,
                "performance_metrics": {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                    "mape": mape
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": coefficients,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                },
                "data_points": len(actual_values)
            }
            
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating actual vs predicted: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating actual vs predicted: {str(e)}")

@router.post("/yoy-calculation", tags=["YoY Calculation"])
async def calculate_yoy(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    combination_name: str = Query(..., description="Combination name"),
    model_name: str = Query(..., description="Model name")
):
    """Calculate Year-over-Year (YoY) growth using stored coefficients and actual X values"""
    try:
        # Connect to MongoDB
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        
        MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
        client = AsyncIOMotorClient(MONGO_URI)
        
        # Get the build configuration from MongoDB
        document_id = f"{client_name}/{app_name}/{project_name}"
        build_config = await client["trinity_prod"]["build-model_featurebased_configs"].find_one({"_id": document_id})
        
        if not build_config:
            raise HTTPException(
                status_code=404, 
                detail=f"No build configuration found for {document_id}"
            )
        
        # Get model coefficients for the specified combination and model
        model_coefficients = build_config.get("model_coefficients", {})
        combination_coefficients = model_coefficients.get(combination_name, {})
        model_coeffs = combination_coefficients.get(model_name, {})
        
        if not model_coeffs:
            raise HTTPException(
                status_code=404,
                detail=f"No coefficients found for combination '{combination_name}' and model '{model_name}'"
            )
        
        # Get the file key for this combination
        combination_file_keys = build_config.get("combination_file_keys", [])
        file_key = None
        for combo_info in combination_file_keys:
            if combo_info.get("combination") == combination_name:
                file_key = combo_info.get("file_key")
                break
        
        if not file_key:
            raise HTTPException(
                status_code=404,
                detail=f"No file key found for combination '{combination_name}'"
            )
        
        # Get actual values from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        try:
            # Get the file from MinIO
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            file_bytes = response.read()
            
            # Read file based on extension
            if file_key.lower().endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(file_bytes))
            elif file_key.lower().endswith(('.arrow', '.feather')):
                df = pd.read_feather(io.BytesIO(file_bytes))
            else:
                # Try to read as parquet first, then fall back to arrow
                try:
                    df = pd.read_parquet(io.BytesIO(file_bytes))
                except:
                    df = pd.read_feather(io.BytesIO(file_bytes))
            
            # Get coefficients and intercept
            intercept = model_coeffs.get("intercept", 0)
            coefficients = model_coeffs.get("coefficients", {})
            x_variables = model_coeffs.get("x_variables", [])
            y_variable = model_coeffs.get("y_variable", "")
            
            # Detect date column
            date_column = None
            date_columns = ["Date", "date", "Invoice_Date", "Bill_Date", "Order_Date", "Month", "month", "Period", "period", "Year", "year"]
            for col in date_columns:
                if col in df.columns:
                    date_column = col
                    break
            
            if not date_column:
                raise HTTPException(
                    status_code=400,
                    detail="Could not detect date column. Please ensure a date column is present."
                )
            
            # Convert date column to datetime
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column])
            
            if df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="No valid date data found after conversion."
                )
            
            # Get unique years and ensure we have at least 2 years
            years = sorted(df[date_column].dt.year.unique())
            if len(years) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Need at least two calendar years in the dataset for YoY calculation."
                )
            
            year_first, year_last = int(years[0]), int(years[-1])
            
            # Split data by years
            df_first_year = df[df[date_column].dt.year == year_first]
            df_last_year = df[df[date_column].dt.year == year_last]
            
            if df_first_year.empty or df_last_year.empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"No data found for year {year_first} or {year_last}."
                )
            
            # Calculate actual YoY change
            y_first_mean = df_first_year[y_variable].mean() if y_variable in df_first_year.columns else 0
            y_last_mean = df_last_year[y_variable].mean() if y_variable in df_last_year.columns else 0
            observed_delta = float(y_last_mean - y_first_mean)
            
            # Calculate explained YoY change using model coefficients
            explained_delta = 0.0
            contributions = []
            
            for x_var in x_variables:
                beta_key = f"Beta_{x_var}"
                if beta_key in coefficients and x_var in df.columns:
                    beta_value = coefficients[beta_key]
                    
                    # Calculate mean values for each year
                    x_first_mean = df_first_year[x_var].mean()
                    x_last_mean = df_last_year[x_var].mean()
                    
                    # Calculate contribution: beta * (mean_last_year - mean_first_year)
                    delta_contribution = beta_value * (x_last_mean - x_first_mean)
                    explained_delta += delta_contribution
                    
                    contributions.append({
                        "variable": x_var,
                        "beta_coefficient": beta_value,
                        "mean_year1": float(x_first_mean),
                        "mean_year2": float(x_last_mean),
                        "delta_contribution": float(delta_contribution)
                    })
            
            # Sort contributions by absolute value
            contributions.sort(key=lambda x: abs(x["delta_contribution"]), reverse=True)
            
            # Calculate residual
            residual = float(observed_delta - explained_delta)
            
            # Calculate YoY percentage change
            yoy_percentage = 0.0
            if y_first_mean != 0:
                yoy_percentage = (observed_delta / y_first_mean) * 100
            
            # Create waterfall data for visualization
            waterfall_labels = [f"Base {year_first}"] + [c["variable"] for c in contributions] + ["Residual", f"Final {year_last}"]
            waterfall_values = [y_first_mean] + [c["delta_contribution"] for c in contributions] + [residual, y_last_mean]
            
            return {
                "success": True,
                "combination_name": combination_name,
                "model_name": model_name,
                "file_key": file_key,
                "date_column_used": date_column,
                "years_used": {"year1": year_first, "year2": year_last},
                "y_variable_used": y_variable,
                "observed": {
                    "year1_mean": float(y_first_mean),
                    "year2_mean": float(y_last_mean),
                    "delta_y": observed_delta,
                    "yoy_percentage": yoy_percentage
                },
                "explanation": {
                    "explained_delta_yhat": float(explained_delta),
                    "residual": residual,
                    "contributions": contributions
                },
                "waterfall": {
                    "labels": waterfall_labels,
                    "values": waterfall_values
                },
                "model_info": {
                    "intercept": intercept,
                    "coefficients": coefficients,
                    "x_variables": x_variables,
                    "y_variable": y_variable
                }
            }
            
        except Exception as e:
            logger.error(f"Error reading file {file_key}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error reading source file: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating YoY: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating YoY: {str(e)}")

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
        resp = minio_client.get_object(MINIO_BUCKET, req.file_key)
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

    # ---- detect model + mape test + fold (do this first)
    model_col = _detect_column(
        df.columns.tolist(),
        ["Model", "model", "model_name", "MODEL_NAME"]
    )
    if not model_col:
        raise HTTPException(status_code=400, detail="No model column found (tried: Model, model, model_name, MODEL_NAME).")

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

    # ---- filter by specific models if provided
    if req.filtered_models:
        if model_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Model column '{model_col}' not found for model filtering.")
        df = df[df[model_col].isin(req.filtered_models)]
        if df.empty:
            return WeightedEnsembleResponse(grouping_keys=req.grouping_keys, total_combos=0, results=[])

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
    
    # Debug logging
    logger.info(f"🔍 DEBUG: Numeric candidates for weighting: {numeric_candidates}")
    logger.info(f"🔍 DEBUG: All columns in dataframe: {list(df.columns)}")
    logger.info(f"🔍 DEBUG: Excluded columns: {list(exclude)}")

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
        
        # Debug logging
        logger.info(f"🔍 DEBUG: Weighted dict keys: {list(weighted_dict.keys())}")
        logger.info(f"🔍 DEBUG: Weighted dict values: {weighted_dict}")

        # convenience aliases (if those columns exist)
        def pick_alias(*cols):
            for c in cols:
                if c in weighted_dict and weighted_dict[c] is not None:
                    return weighted_dict[c]
            return None

        aliases = {
            "elasticity": pick_alias("Weighted_Elasticity", "SelfElasticity", "Elasticity"),
            "mape_test": pick_alias(mape_test_col),
            "mape_train": pick_alias("MAPE Train", "MAPE_train", "Weighted_MAPE_Train", "mape_train"),
            "r2_test": pick_alias("R2 Test", "r2_test", "Weighted_R2_Test", "R2"),
            "r2_train": pick_alias("R2 Train", "r2_train", "Weighted_R2_Train"),
            "b0": pick_alias("Weighted_B0", "B0 (Original)", "Intercept", "Beta_Intercept", "intercept"),
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
                beta_cols = [c for c in weighted_dict.keys() if c.startswith("Beta_") or c.startswith("Weighted_Beta_") or c.endswith("_beta")]
                # normalize to Weighted_Beta_<feat>
                beta_map = {}
                for c in beta_cols:
                    if c.startswith("Weighted_Beta_"):
                        feat = c.replace("Weighted_Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                    elif c.startswith("Beta_"):
                        feat = c.replace("Beta_", "")
                        beta_map[feat] = weighted_dict[c]
                    elif c.endswith("_beta"):
                        feat = c.replace("_beta", "")
                        beta_map[feat] = weighted_dict[c]
                # mean columns
                mean_cols = {c.replace("Mean_", ""): weighted_dict[c]
                             for c in weighted_dict.keys() if c.startswith("Mean_")}
                # Also look for _avg columns (user's naming convention)
                avg_cols = {c.replace("_avg", ""): weighted_dict[c]
                           for c in weighted_dict.keys() if c.endswith("_avg")}
                # Merge mean and avg columns
                mean_cols.update(avg_cols)
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

@router.get("/models/saved-combinations-status", response_model=SavedCombinationsStatusResponse, tags=["Models"])
async def get_saved_combinations_status(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    atom_id: str = Query(..., description="Atom ID to filter saved models")
):
    """
    Get the status of saved combinations for a specific file and atom.
    Returns which combinations have been saved and which are still pending.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB connection is not available.")
    
    try:
        # Get all saved models for this file and atom
        saved_models_collection = db.get_collection("saved_models_generic")
        
        # Find models saved by this atom for this file
        saved_models = await saved_models_collection.find({
            "source_file": file_key,
            "tags": {"$in": [f"select-models-feature-{atom_id}"]}
        }).to_list(length=None)
        
        # Extract combination IDs from saved models
        saved_combination_ids = set()
        for model in saved_models:
            if "model_data" in model and "combination_id" in model["model_data"]:
                saved_combination_ids.add(str(model["model_data"]["combination_id"]))
        
        # Get all unique combination IDs from the source file
        if not minio_client:
            raise HTTPException(status_code=503, detail="MinIO connection is not available.")
        
        # Read the source file to get all combination IDs
        try:
            response = minio_client.get_object(MINIO_BUCKET, file_key)
            content = response.read()
            response.close()
            response.release_conn()
            
            # Read file based on extension
            if file_key.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif file_key.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(content))
            elif file_key.endswith(".arrow"):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_key}")
            
            # Get all unique combination IDs from the file
            if "combination_id" in df.columns:
                all_combination_ids = set(df["combination_id"].astype(str).unique())
            else:
                all_combination_ids = set()
            
            # Calculate pending combinations
            pending_combination_ids = all_combination_ids - saved_combination_ids
            
            return {
                "file_key": file_key,
                "atom_id": atom_id,
                "total_combinations": len(all_combination_ids),
                "saved_combinations": list(saved_combination_ids),
                "pending_combinations": list(pending_combination_ids),
                "saved_count": len(saved_combination_ids),
                "pending_count": len(pending_combination_ids),
                "completion_percentage": round((len(saved_combination_ids) / len(all_combination_ids)) * 100, 2) if all_combination_ids else 0
            }
            
        except Exception as e:
            logger.error(f"Error reading source file: {str(e)}")
            # Return partial data if we can't read the source file
            return {
                "file_key": file_key,
                "atom_id": atom_id,
                "total_combinations": len(saved_combination_ids),
                "saved_combinations": list(saved_combination_ids),
                "pending_combinations": [],
                "saved_count": len(saved_combination_ids),
                "pending_count": 0,
                "completion_percentage": 100 if saved_combination_ids else 0,
                "note": "Could not read source file to determine total combinations"
            }
            
    except Exception as e:
        logger.error(f"Error getting saved combinations status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting saved combinations status: {str(e)}")

