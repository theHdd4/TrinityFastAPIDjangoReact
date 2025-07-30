import pyarrow as pa

RAW_CSV_SCHEMA = pa.schema([])
AGGREGATED_FEATURES_SCHEMA = pa.schema([])

SCHEMAS = {
    "raw_csv": RAW_CSV_SCHEMA,
    "aggregated_features": AGGREGATED_FEATURES_SCHEMA,
}
