import types, asyncio, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
import DataStorageRetrieval.db.registry as registry

def test_fetch_allowed_apps(monkeypatch):
    class Conn:
        async def fetch(self, query, user_id, client_id):
            return [{"id": 1, "name": "AppA"}, {"id": 2, "name": "AppB"}]
        async def close(self):
            pass
    async def connect(**kw):
        return Conn()
    monkeypatch.setattr(registry, "asyncpg", types.SimpleNamespace(connect=connect))
    apps = asyncio.run(registry.fetch_allowed_apps(1, 10))
    assert apps == [{"app_id": 1, "app_name": "AppA"}, {"app_id": 2, "app_name": "AppB"}]

def test_register_project_session(monkeypatch):
    executed = []
    json_payloads = []
    class Conn:
        async def execute(self, query, *params):
            executed.append((query, params))
        async def close(self):
            pass
    async def connect(**kw):
        return Conn()
    def Json(d):
        json_payloads.append(d)
        return d
    monkeypatch.setattr(registry, "asyncpg", types.SimpleNamespace(connect=connect, Json=Json))
    data = {
        "user_id": 1,
        "username": "user",
        "role": "role",
        "client_id": 2,
        "client_name": "client",
        "app_id": 3,
        "app_name": "app",
        "project_id": 4,
        "project_name": "project",
        "session_id": "sess",
        "active_mode": "mode",
        "minio_prefix": "pref",
        "env_variables": {
            "identifiers": ["id"],
            "measures": ["m"],
            "dimension_mapping": {"id": "dim"},
        },
        "tenant_schema_name": "tenant",
    }
    asyncio.run(registry.register_project_session(data))
    # first query sets search path to the tenant schema
    assert executed[0][0].startswith("SET search_path TO tenant")
    assert any("registry_project" in q for q, _ in executed)
    assert any("registry_session" in q for q, _ in executed)
    assert json_payloads[0] == data["env_variables"]
    assert json_payloads[1] == data["env_variables"]
