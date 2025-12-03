import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

import pytest

from STREAMAI.stream_orchestrator import StreamOrchestrator


class DummyLoader:
    def __init__(self):
        self.set_calls = []
        self.load_calls = []

    def set_context(self, client_name: str, app_name: str, project_name: str):
        self.set_calls.append((client_name, app_name, project_name))

    def load_files(self, client_name: str, app_name: str, project_name: str):
        self.load_calls.append((client_name, app_name, project_name))
        return {"tenant/app/proj/sample.csv": {"columns": ["a"], "file_name": "sample.csv"}}


class DummyResolver:
    def __init__(self):
        self.updated = None

    def update_files(self, files_with_columns):
        self.updated = files_with_columns


def _orchestrator_with_context():
    orchestrator = StreamOrchestrator.__new__(StreamOrchestrator)
    orchestrator.file_loader = DummyLoader()
    orchestrator.file_context_resolver = DummyResolver()
    orchestrator._raw_files_with_columns = {}
    orchestrator._last_context_selection = None
    orchestrator._current_context = {
        "client_name": "tenant",
        "app_name": "app",
        "project_name": "proj",
    }
    return orchestrator


def test_refresh_file_context_prefers_current_sequence_context():
    orchestrator = _orchestrator_with_context()

    orchestrator._refresh_file_context()

    assert orchestrator.file_loader.set_calls[-1] == ("tenant", "app", "proj")
    assert orchestrator.file_loader.load_calls[-1] == ("tenant", "app", "proj")
    assert orchestrator.file_context_resolver.updated


def test_execute_atom_refreshes_context_with_current_path():
    orchestrator = _orchestrator_with_context()
    orchestrator.config = {}
    orchestrator.fastapi_backend = "http://example"
    orchestrator.storage = None

    refresh_calls = []

    def refresh_spy(client_name: str, app_name: str, project_name: str):
        refresh_calls.append((client_name, app_name, project_name))

    orchestrator._refresh_file_context = refresh_spy
    orchestrator._augment_prompt_with_context = (
        lambda prompt, atom, client_name, app_name, project_name: prompt
    )
    orchestrator._step1_add_card = AsyncMock(return_value={"success": True, "card_id": "card-1"})
    orchestrator._step2_fetch_atom = AsyncMock(return_value={"success": True})
    orchestrator._step3_execute_atom = AsyncMock(return_value={"success": True, "data": {}})
    orchestrator._generate_step_insight = AsyncMock(return_value=None)

    async def run_atom():
        return await orchestrator._execute_atom_3_steps(
            atom={"atom_id": "dataframe-ops", "prompt": "do work"},
            session_id="sess-1",
            atom_index=1,
            total_atoms=1,
        )

    result = asyncio.run(run_atom())

    assert result["success"] is True
    assert refresh_calls[-1] == ("tenant", "app", "proj")
