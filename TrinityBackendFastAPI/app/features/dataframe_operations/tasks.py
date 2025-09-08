import polars as pl
from typing import List, Dict, Any

from app.celery_app import celery_app


def _apply_operations(df: pl.DataFrame, operations: List[Dict[str, Any]]) -> pl.DataFrame:
    for op in operations:
        name = op.get("op")
        params = op.get("params", {})
        if name == "filter_rows":
            df = df.filter(pl.col(params.get("column")) == params.get("value"))
        elif name == "sort":
            df = df.sort(params.get("column"), descending=params.get("direction", "asc") != "asc")
        elif name == "insert_column":
            idx = params.get("index", len(df.columns))
            df = df.with_columns(pl.lit(params.get("default")).alias(params.get("name")))
            cols = df.columns
            cols.remove(params.get("name"))
            cols.insert(idx, params.get("name"))
            df = df.select(cols)
        elif name == "delete_row":
            df = df.with_row_count().filter(pl.col("row_nr") != params.get("index")).drop("row_nr")
        elif name == "edit_cell":
            df = df.with_row_count().with_columns(
                pl.when(pl.col("row_nr") == params.get("row"))
                .then(pl.lit(params.get("value")))
                .otherwise(pl.col(params.get("column")))
                .alias(params.get("column"))
            ).drop("row_nr")
    return df


@celery_app.task
def process_first_page(path: str, operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    df = pl.read_ipc(path)
    df = _apply_operations(df, operations)
    head = df.head(15)
    return {
        "headers": df.columns,
        "rows": head.to_dicts(),
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
        "row_count": df.height,
    }


@celery_app.task
def process_remaining(path: str, operations: List[Dict[str, Any]]) -> None:
    df = pl.read_ipc(path)
    df = _apply_operations(df, operations)
    df.write_ipc(path)
