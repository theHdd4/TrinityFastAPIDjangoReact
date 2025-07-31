import os
import types
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
