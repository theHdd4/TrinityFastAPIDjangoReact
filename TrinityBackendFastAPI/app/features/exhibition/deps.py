from __future__ import annotations

import logging
import os
from functools import lru_cache

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

try:  # pragma: no cover - pymongo should be present but guard for tests
    from pymongo.errors import CollectionInvalid, PyMongoError
except Exception:  # pragma: no cover - executed only when pymongo missing
    CollectionInvalid = Exception  # type: ignore[assignment]
    PyMongoError = Exception  # type: ignore[assignment]

from .mongo import DEFAULT_COLLECTION, DEFAULT_DATABASE, resolve_mongo_connection

LAYOUT_COLLECTION = os.getenv("EXHIBITION_LAYOUT_COLLECTION", "exhibition_list_configuration")


@lru_cache(maxsize=1)
def get_mongo_client() -> AsyncIOMotorClient:
    uri, auth_kwargs = resolve_mongo_connection()
    return AsyncIOMotorClient(uri, **auth_kwargs)


def get_database(client: AsyncIOMotorClient = Depends(get_mongo_client)) -> AsyncIOMotorDatabase:
    default_db = client.get_default_database()
    if default_db is not None:
        return default_db
    return client[DEFAULT_DATABASE]


async def get_exhibition_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    async def _ensure_collection() -> None:
        try:
            collections = await database.list_collection_names()
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to list Mongo collections for exhibition catalogue: %s", exc)
            return

        if DEFAULT_COLLECTION in collections:
            return

        try:
            await database.create_collection(DEFAULT_COLLECTION)
        except CollectionInvalid:
            # Collection created concurrently by another process.
            pass
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to create exhibition catalogue collection: %s", exc)

    await _ensure_collection()

    return database[DEFAULT_COLLECTION]


async def get_exhibition_layout_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    async def _ensure_collection() -> None:
        try:
            collections = await database.list_collection_names()
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to list Mongo collections for exhibition layouts: %s", exc)
            return

        if LAYOUT_COLLECTION in collections:
            return

        try:
            await database.create_collection(LAYOUT_COLLECTION)
        except CollectionInvalid:
            # Collection created concurrently by another process.
            pass
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to create exhibition layout collection: %s", exc)

    await _ensure_collection()

    return database[LAYOUT_COLLECTION]
