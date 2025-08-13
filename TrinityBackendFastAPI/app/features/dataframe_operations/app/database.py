import os
from pymongo import MongoClient
from fastapi import UploadFile

MONGODB_URL = os.getenv("MONGO_URI", "mongodb://mongo:27017/trinity")
DATABASE_NAME = "dataframe_ops_db"
COLLECTION_NAME = "dataframe_files"

mongo_client = MongoClient(MONGODB_URL)
db = mongo_client[DATABASE_NAME]

# REMOVE or comment out the following, since we now use shared deps:
# MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
# MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
# MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
# MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")
# minio_client = Minio(
#     MINIO_ENDPOINT,
#     access_key=MINIO_ACCESS_KEY,
#     secret_key=MINIO_SECRET_KEY,
#     secure=False
# )

# redis_client = ...

# Remove or comment out upload_to_minio, save_metadata_to_mongo, get_file_from_minio, etc.

# The following functions are no longer needed as MinIO/Redis are removed:
# async def upload_to_minio(file: UploadFile):
#     file_id = file.filename  # In production, use a UUID or hash
#     minio_client.put_object(
#         MINIO_BUCKET,
#         file_id,
#         file.file,
#         length=-1,
#         part_size=10*1024*1024,
#         content_type=file.content_type
#     )
#     minio_url = f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{file_id}"
#     return {"file_id": file_id, "filename": file.filename, "minio_url": minio_url}

# def save_metadata_to_mongo(file_info):
#     db[COLLECTION_NAME].insert_one(file_info)

# def get_file_from_minio(file_id):
#     # For demo, just return the MinIO URL
#     return f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{file_id}" 