from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.core.mongo import build_host_mongo_uri

DEFAULT_DATABASE = os.getenv("MONGO_DB", "trinity_db")
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "Exhibition_Configuration")


def _default_mongo_uri() -> str:
    auth_source = os.getenv("MONGO_AUTH_SOURCE")
    options: dict[str, str] = {}
    if auth_source:
        options["authSource"] = auth_source

    return build_host_mongo_uri(
        database=DEFAULT_DATABASE,
        options=options or None,
    )


def _mongo_auth_kwargs(uri: str) -> dict[str, str]:
    # If credentials are already embedded in the URI (i.e. contains '@'),
    # the client will authenticate using those values so we avoid providing
    # duplicate username/password parameters.
    if "@" in uri.split("//", 1)[-1]:
        return {}

    username = os.getenv("MONGO_USERNAME", "").strip()
    password = os.getenv("MONGO_PASSWORD", "").strip()
    auth_source = os.getenv("MONGO_AUTH_SOURCE", "").strip() or "admin"
    auth_mechanism = os.getenv("MONGO_AUTH_MECHANISM", "").strip()

    kwargs: dict[str, str] = {}
    if username:
        kwargs["username"] = username
    if password:
        kwargs["password"] = password
    if (username or password) and auth_source:
        kwargs["authSource"] = auth_source
    if auth_mechanism:
        kwargs["authMechanism"] = auth_mechanism

    return kwargs


@lru_cache(maxsize=1)
def get_mongo_client() -> AsyncIOMotorClient:
    uri = os.getenv("EXHIBITION_MONGO_URI") or os.getenv("MONGO_URI") or _default_mongo_uri()
    auth_kwargs = _mongo_auth_kwargs(uri)
    return AsyncIOMotorClient(uri, **auth_kwargs)


def get_database(client: AsyncIOMotorClient = Depends(get_mongo_client)) -> AsyncIOMotorDatabase:
    default_db = client.get_default_database()
    if default_db is not None:
        return default_db
    return client[DEFAULT_DATABASE]


def get_exhibition_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    return database[DEFAULT_COLLECTION]
