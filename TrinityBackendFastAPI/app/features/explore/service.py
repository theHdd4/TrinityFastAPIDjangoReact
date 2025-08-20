import io
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from .schema import ExploreResponse


def summarize_dataframe(data: bytes, *, is_arrow: bool) -> ExploreResponse:
    """Create summary statistics for the given dataframe bytes."""
    if is_arrow:
        reader = ipc.open_file(pa.BufferReader(data))
        table = reader.read_all()
        df = table.to_pandas()
    else:
        df = pd.read_csv(io.BytesIO(data))
    summary = df.describe(include="all").to_dict()
    return ExploreResponse(columns=list(df.columns), row_count=len(df), summary=summary)
