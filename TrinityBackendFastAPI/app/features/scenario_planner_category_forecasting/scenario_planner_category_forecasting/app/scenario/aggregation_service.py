import asyncio
from datetime import datetime
from io import BytesIO
from typing import Dict, List, Any
import logging

import pandas as pd

from ..config import (
    minio_client,
    MINIO_OUTPUT_BUCKET,
    flat_aggregations_collection,
    hierarchical_aggregations_collection,
)

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
def _pct(val, base):
    """Calculate percent uplift safely"""
    return (val / base * 100) if base else None

async def _csv_to_minio_async(df: pd.DataFrame, key: str):
    """Async version of CSV upload to MinIO — runs in thread pool."""
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

def _row_to_json(row: pd.Series, id_cols: List[str], feat_set: set) -> Dict[str, Any]:
    """Convert aggregated DataFrame row to the structured JSON block."""
    id_map = {c: row[c] for c in id_cols}
    base_f = {k: row[f"b_{k}"] for k in feat_set}
    scen_f = {k: row[f"s_{k}"] for k in feat_set}
    delt_f = {k: row[f"d_{k}"] for k in feat_set}
    pct_f  = {k: row[f"p_{k}"] for k in feat_set}
    return {
        "identifiers": id_map,
        "baseline":   {"prediction": row["baseline_pred"], "features": base_f},
        "scenario":   {"prediction": row["scenario_pred"], "features": scen_f},
        "delta":      {"prediction": row["delta_pred"],   "features": delt_f},
        "pct_uplift": {"prediction": row["pct_pred"],     "features": pct_f},
    }

