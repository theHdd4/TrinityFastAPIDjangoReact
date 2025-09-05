import logging
from datetime import datetime
from typing import Dict, List, Any
import pandas as pd
from pandas.api.types import is_datetime64_any_dtype as is_dt
from dateutil import parser as dtp

import asyncio
from io import BytesIO

from ..scenario.data_service import DataService
from ..scenario.transform_service import TransformService
from ..config import saved_predictions_collection, minio_client, MINIO_OUTPUT_BUCKET

logger = logging.getLogger(__name__)

# Async helper for MinIO upload
async def _csv_to_minio_async(df: pd.DataFrame, key: str):
    def _upload_csv():
        buf = BytesIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        minio_client.put_object(
            MINIO_OUTPUT_BUCKET,
            key,
            data=buf,
            length=buf.getbuffer().nbytes,
            content_type="text/csv",
        )
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _upload_csv)

# Scenario tweaks
def apply_tweaks(ref_vals: Dict[str, float],
                 local_defs: Dict[str, Any]
    ) -> Dict[str, float]:
    """
    Apply cluster-specific scenario tweaks to reference values.
    
    Args:
        ref_vals: Reference values for features
        local_defs: Cluster-specific scenario definitions
    
    Returns:
        Modified scenario values
    """
    scen = ref_vals.copy()
    
    # If no local definitions, return reference values unchanged
    if not local_defs:
        return scen

    # Apply tweaks for each feature
    for feat, spec in local_defs.items():
        if feat not in scen:
            logger.warning(f"Feature '{feat}' not found in reference values, skipping")
            continue
            
        # Extract type and value from spec (handle both Pydantic models and dicts)
        if hasattr(spec, 'type'):
            spec_type = spec.type
            spec_value = spec.value
        else:
            spec_type = spec.get("type")
            spec_value = spec.get("value")
            
        # Validate spec
        if spec_type is None or spec_value is None:
            logger.warning(f"Invalid spec for feature '{feat}': missing type or value")
            continue
            
        # Validate spec_type
        if spec_type not in ["pct", "abs"]:
            logger.warning(f"Invalid spec_type '{spec_type}' for feature '{feat}', expected 'pct' or 'abs'")
            continue
            
        # Validate spec_value is numeric
        try:
            spec_value = float(spec_value)
        except (ValueError, TypeError):
            logger.warning(f"Invalid spec_value '{spec_value}' for feature '{feat}', must be numeric")
            continue
            
        # Apply the tweak based on type
        if spec_type == "pct":
            # Percentage change: multiply by (1 + percentage/100)
            scen[feat] = scen[feat] * (1 + spec_value / 100.0)
            logger.debug(f"Applied {spec_type} tweak to {feat}: {ref_vals[feat]} → {scen[feat]} ({spec_value:+}%)")
            
        elif spec_type == "abs":
            # Absolute value: replace reference value
            scen[feat] = spec_value
            logger.debug(f"Applied {spec_type} tweak to {feat}: {ref_vals[feat]} → {scen[feat]} (absolute)")
            
    return scen

