import sys
import types
import importlib.util
from pathlib import Path
import asyncio

# Build minimal package hierarchy to satisfy imports inside utils
sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules.setdefault("app.features", types.ModuleType("app.features"))
sys.modules.setdefault(
    "app.features.feature_overview", types.ModuleType("app.features.feature_overview")
)
fo_deps = types.ModuleType("app.features.feature_overview.deps")
fo_deps.redis_client = None
sys.modules["app.features.feature_overview.deps"] = fo_deps

sys.modules.setdefault("apps", types.ModuleType("apps"))
sys.modules.setdefault("apps.accounts", types.ModuleType("apps.accounts"))
acc_utils = types.ModuleType("apps.accounts.utils")
async def dummy_get_env_vars(*a, **k):
    raise Exception("django not available")
acc_utils.get_env_vars = dummy_get_env_vars
sys.modules["apps.accounts.utils"] = acc_utils

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "app.core.utils", ROOT / "app" / "core" / "utils.py"
)
utils = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = utils
spec.loader.exec_module(utils)


def test_project_id_override(monkeypatch):
    async def fake_query_env_vars(client_id, app_id, project_id):
        return None

    async def fake_query_env_vars_by_names(client_name, app_name, project_name):
        # ensure the inferred name from project_id is used with original case
        assert project_name == "NewProj"
        return {
            "CLIENT_NAME": client_name,
            "APP_NAME": app_name,
            "PROJECT_NAME": project_name,
        }

    monkeypatch.setattr(utils, "_query_env_vars", fake_query_env_vars)
    monkeypatch.setattr(utils, "_query_env_vars_by_names", fake_query_env_vars_by_names)

    env = asyncio.run(
        utils.get_env_vars(
            "cid",
            "aid",
            "NewProj_1",
            client_name="client",
            app_name="app",
            project_name="oldproj",
            use_cache=False,
        )
    )

    assert env["PROJECT_NAME"] == "NewProj"
    assert env["CLIENT_NAME"] == "client"
    assert env["APP_NAME"] == "app"