# ────────────────────────────────────────────────────────────────────────────
class AggregationService:
    """Async aggregation service handling concurrency and granular Mongo storage."""

    @classmethod
    async def aggregate_and_store(
        cls,
        result_rows: List[Dict[str, Any]],
        payload: Any,  # Changed from Dict to Any to accept RunRequest
        run_id: str,
    ) -> Dict[str, Any]:
        try:
            logger.info(f"Starting aggregation for run_id: {run_id}")
            logger.info(f"Processing {len(payload.views)} views")
            
            # Build overall feature set
            feat_set = {f for r in result_rows for f in r["baseline"]["features"]}
            
            # Process each view separately
            view_results = {}
            
            for view_id, view_config in payload.views.items():
                logger.info(f"Processing view: {view_id}")
                
                # Filter rows for this specific view
                def _row_allowed_for_view(r):
                    # Check if the row matches at least one value for EACH column in the view
                    for id_key, identifier_config in view_config.selected_identifiers.items():
                        for col, vals in identifier_config.items():
                            # If this column exists in the row, check if its value is in the allowed values
                            row_value = r["identifiers"].get(col)
                            if row_value is not None and row_value not in vals:
                                return False
                    return True

                filtered = [r for r in result_rows if _row_allowed_for_view(r)]
                if not filtered:
                    logger.warning(f"No clusters match view {view_id} identifiers")
                    view_results[view_id] = {"flat": {}, "hierarchy": [], "individuals": []}
                    continue
                
                # Build DataFrame for this view
                df = pd.DataFrame([
                    {**r["identifiers"],
                     "baseline_pred": r["baseline"]["prediction"],
                     "scenario_pred": r["scenario"]["prediction"],
                     **{f"b_{k}": r["baseline"]["features"].get(k, 0.0) for k in feat_set},
                     **{f"s_{k}": r["scenario"]["features"].get(k, 0.0) for k in feat_set}}
                    for r in filtered
                ])
                
                # Process flat aggregations for id1 only and hierarchical aggregations for this view
                logger.info(f"🔍 Processing flat aggregations for {view_id} (id1 only)...")
                flat_out = await cls._process_flat_aggregations_for_view(df, view_config, feat_set)
                logger.info(f"🔍 Processing hierarchical aggregations for {view_id}...")
                hier_list = await cls._process_hierarchical_aggregations_for_view(df, view_config, feat_set)
                
                # Store results for this view
                view_results[view_id] = {
                    "flat": flat_out,
                    "hierarchy": hier_list,
                    "individuals": filtered
                }
                
                # Store docs for this view
                await asyncio.gather(
                    cls._store_flat_aggregations_for_view(flat_out, view_id, run_id, feat_set),
                    cls._store_hierarchical_aggregations_for_view(hier_list, view_id, run_id, feat_set)
                )
            
            logger.info(f"✅ Aggregation completed for run_id: {run_id}, processed {len(view_results)} views")
            return {"view_results": view_results}
        except Exception as e:
            logger.error(f"❌ Aggregation failed for run_id {run_id}: {e}")
            raise

    @classmethod
    async def _process_flat_aggregations_for_view(
        cls, df: pd.DataFrame, view_config: Any, feat_set: set
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Compute flat aggregations for a specific view - ONLY for id1."""
        sum_cols = ["baseline_pred", "scenario_pred"] + [f"{p}_{k}" for p in ("b","s") for k in feat_set]
        out: Dict[str, List[Dict[str, Any]]] = {}
        
        # ONLY process id1 (primary business dimension)
        if "id1" in view_config.selected_identifiers:
            id_1_config = view_config.selected_identifiers["id1"]
            for col, vals in id_1_config.items():
                # Group by this column and aggregate
                g = df.groupby([col], dropna=False)[sum_cols].sum().reset_index()
                g = cls._recalculate_metrics(g, feat_set)
                out[col] = [_row_to_json(row, [col], feat_set) for _, row in g.iterrows()]
                logger.info(f"✅ Flat aggregation calculated for id1 column: {col}")
        else:
            logger.warning("⚠️ No id1 found in view config - skipping flat aggregation")
        
        return out

    # ✅ REMOVED: Old _process_flat_aggregations method - replaced by view-specific version

    @classmethod
    async def _process_hierarchical_aggregations_for_view(
        cls, df: pd.DataFrame, view_config: Any, feat_set: set
    ) -> List[Dict[str, Any]]:
        """Compute hierarchical aggregations for a specific view based on id1, id2, id3 order."""
        logger.info("🔍 === VIEW HIERARCHICAL AGGREGATIONS DEBUG ===")
        logger.info("🔍 View config: %s", view_config.selected_identifiers)
        
        # Extract columns in the correct order (id1, id2, id3, etc.)
        id_cols = []
        for id_key in sorted(view_config.selected_identifiers.keys()):  # Sort to ensure id1, id2, id3 order
            identifier_config = view_config.selected_identifiers[id_key]
            for col, vals in identifier_config.items():
                id_cols.append(col)
                break  # Only take the first column for each id level
        
        logger.info("🔍 Generated hierarchical id_cols: %s", id_cols)
        logger.info("🔍 id_cols length: %d", len(id_cols))
        
        if not id_cols:
            logger.warning("❌ NO ID_COLS for hierarchical view aggregation!")
            return []
        
        logger.info("=== VIEW HIERARCHICAL AGGREGATIONS DEBUG COMPLETED ===")
        sum_cols = ["baseline_pred", "scenario_pred"] + [f"{p}_{k}" for p in ("b","s") for k in feat_set]
        dfg = df.groupby(id_cols, dropna=False)[sum_cols].sum().reset_index()
        dfg = cls._recalculate_metrics(dfg, feat_set)
        return [_row_to_json(row, id_cols, feat_set) for _, row in dfg.iterrows()]

    # ✅ REMOVED: Old _process_hierarchical_aggregations method - replaced by view-specific version

    @classmethod
    def _recalculate_metrics(cls, df: pd.DataFrame, feat_set: set) -> pd.DataFrame:
        df = df.copy()
        df["delta_pred"] = df["scenario_pred"] - df["baseline_pred"]
        df["pct_pred"] = df.apply(lambda r: _pct(r["delta_pred"], r["baseline_pred"]), axis=1)
        for f in feat_set:
            df[f"d_{f}"] = df[f"s_{f}"] - df[f"b_{f}"]
            df[f"p_{f}"] = df.apply(lambda r: _pct(r[f"d_{f}"], r[f"b_{f}"]), axis=1)
        return df

    @classmethod
    async def _generate_csv_files(
        cls, df: pd.DataFrame, hier_list: List[Dict[str, Any]], run_id: str, feat_set: set, id_cols: List[str]
    ):
        try:
            indiv_df = cls._recalculate_metrics(df, feat_set)
            sum_cols = ["baseline_pred", "scenario_pred"] + [f"{p}_{k}" for p in ("b","s") for k in feat_set]
            flat_df = df.groupby(id_cols)[sum_cols].sum().reset_index()
            flat_df = cls._recalculate_metrics(flat_df, feat_set)
            hier_records = []
            for rec in hier_list:
                base = rec["baseline"]
                scen = rec["scenario"]
                delt = rec["delta"]
                pct = rec["pct_uplift"]
                row = {**rec["identifiers"],
                       "baseline_pred": base["prediction"],
                       "scenario_pred": scen["prediction"],
                       "delta_pred": delt["prediction"],
                       "pct_pred": pct["prediction"]}
                for f in feat_set:
                    row[f"baseline_{f}"] = base["features"].get(f)
                    row[f"scenario_{f}"] = scen["features"].get(f)
                    row[f"delta_{f}"] = delt["features"].get(f)
                    row[f"pct_{f}"] = pct["features"].get(f)
                hier_records.append(row)
            hier_df = pd.DataFrame(hier_records)
            await asyncio.gather(
                _csv_to_minio_async(indiv_df, f"scenario-outputs/{run_id}_indiv.csv"),
                _csv_to_minio_async(flat_df, f"scenario-outputs/{run_id}_flat.csv"),
                _csv_to_minio_async(hier_df, f"scenario-outputs/{run_id}_hier.csv")
            )
        except Exception as e:
            logger.error(f"Error generating CSVs for {run_id}: {e}")

    @classmethod
    async def _store_flat_aggregations_for_view(
        cls, flat_out: Dict[str, List[Dict[str, Any]]], view_id: str, run_id: str, feat_set: set
    ):
        """Store flat aggregations for id_1 only."""
        docs = []
        for col, lst in flat_out.items():
            for rec in lst:
                docs.append({
                    "run_id": run_id,
                    "view_id": view_id,
                    "aggregation_type": "flat",
                    "identifier_type": col,
                    "identifiers": {"column": col, "value": rec["identifiers"][col]},
                    "features_included": list(feat_set),
                    "result": rec,
                    "created_at": datetime.utcnow(),
                })
        if docs:
            await flat_aggregations_collection.insert_many(docs)
            logger.info(f"✅ Stored {len(docs)} flat aggregation documents for view {view_id} (id1 only)")

    # ✅ REMOVED: Old _store_flat_aggregations method - replaced by view-specific version

    @classmethod
    async def _store_hierarchical_aggregations_for_view(
        cls, hier_list: List[Dict[str, Any]], view_id: str, run_id: str, feat_set: set
    ):
        docs = []
        for rec in hier_list:
            docs.append({
                "run_id": run_id,
                "view_id": view_id,
                "aggregation_type": "hierarchy",
                "identifiers": rec["identifiers"],
                "features_included": list(feat_set),
                "result": rec,
                "created_at": datetime.utcnow(),
            })
        if docs:
            await hierarchical_aggregations_collection.insert_many(docs)

    # ✅ REMOVED: Old _store_hierarchical_aggregations method - replaced by view-specific version

    @classmethod
    async def get_flat_aggregations(cls, run_id: str) -> List[Dict]:
        return await flat_aggregations_collection.find({"run_id": run_id}, {"_id": 0}).to_list(None)

    @classmethod
    async def get_hierarchical_aggregations(cls, run_id: str) -> List[Dict]:
        return await hierarchical_aggregations_collection.find({"run_id": run_id}, {"_id": 0})
