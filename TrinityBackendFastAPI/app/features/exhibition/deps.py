from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.core.mongo import build_host_mongo_uri

DEFAULT_DATABASE = os.getenv("MONGO_DB", "trinity_db")
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "Exhibition_Configuration")


def _default_mongo_uri() -> str:
    username = os.getenv("MONGO_USERNAME", "root")
    password = os.getenv("MONGO_PASSWORD", "rootpass")
    auth_source = os.getenv("MONGO_AUTH_SOURCE", "admin")
    return build_host_mongo_uri(
        username=username,
        password=password,
        auth_source=auth_source,
        database=DEFAULT_DATABASE,
    )


@lru_cache(maxsize=1)
def get_mongo_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGO_URI", _default_mongo_uri())
    return AsyncIOMotorClient(uri)


def get_database(client: AsyncIOMotorClient = Depends(get_mongo_client)) -> AsyncIOMotorDatabase:
    default_db = client.get_default_database()
    if default_db is not None:
        return default_db
    return client[DEFAULT_DATABASE]


def get_exhibition_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    return database[DEFAULT_COLLECTION]
