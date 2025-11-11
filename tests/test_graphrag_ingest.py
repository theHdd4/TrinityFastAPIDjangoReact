from __future__ import annotations

import json
from pathlib import Path

from TrinityAI.STREAMAI.graphrag.config import GraphRAGWorkspaceConfig
from TrinityAI.STREAMAI.graphrag.ingest_atoms import (
    DocumentRecord,
    collect_documents,
    write_workspace_documents,
)


def test_collect_documents_discovers_atom_material():
    repo_root = Path(__file__).resolve().parents[1]
    documents = collect_documents(repo_root)

    assert documents, "Expected at least one document from atom knowledge base"

    source_types = {doc.metadata.get("source_type") for doc in documents}
    assert {"agent_readme", "atom_knowledge_profile", "workflow_catalog"} <= source_types


def test_write_workspace_documents_persists_records(tmp_path: Path):
    config = GraphRAGWorkspaceConfig(workspace_root=tmp_path)
    records = [
        DocumentRecord(
            document_id="test-doc",
            title="Test Document",
            content="## Sample Content",
            source_path=tmp_path / "source.md",
            metadata={"source_type": "unit_test"},
        )
    ]

    write_workspace_documents(records, config=config, clean_workspace=True)

    document_file = config.documents_dir / "test-doc.md"
    metadata_index = config.metadata_dir / "documents.jsonl"

    assert document_file.exists()
    assert metadata_index.exists()

    payload = metadata_index.read_text(encoding="utf-8").strip()
    assert payload
    metadata_entry = json.loads(payload)
    assert metadata_entry["id"] == "test-doc"
    assert metadata_entry["metadata"]["source_type"] == "unit_test"


