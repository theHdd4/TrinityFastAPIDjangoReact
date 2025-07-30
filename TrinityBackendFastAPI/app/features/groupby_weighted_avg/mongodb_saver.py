from .deps import client
import pandas as pd
import datetime


async def save_groupby_result(validator_atom_id: str, file_key: str, df: pd.DataFrame):
    """Persist group-by output to Mongo if a client is available.
    If the environment variable DISABLE_MONGO_SAVE is set to any truthy value,
    or the Mongo client cannot authenticate, we silently skip the insert so
    that the main GroupBy logic still works without a configured database.
    """
    import os, logging
    if os.getenv("DISABLE_MONGO_SAVE", "").lower() in {"1", "true", "yes"}:
        return  # Skip DB write when disabled

    try:
        collection = client["groupby_db"]["groupby_results"]
        await collection.insert_one({
            "timestamp": datetime.datetime.utcnow(),
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "groupby_result": df.to_dict(orient="records")
        })
    except Exception as e:
        # Log and swallow any DB errors so the API still responds successfully
        logging.warning(f"Skipping Mongo save: {e}")
