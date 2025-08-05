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
    class Conn:
        async def execute(self, query, *params):
            executed.append(query)
        async def close(self):
            pass
    async def connect(**kw):
        return Conn()
    monkeypatch.setattr(registry, "asyncpg", types.SimpleNamespace(connect=connect, Json=lambda d: d))
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
        "env_variables": {"k": "v"},
        "tenant_schema_name": "tenant",
    }
    asyncio.run(registry.register_project_session(data))
    assert any("registry_project" in q for q in executed)
    assert any("registry_session" in q for q in executed)
