# base.py
import pandas as pd

import pandas as pd

def get_concat_info(data1: pd.DataFrame, data2: pd.DataFrame):
    """
    Return column info and row analysis for given datasets.
    """
    # Column analysis
    cols1 = set(data1.columns)
    cols2 = set(data2.columns)
    common_cols = list(cols1 & cols2)

    col_info = {
        "data1_columns": list(data1.columns),
        "data2_columns": list(data2.columns),
        "common_columns": common_cols,
        "only_in_data1": list(cols1 - cols2),
        "only_in_data2": list(cols2 - cols1),
    }

    common_index = list(set(data1.index) & set(data2.index))
    only_in_data1 = list(set(data1.index) - set(data2.index))
    only_in_data2 = list(set(data2.index) - set(data1.index))

    return col_info
      


def concatenate_datasets(data1: pd.DataFrame, data2: pd.DataFrame, concat_direction: str) -> pd.DataFrame:
    """
    Concatenate two datasets with options for direction and mismatch handling.
    """
    if concat_direction == 'vertical':
        result = pd.concat([data1, data2], axis=0)


    else:  # horizontal
        result = pd.concat([data1, data2], axis=1)


    return result
