from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.core.mongo import build_host_mongo_uri

DEFAULT_DATABASE = os.getenv("MONGO_DB", "trinity_db")
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "Exhibition_Configuration")
DEFAULT_CATALOGUE_COLLECTION = os.getenv("EXHIBITION_CATALOGUE_COLLECTION", "exhibition_catalogue")


def _default_mongo_uri() -> str:
    """Construct the exhibition Mongo URI using runtime configuration."""

    username_env = os.getenv("MONGO_USERNAME")
    password_env = os.getenv("MONGO_PASSWORD")

    username = (
        username_env.strip()
        if isinstance(username_env, str) and username_env.strip()
        else "admin_dev"
    )
    password = (
        password_env.strip()
        if isinstance(password_env, str) and password_env.strip()
        else "pass_dev"
    )

    auth_source_env = os.getenv("MONGO_AUTH_SOURCE")
    auth_source = (
        auth_source_env.strip()
        if isinstance(auth_source_env, str) and auth_source_env.strip()
        else "admin"
    )

    return build_host_mongo_uri(
        username=username,
        password=password,
        auth_source=auth_source,
        database=DEFAULT_DATABASE,
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


def get_exhibition_catalogue_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    return database[DEFAULT_CATALOGUE_COLLECTION]
