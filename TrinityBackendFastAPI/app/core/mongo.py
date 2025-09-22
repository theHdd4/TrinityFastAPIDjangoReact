"""Helper utilities for building MongoDB connection strings.

This module centralises logic for constructing MongoDB URIs that depend on
environment variables.  Several features connect to the shared MongoDB
instance and previously duplicated the logic for falling back to a hard-coded
development IP address.  By resolving the host at runtime we respect the
``HOST_IP`` (or optional ``MONGO_HOST``) value that is injected into the
containers and avoid embedding stale addresses in code.
"""

from __future__ import annotations

import os
from typing import Iterable, Tuple


def _first_non_empty(vars_: Iterable[str], default: str) -> str:
    """Return the first non-empty environment variable from ``vars_``.

    Parameters
    ----------
    vars_:
        Iterable of environment variable names to examine in order.
    default:
        Value returned when none of the environment variables is defined with
        a non-empty value.
    """

    for name in vars_:
        value = os.getenv(name)
        if value is None:
            continue
        stripped = value.strip()
        if stripped:
            return stripped
    return default


def build_host_mongo_uri(
    *,
    username: str = "admin_dev",
    password: str = "pass_dev",
    auth_source: str = "admin",
    default_host: str = "localhost",
    default_port: str = "9005",
    host_env_vars: Tuple[str, ...] = ("HOST_IP", "MONGO_HOST"),
    port_env_vars: Tuple[str, ...] = ("MONGO_PORT",),
    auth_source_env_vars: Tuple[str, ...] = ("MONGO_AUTH_SOURCE", "MONGO_AUTH_DB"),
) -> str:
    """Construct a MongoDB URI using host information from the environment.

    The helper prefers ``HOST_IP`` because Docker Compose injects the external
    host address via that variable.  ``MONGO_HOST`` and ``MONGO_PORT`` act as
    fallbacks so existing deployments that rely on those values keep working.
    Credentials default to the development account but can be overridden by
    passing different ``username``/``password`` arguments.
    """

    host = _first_non_empty(host_env_vars, default_host)
    port = _first_non_empty(port_env_vars, default_port)
    auth_db = _first_non_empty(auth_source_env_vars, auth_source)

    credentials = ""
    if username and password:
        credentials = f"{username}:{password}@"
    elif username:
        credentials = f"{username}@"

    return f"mongodb://{credentials}{host}:{port}/?authSource={auth_db}"

