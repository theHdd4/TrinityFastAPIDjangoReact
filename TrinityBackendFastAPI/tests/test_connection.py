import os
import types
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from DataStorageRetrieval.db.connection import get_tenant_schema


def test_get_tenant_schema(monkeypatch):
    monkeypatch.delenv("TENANT_SCHEMA", raising=False)
    monkeypatch.delenv("TENANT_NAME", raising=False)
    monkeypatch.delenv("CLIENT_NAME", raising=False)
    assert get_tenant_schema() is None

    monkeypatch.setenv("TENANT_NAME", "demo")
    assert get_tenant_schema() == "demo_schema"

    monkeypatch.setenv("TENANT_NAME", "demo_schema")
    assert get_tenant_schema() == "demo_schema"

    assert get_tenant_schema("Quant_Matrix_AI") == "Quant_Matrix_AI_schema"
    assert get_tenant_schema("Quant_Matrix_AI_Schema") == "Quant_Matrix_AI_Schema"
