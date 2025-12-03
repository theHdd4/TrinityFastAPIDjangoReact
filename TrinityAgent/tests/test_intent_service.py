import sys
from pathlib import Path

import pytest

# Ensure TrinityAgent package is importable when tests run from repo root
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from STREAMAI.intent_records import IntentRecord
from STREAMAI.intent_service import LaboratoryIntentService


class StubIntentService(LaboratoryIntentService):
    """Override LLM extraction to avoid network calls during tests."""

    def _llm_extract(self, message, scratchpad, mode="laboratory"):
        record = IntentRecord()
        record.goal_type = "execute"
        record.required_tools = {"atom"}
        record.confidence = {"goal_type": 0.9, "required_tools": 0.9}
        return record


@pytest.fixture
def service():
    return StubIntentService()


def test_infer_intent_merges_rule_and_llm(service):
    record = service.infer_intent("Upload csv and plot chart", session_id="abc", available_files=["demo.csv"])
    assert record.goal_type == "execute"
    assert "atom" in record.required_tools
    # Evidence from rule-based hints should be present
    assert record.evidence


def test_routing_requires_files_clarification(service):
    record = service.infer_intent("plot chart", session_id="session-2", available_files=[])
    decision = service.route_decision(record, available_files=[])
    assert decision.path in {"atom_agents", "mixed"}
    assert any("file" in clar.lower() for clar in decision.clarifications)


def test_policy_flip_detection(service):
    first_record = IntentRecord(goal_type="ask", required_tools={"llm"})
    service.persist_record("session-3", first_record)
    new_decision = service.route_decision(IntentRecord(goal_type="execute", required_tools={"atom"}))
    assert service.detect_policy_flip("session-3", new_decision) is True
