import sys
import types
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from STREAMAI.websocket_orchestrator import StreamWebSocketOrchestrator


class InstrumentedReader:
    instances = []

    def __init__(self):
        self.prefix_calls = []
        self.column_calls = []
        InstrumentedReader.instances.append(self)

    def _maybe_update_prefix(self, client_name: str, app_name: str, project_name: str):
        self.prefix_calls.append((client_name, app_name, project_name))

    def get_file_columns(self, file_path: str):
        self.column_calls.append(file_path)
        return ["col_a", "col_b"]


@pytest.fixture(autouse=True)
def patch_file_reader(monkeypatch):
    fake_module = types.SimpleNamespace(FileReader=InstrumentedReader)
    monkeypatch.setitem(sys.modules, "BaseAgent.file_reader", fake_module)
    monkeypatch.setitem(sys.modules, "TrinityAgent.BaseAgent.file_reader", fake_module)
    InstrumentedReader.instances.clear()
    yield
    InstrumentedReader.instances.clear()


def _orchestrator_with_context():
    orchestrator = StreamWebSocketOrchestrator.__new__(StreamWebSocketOrchestrator)
    orchestrator._sequence_project_context = {
        "seq-ctx": {
            "client_name": "tenant",
            "app_name": "app",
            "project_name": "proj",
        }
    }
    orchestrator._sequence_available_files = {
        "seq-ctx": ["tenant/app/proj/D0_MMM.arrow"]
    }
    return orchestrator


def test_get_file_metadata_uses_sequence_context_for_prefix():
    orchestrator = _orchestrator_with_context()

    metadata = orchestrator._get_file_metadata(
        ["tenant/app/proj/D0_MMM.arrow"], sequence_id="seq-ctx"
    )

    assert metadata["tenant/app/proj/D0_MMM.arrow"]["columns"] == ["col_a", "col_b"]
    reader = InstrumentedReader.instances[0]
    assert reader.prefix_calls[-1] == ("tenant", "app", "proj")
    assert reader.column_calls[0] == "tenant/app/proj/D0_MMM.arrow"


def test_get_file_metadata_resolves_context_from_files_when_missing_sequence():
    orchestrator = _orchestrator_with_context()

    metadata = orchestrator._get_file_metadata(["tenant/app/proj/D0_MMM.arrow"])

    assert metadata["tenant/app/proj/D0_MMM.arrow"]["columns"] == ["col_a", "col_b"]
    reader = InstrumentedReader.instances[0]
    assert reader.prefix_calls[-1] == ("tenant", "app", "proj")