class ScenarioService:
    @staticmethod
    def _calc_reference(
        df: pd.DataFrame,
        x_vars: List[str],
        stat: str,
        start: str,
        end: str,
    ) -> Dict[str, float]:
        if stat.startswith("period-"):
            t0 = dtp.parse(start)
            t1 = dtp.parse(end)
            if t0.tzinfo is not None:
                t0 = t0.replace(tzinfo=None)
            if t1.tzinfo is not None:
                t1 = t1.replace(tzinfo=None)

            # Debug: Log what columns we actually have
            logger.info("🔍 DEBUG: DataFrame shape: %s", df.shape)
            logger.info("🔍 DEBUG: Available columns: %s", list(df.columns))
            logger.info("🔍 DEBUG: Looking for Date column...")

            if "Date" in df.columns:
                date_col = "Date"
                logger.info("✅ Found 'Date' column")
            elif "date" in df.columns:
                date_col = "date"
                logger.info("✅ Found 'date' column")
            else:
                logger.error("❌ Date column not found! Available columns: %s", list(df.columns))
                logger.error("❌ DataFrame info: shape=%s, dtypes=%s", df.shape, df.dtypes.to_dict())
                raise ValueError(f"No 'Date' or 'date' column found for period filter. Available columns: {list(df.columns)}")

            if not is_dt(df[date_col]):
                df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            if df[date_col].dt.tz is not None:
                df[date_col] = df[date_col].dt.tz_convert(None)

            df = df[(df[date_col] >= t0) & (df[date_col] <= t1)]
        ref_series = (
            df[x_vars].mean() if stat.endswith("mean") else df[x_vars].median()
        )
        return ref_series.to_dict()

    @staticmethod
    def _prepare_results_dataframe(results: List[dict]) -> pd.DataFrame:
        """
        Flatten scenario results for CSV:
        - identifier columns (SubCategory, Category)
        - predictions: baseline_pred, scenario_pred, delta_pred, pct_pred
        - b_, s_, d_, p_ feature columns
        """
        df = pd.DataFrame(results)
        # Expand identifier dict (e.g. SubCategory, Category become columns)
        identifiers_df = pd.json_normalize(df['identifiers'])
        df = pd.concat([df.drop(columns=['identifiers']), identifiers_df], axis=1)

        # Rename for temp processing
        df = df.rename(columns={
            'baseline': 'baseline_data',
            'scenario': 'scenario_data',
            'delta': 'delta_data',
            'pct_uplift': 'pct_data'
        })

        # Scalar predictions
        df['baseline_pred'] = df['baseline_data'].apply(lambda x: x.get('prediction') if isinstance(x, dict) else None)
        df['scenario_pred'] = df['scenario_data'].apply(lambda x: x.get('prediction') if isinstance(x, dict) else None)
        df['delta_pred'] = df['delta_data'].apply(lambda x: x.get('prediction') if isinstance(x, dict) else None)
        df['pct_pred'] = df['pct_data'].apply(lambda x: x.get('prediction') if isinstance(x, dict) else None)

        # Helper for feature flattening
        def expand_features(prefix, col_name):
            features_df = pd.json_normalize(
                df[col_name].apply(lambda d: d.get('features', {}) if isinstance(d, dict) else {})
            )
            features_df.columns = [f"{prefix}_{col}" for col in features_df.columns]
            return features_df

        b_feats = expand_features('b', 'baseline_data')
        s_feats = expand_features('s', 'scenario_data')
        d_feats = expand_features('d', 'delta_data')
        p_feats = expand_features('p', 'pct_data')

        # Merge all into one DataFrame
        df_final = pd.concat([
            df.drop(columns=['baseline_data', 'scenario_data', 'delta_data', 'pct_data']),
            b_feats.reset_index(drop=True),
            s_feats.reset_index(drop=True),
            d_feats.reset_index(drop=True),
            p_feats.reset_index(drop=True)
        ], axis=1)

        # Reorder columns for readability
        column_order = []
        for col in ['SubCategory', 'Category', 'baseline_pred', 'scenario_pred', 'delta_pred', 'pct_pred']:
            if col in df_final.columns:
                column_order.append(col)
        # Add other columns after
        remaining_cols = [c for c in df_final.columns if c not in column_order]
        df_final = df_final[column_order + remaining_cols]

        return df_final

    @classmethod
    async def run_scenario(
        cls,
        payload: Any,  # Changed from dict to Any to accept RunRequest
        run_id: str,
        d0_key: str,
        save_csv_locally: bool = False,
        local_csv_path: str = None,
        upload_to_minio: bool = True
    ) -> List[Dict[str, Any]]:

        models = await DataService.fetch_selected_models(payload.model_id)
        results: List[Dict[str, Any]] = []

        for meta in models:
            ident = meta["identifiers"]
            combination = meta.get("combination")
            logger.info("Processing scenario for combination: %s", combination)
            df_slice = DataService.get_cluster_dataframe(d0_key, ident, combination=combination)

            # 1️⃣ Reference
            ref_vals = cls._calc_reference(
                df_slice,
                meta["x_variables"],
                payload.stat,  # Changed from payload["stat"] to payload.stat
                payload.start_date,  # Changed from payload["start_date"] to payload.start_date
                payload.end_date,  # Changed from payload["end_date"] to payload.end_date
            )

            # 2️⃣ Cluster-specific Tweaks (Local Changes Only)
            local_defs = {}
            for cl in getattr(payload, "clusters", []):
                # Handle both Pydantic model and dict access
                if hasattr(cl, 'combination_id'):
                    cl_combination_id = cl.combination_id
                    cl_scenario_defs = getattr(cl, 'scenario_defs', {})
                else:
                    cl_combination_id = cl["combination_id"]
                    cl_scenario_defs = cl.get("scenario_defs", {})
                    
                # Match by combination_id instead of identifiers
                if cl_combination_id == combination:
                    local_defs = cl_scenario_defs
                    # Convert Pydantic models to dict if needed
                    if hasattr(local_defs, 'dict'):
                        local_defs = local_defs.dict()
                    elif isinstance(local_defs, dict):
                        # Convert any nested Pydantic models to dicts
                        local_defs = {
                            k: v.dict() if hasattr(v, 'dict') else v
                            for k, v in local_defs.items()
                        }
                    break

            scen_vals = apply_tweaks(ref_vals, local_defs)

            # 3️⃣ Transform
            transf = TransformService(meta["transformations"])
            X_ref_t = transf.transform(pd.DataFrame([ref_vals])).iloc[0]
            X_scen_t = transf.transform(pd.DataFrame([scen_vals])).iloc[0]

            ref_trans_values = X_ref_t.to_dict()
            scen_trans_values = X_scen_t.to_dict()

            # Create coefficient mapping: x_variable -> coefficient
            # Handle the mismatch between x_variables and coefficient names (Beta_ prefix)
            coeff_mapping = {}
            for x_var in meta["x_variables"]:
                # Try to find coefficient with Beta_ prefix
                beta_key = f"Beta_{x_var}"
                if beta_key in meta["coefficients"]:
                    coeff_mapping[x_var] = meta["coefficients"][beta_key]
                else:
                    # Fallback: try without prefix
                    if x_var in meta["coefficients"]:
                        coeff_mapping[x_var] = meta["coefficients"][x_var]
                    else:
                        logger.warning(f"Could not find coefficient for variable: {x_var}")
                        coeff_mapping[x_var] = 0.0
            
            coeff = pd.Series(coeff_mapping)
            intercept = meta["intercept"]
            
            logger.info(f"Original coefficients keys: {list(meta['coefficients'].keys())}")
            logger.info(f"X variables: {meta['x_variables']}")
            logger.info(f"Mapped coefficients: {coeff.to_dict()}")
            logger.info(f"Intercept: {intercept}")

            contrib_ref = X_ref_t * coeff
            contrib_scen = X_scen_t * coeff

            y_ref = transf.inverse_y(contrib_ref.sum() + intercept)
            y_scen = transf.inverse_y(contrib_scen.sum() + intercept)

            delta_pred = float(y_scen - y_ref)
            pct_up_pred = float((delta_pred / y_ref) if y_ref else 0.0)  # Convert to regular float

            delta_feat = (contrib_scen - contrib_ref).to_dict()
            pct_up_feat = {
                f: float(((delta_feat[f] / contrib_ref[f]) if contrib_ref[f] else 0.0))  # Convert to regular float
                for f in contrib_ref.index
            }

            # Ensure local_defs is a plain dictionary for MongoDB storage
            if isinstance(local_defs, dict):
                # Convert any remaining Pydantic models to dicts
                local_defs_for_storage = {
                    k: v.dict() if hasattr(v, 'dict') else v
                    for k, v in local_defs.items()
                }
            else:
                local_defs_for_storage = {}

            result_obj = {
                "identifiers": ident,
                "run_id": run_id,
                "created_at": datetime.utcnow(),
                "baseline": { "prediction": float(y_ref), "features": contrib_ref.to_dict() },
                "scenario": { "prediction": float(y_scen), "features": contrib_scen.to_dict() },
                "delta":    { "prediction": delta_pred, "features": delta_feat },
                "pct_uplift": { "prediction": pct_up_pred, "features": pct_up_feat },
                "intercept": intercept,
                "reference": { "raw": ref_vals, "transformed": ref_trans_values },
                "scenario_values": { "raw": scen_vals, "transformed": scen_trans_values },
                "scenario_changes": { "scenario_defs": local_defs_for_storage },  # Cluster-specific changes only
            }

            await saved_predictions_collection.insert_one(result_obj.copy())
            for key in ("reference", "scenario_values", "scenario_changes"):
                result_obj.pop(key, None)
            result_obj.pop("_id", None)
            results.append(result_obj)

        # ☆☆☆ Prepare CSV dataframe for local or MinIO usage ☆☆☆
        df_csv = cls._prepare_results_dataframe(results)

        if save_csv_locally and local_csv_path:
            df_csv.to_csv(local_csv_path, index=False)
            logger.info(f"✅ ScenarioService: Saved CSV locally at {local_csv_path}")

        if upload_to_minio:
            try:
                await _csv_to_minio_async(df_csv, f"scenario-outputs-promo/{run_id}_results_flat.csv")
                logger.info(f"✅ ScenarioService: Uploaded CSV to MinIO for run_id: {run_id}")
            except Exception as e:
                logger.error(f"❌ ScenarioService: Error uploading CSV to MinIO: {str(e)}")

        return results 