import os
import types
import asyncio
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "app" / "features" / "data_upload_validate" / "app" / "routes.py"

source = ROUTES.read_text()
mod = ast.parse(source)
funcs = [
    n
    for n in mod.body
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    and n.name in ["_parse_numeric_id", "_strip_suffix", "get_object_prefix"]
]
mini = ast.Module(body=funcs, type_ignores=[])
code = compile(mini, str(ROUTES), "exec")
ns = {"os": os}

class DummyRedis:
    def __init__(self):
        self.store = {}
    def get(self, k):
        return self.store.get(k)
    def set(self, *a, **k):
        self.store[a[0]] = a[1] if len(a) > 1 else None

async def fake_get_env_vars(*a, **k):
    return {"CLIENT_NAME": "c", "APP_NAME": "a", "PROJECT_NAME": "Proj Name"}

async def fake_fetch(*a, **k):
    return ("c", "a", "Proj Name")

ns.update({
    "redis_client": DummyRedis(),
    "get_env_vars": fake_get_env_vars,
    "fetch_client_app_project": fake_fetch,
})
exec(code, ns)
get_object_prefix = ns["get_object_prefix"]


def test_prefix_uses_plain_project_name():
    os.environ["CLIENT_NAME"] = "c"
    os.environ["APP_NAME"] = "a"
    os.environ["PROJECT_NAME"] = "Proj Name"
    prefix = asyncio.run(get_object_prefix())
    assert prefix == "c/a/Proj Name/"


def test_prefix_strips_hyphen_suffix():
    os.environ["CLIENT_NAME"] = "c"
    os.environ["APP_NAME"] = "a"
    os.environ["PROJECT_NAME"] = "Proj Name-12345"
    prefix = asyncio.run(get_object_prefix())
    assert prefix == "c/a/Proj Name/"
