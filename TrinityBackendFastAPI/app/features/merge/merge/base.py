import pandas as pd

def get_common_columns(df1: pd.DataFrame, df2: pd.DataFrame) -> list:
    return list(set(df1.columns).intersection(df2.columns))

def merge_dataframes(
    df1: pd.DataFrame,
    df2: pd.DataFrame,
    join_columns: list,
    join_type: str = "inner"
) -> pd.DataFrame:
    return df1.merge(df2, on=join_columns, how=join_type)

