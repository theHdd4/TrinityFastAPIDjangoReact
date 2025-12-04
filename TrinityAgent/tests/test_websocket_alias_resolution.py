import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from STREAMAI.websocket_orchestrator import StreamWebSocketOrchestrator


@pytest.fixture
def orchestrator():
    instance = StreamWebSocketOrchestrator.__new__(StreamWebSocketOrchestrator)
    instance._output_alias_registry = {}
    return instance


def test_resolve_alias_value_ignores_non_string_tokens(orchestrator):
    orchestrator._output_alias_registry["seq"] = {"alias": "tenant/app/file.arrow"}

    token = {"alias": "{alias}"}

    assert orchestrator._resolve_alias_value("seq", token) is token


def test_register_output_alias_skips_non_string_aliases(orchestrator):
    orchestrator._register_output_alias("seq", {"bad": "alias"}, "tenant/app/file.arrow")

    assert orchestrator._output_alias_registry == {}


def test_register_and_resolve_valid_alias(orchestrator):
    orchestrator._register_output_alias("seq", "{Alias}", "tenant/app/file.arrow")

    resolved = orchestrator._resolve_alias_value("seq", "{Alias}")

    assert resolved == "tenant/app/file.arrow"
