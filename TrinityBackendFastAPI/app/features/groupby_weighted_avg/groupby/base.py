
# from typing import List

# import pandas as pd

# def perform_groupby(df, identifiers, aggregations):
#     agg_dict = {}
#     weighted_means = []
#     rank_measures = []

#     # identifiers = [col for col in identifiers if df[col].nunique() > 1]

#     # Collect normal aggregations and prepare for special cases
#     for measure, params in aggregations.items():
#         if isinstance(params, str):
#             params = {"agg": params}

#         agg = params["agg"]

#         if agg == "weighted_mean":
#             weight_col = params.get("weight_by")
#             if weight_col is None:
#                 raise ValueError(f"Missing 'weight_by' for weighted_mean of '{measure}'")
#             weighted_means.append((measure, weight_col))
#         elif agg == "rank_pct":
#             rank_measures.append(measure)
#             agg_dict[f"{measure}_for_rank"] = pd.NamedAgg(column=measure, aggfunc="first")
#         else:
#             # Keep original column name after aggregation
#             agg_dict[measure] = pd.NamedAgg(column=measure, aggfunc=agg)

#     # Initial groupby for standard aggregations
#     df = df.reset_index() if any(x in df.index.names for x in identifiers) else df
#     if agg_dict:
#         grouped = df.groupby(identifiers).agg(**agg_dict).reset_index()
#     else:
#         # When no standard aggregations requested (e.g., only weighted_mean or rank_pct),
#         # create a grouped DataFrame with unique identifier combinations.
#         grouped = df[identifiers].drop_duplicates().reset_index(drop=True)

#     # Handle weighted mean separately
#     if weighted_means:
#         grouped_weights = []
#         for keys, group in df.groupby(identifiers):
#             row = dict(zip(identifiers, keys if isinstance(keys, tuple) else (keys,)))
#             for measure, weight_col in weighted_means:
#                 wm_col = measure
#                 weight_vals = group[weight_col]
#                 measure_vals = group[measure]
#                 row[wm_col] = (
#                     (measure_vals * weight_vals).sum() / weight_vals.sum()
#                     if weight_vals.sum() != 0 else None
#                 )
#             grouped_weights.append(row)
#         grouped_weights_df = pd.DataFrame(grouped_weights)

#         grouped = pd.merge(grouped, grouped_weights_df, on=identifiers, how="left")

#     # Handle rank_pct
#     for measure in rank_measures:
#         grouped[measure] = grouped[f"{measure}_for_rank"].rank(pct=True)
#         grouped.drop(columns=[f"{measure}_for_rank"], inplace=True)

#     # Apply user-provided rename mapping, if any
#     for measure, params in aggregations.items():
#         if isinstance(params, dict):
#             new_name = params.get("rename_to")
#             if new_name and measure in grouped.columns:
#                 grouped.rename(columns={measure: new_name}, inplace=True)

#     return grouped


from typing import List
 
import pandas as pd
import numpy as np
 
def perform_groupby(df, identifiers, aggregations):
    agg_dict = {}
    weighted_means = []
    rank_measures = []
 
    # identifiers = [col for col in identifiers if df[col].nunique() > 1]
 
    # Collect normal aggregations and prepare for special cases
    for output_col, params in aggregations.items():
        if isinstance(params, str):
            params = {"agg": params}
 
        agg = params["agg"]
        # Get source column - if not provided, use the key (backward compatible)
        source_column = params.get("column", output_col)
 
        if agg == "weighted_mean":
            weight_col = params.get("weight_by")
            if weight_col is None:
                raise ValueError(f"Missing 'weight_by' for weighted_mean of '{output_col}'")
            weighted_means.append((output_col, source_column, weight_col))
        elif agg == "rank_pct":
            rank_measures.append((output_col, source_column))
            agg_dict[f"{output_col}_for_rank"] = pd.NamedAgg(column=source_column, aggfunc="first")
        else:
            # Use source_column for aggregation, output_col for result column name
            agg_dict[output_col] = pd.NamedAgg(column=source_column, aggfunc=agg)
 
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
            for output_col, source_column, weight_col in weighted_means:
                weight_vals = group[weight_col].fillna(0)  # Replace NaN weights with 0
                measure_vals = group[source_column].fillna(0)   # Replace NaN measures with 0
               
                # Calculate weighted mean with proper handling
                weight_sum = weight_vals.sum()
                if weight_sum != 0 and not np.isnan(weight_sum) and not np.isinf(weight_sum):
                    weighted_sum = (measure_vals * weight_vals).sum()
                    result = weighted_sum / weight_sum
                   
                    # Handle invalid results (NaN, Inf, -Inf)
                    if np.isnan(result) or np.isinf(result):
                        row[output_col] = None
                    else:
                        row[output_col] = float(result)  # Ensure it's a regular float
                else:
                    row[output_col] = None
            grouped_weights.append(row)
        grouped_weights_df = pd.DataFrame(grouped_weights)

        grouped = pd.merge(grouped, grouped_weights_df, on=identifiers, how="left")

    # Handle rank_pct
    for output_col, source_column in rank_measures:
        grouped[output_col] = grouped[f"{output_col}_for_rank"].rank(pct=True)
        grouped.drop(columns=[f"{output_col}_for_rank"], inplace=True)

    # Apply user-provided rename mapping, if any (for backward compatibility)
    for output_col, params in aggregations.items():
        if isinstance(params, dict):
            new_name = params.get("rename_to")
            # Only rename if rename_to differs from the output_col (key)
            if new_name and new_name != output_col and output_col in grouped.columns:
                grouped.rename(columns={output_col: new_name}, inplace=True)
 
    # Final cleanup: Replace any remaining NaN, Inf, -Inf with None for JSON serialization
    # This ensures all values are JSON-compliant
    grouped = grouped.replace([np.nan, np.inf, -np.inf], None)
 
    return grouped