import pandas as pd
import numpy as np
from collections import Counter

# This will hold intermediate results for access via the GET API
output_store = {}

def describe_object_columns(df: pd.DataFrame) -> pd.DataFrame:
    object_cols = df.select_dtypes(include=['object']).columns
    data = []

    for col in object_cols:
        dtype = df[col].dtype
        unique_vals = df[col].dropna().unique()
        unique_count = len(unique_vals)
        preview = list(unique_vals[:10]) + ['...'] if unique_count > 10 else list(unique_vals)

        data.append({
            "Column": col,
            "Data Type": str(dtype),
            "Unique Count": unique_count,
            "Unique Values": preview
        })

    return pd.DataFrame(data).sort_values(by="Unique Count", ascending=False)

def summarize_categorical_columns(df: pd.DataFrame, categorical_cols: list) -> dict:
    cat_summary = {}
    for col in categorical_cols:
        unique_vals = df[col].dropna().unique()
        unique_count = len(unique_vals)
        most_common_val = df[col].mode().iloc[0] if not df[col].mode().empty else None

        cat_summary[col] = {
            "Unique Count": int(unique_count),
            "Preview Values": unique_vals[:10].tolist(),
            "Most Common Value": most_common_val
        }
    return cat_summary

# def drilldown_summary(df, selected_cols, unique_combinations, store_key):
def drilldown_summary(df, selected_cols,constant_cols,unique_combinations, store_key, selected_combination=None):
    
    output_store[store_key]['unique_combinations'] = unique_combinations

    if not selected_combination:
        # Don't generate summaries if no specific combination is provided
        output_store[store_key]['message'] = "No combination specified; only combinations are shown."
        return
    
    possible_date_cols = [col for col in df.columns if 'date' in col.lower() or 'time' in col.lower()]
    date_col = possible_date_cols[0] if possible_date_cols else None

    numeric_cols = df.select_dtypes(include=[np.number]).columns
    exclude_cols = {'year', 'week', 'month'}
    numeric_cols = [col for col in numeric_cols if col.lower() not in exclude_cols]

    # Treat categorical as non-dimension, non-numeric, non-date columns
    all_other_cols = set(df.columns) - set(selected_cols) - set(constant_cols) - set(numeric_cols) - set([date_col] if date_col else [])
    categorical_cols = [col for col in all_other_cols if df[col].dtype == 'object']

    results = []

    for _, row in unique_combinations.iterrows():
        combination = row[selected_cols].to_dict()


        if combination != selected_combination:
            continue

        mask = pd.Series(True, index=df.index)
        for col, val in combination.items():
            mask &= df[col] == val

        group_df = df[mask].copy()

        summary = {
            "Combination": combination,
            "DataFrame": group_df.to_dict(orient='records')
        }

        # Numeric summary
        if not numeric_cols:
            summary['Numeric Summary'] = "No numeric columns found"
        else:
            numeric_summary = group_df[numeric_cols].agg(['mean', 'min', 'max']).transpose()
            numeric_summary.columns = ['Average', 'Min', 'Max']
            if date_col:
                group_df[date_col] = pd.to_datetime(group_df[date_col], errors='coerce')
                numeric_summary['From'] = group_df[date_col].min()
                numeric_summary['To'] = group_df[date_col].max()
            else:
                numeric_summary['From'] = 'N/A'
                numeric_summary['To'] = 'N/A'
            numeric_summary = numeric_summary[['From', 'To', 'Average', 'Min', 'Max']]
            summary['Numeric Summary'] = numeric_summary

        # Categorical summary
        if categorical_cols:
            cat_summary = summarize_categorical_columns(group_df, categorical_cols)
            summary['Categorical Summary'] = cat_summary
        else:
            summary['Categorical Summary'] = "No categorical columns to summarize"

        results.append(summary)

    output_store[store_key]['detailed_summary'] = results

# def generate_hierarchy_view(df: pd.DataFrame, input_dims: dict):

# def generate_hierarchy_view(df: pd.DataFrame, input_dims: dict, selected_combination: dict = None):
def generate_hierarchy_view(
    df: pd.DataFrame,
    input_dims: dict,
    selected_combination: dict = None,
    create_summary: bool = True
):
    selected_cols = [col for cols in input_dims.values() for col in cols if col in df.columns]

    # Remove columns with only one unique value
    variable_cols = [col for col in selected_cols if df[col].nunique(dropna=False) > 1]
    constant_cols = [col for col in selected_cols if df[col].nunique(dropna=False) <= 1]

    if not variable_cols:
        raise ValueError("No valid dimension columns with >1 unique values found in data.")

    print("Columns with only one unique value:", constant_cols)

    unique_combinations = df[variable_cols].drop_duplicates()
    output_store["result"]["dimensions_used"] = variable_cols
    output_store["result"]["excluded_columns"] = constant_cols
    output_store["result"]["unique_combinations"] = unique_combinations

    # drilldown_summary(df, variable_cols, unique_combinations, "result")
    # drilldown_summary(df, variable_cols,constant_cols,unique_combinations, "result", selected_combination)
    if create_summary and selected_combination:
        drilldown_summary(df, variable_cols,constant_cols, unique_combinations, "result", selected_combination)
    elif selected_combination:
        output_store["result"]["message"] = "Combination specified, but summary generation was skipped due to create_summary=False"

unique_count={}



def run_unique_count(
    df: pd.DataFrame,
    input_dims: dict,
    # create_hierarchy: bool = True,
    # selected_combination: dict = None,
    # create_summary: bool = True
):  
    output_store.clear()
    # unique_count.clear()

    unique_count["unique_result"]={}
    # output_store["result"] = {}

    # Lowercase columns
    df.columns = df.columns.str.lower()
    input_dims = {k: [col.lower() for col in v] for k, v in input_dims.items()}

    object_summary = describe_object_columns(df)
    unique_count["unique_result"]["object_summary"] = object_summary
    
    return "SUCCESS"



def run_feature_overview(
    df: pd.DataFrame,
    input_dims: dict,
    create_hierarchy: bool = True,
    selected_combination: dict = None,
    create_summary: bool = True
):  
    output_store.clear()
    unique_count.clear()

    unique_count["unique_result"]={}
    output_store["result"] = {}

    # Lowercase columns
    df.columns = df.columns.str.lower()
    # input_dims = {k: [col.lower() for col in v] for k, v in input_dims.items()}


    time_keywords = {"time", "date"}
    value_keywords = {
        "date", "year", "month", "week", "day", "days", "time","months","weeks","fiscal year","fy","period","periods","quarter","fiscal quarter","fiscal day","fiscal week","fiscal month","fiscal period"
    }

    input_dims = {
        k: [col.lower() for col in v if col.lower() not in value_keywords]
        for k, v in input_dims.items()
        if k.lower() not in time_keywords
        and not any(col.lower() in value_keywords for col in v)
    }



    if create_hierarchy:
        generate_hierarchy_view(df, input_dims, selected_combination, create_summary)

    
    return "SUCCESS"

