
from typing import List

import pandas as pd

def perform_groupby(df, identifiers, aggregations):
    agg_dict = {}
    weighted_means = []
    rank_measures = []

    # identifiers = [col for col in identifiers if df[col].nunique() > 1]

    # Collect normal aggregations and prepare for special cases
    for measure, params in aggregations.items():
        if isinstance(params, str):
            params = {"agg": params}

        agg = params["agg"]

        if agg == "weighted_mean":
            weight_col = params.get("weight_by")
            if weight_col is None:
                raise ValueError(f"Missing 'weight_by' for weighted_mean of '{measure}'")
            weighted_means.append((measure, weight_col))
        elif agg == "rank_pct":
            rank_measures.append(measure)
            agg_dict[f"{measure}_for_rank"] = pd.NamedAgg(column=measure, aggfunc="first")
        else:
            # Keep original column name after aggregation
            agg_dict[measure] = pd.NamedAgg(column=measure, aggfunc=agg)

    # Initial groupby for standard aggregations
    df = df.reset_index() if any(x in df.index.names for x in identifiers) else df
    if agg_dict:
        grouped = df.groupby(identifiers).agg(**agg_dict).reset_index()
    else:
        # When no standard aggregations requested (e.g., only weighted_mean or rank_pct),
        # create a grouped DataFrame with unique identifier combinations.
        grouped = df[identifiers].drop_duplicates().reset_index(drop=True)

    # Handle weighted mean separately
    if weighted_means:
        grouped_weights = []
        for keys, group in df.groupby(identifiers):
            row = dict(zip(identifiers, keys if isinstance(keys, tuple) else (keys,)))
            for measure, weight_col in weighted_means:
                wm_col = measure
                weight_vals = group[weight_col]
                measure_vals = group[measure]
                row[wm_col] = (
                    (measure_vals * weight_vals).sum() / weight_vals.sum()
                    if weight_vals.sum() != 0 else None
                )
            grouped_weights.append(row)
        grouped_weights_df = pd.DataFrame(grouped_weights)

        grouped = pd.merge(grouped, grouped_weights_df, on=identifiers, how="left")

    # Handle rank_pct
    for measure in rank_measures:
        grouped[measure] = grouped[f"{measure}_for_rank"].rank(pct=True)
        grouped.drop(columns=[f"{measure}_for_rank"], inplace=True)

    # Apply user-provided rename mapping, if any
    for measure, params in aggregations.items():
        if isinstance(params, dict):
            new_name = params.get("rename_to")
            if new_name and measure in grouped.columns:
                grouped.rename(columns={measure: new_name}, inplace=True)

    return grouped
