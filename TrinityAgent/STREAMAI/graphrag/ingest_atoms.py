"""
Assemble Trinity atom documentation into a GraphRAG workspace.

Phase 1 of the GraphRAG migration focuses on building a repeatable ingestion
pipeline that collects the existing atom READMEs, prompt manuals, and RAG JSON
artifacts and writes them to the directory layout expected by the official
``graphrag`` CLI. Later phases can invoke ``graphrag index`` / ``graphrag query``
directly against this workspace.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Sequence

from .config import DEFAULT_WORKSPACE_CONFIG, GraphRAGWorkspaceConfig

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DocumentRecord:
    """Represents a single document destined for the GraphRAG workspace."""

    document_id: str
    title: str
    content: str
    source_path: Path
    metadata: dict


def slugify(value: str) -> str:
    """Create a filesystem-friendly slug."""
    keep_chars = []
    for ch in value.lower():
        if ch.isalnum():
            keep_chars.append(ch)
        elif ch in {"-", "_"}:
            keep_chars.append(ch)
        else:
            keep_chars.append("-")
    slug = "".join(keep_chars).strip("-")
    return slug or "document"


def gather_agent_readmes(agent_root: Path) -> Iterator[DocumentRecord]:
    """Collect README files from each Agent directory."""
    for candidate_path in sorted(agent_root.glob("Agent_*/*.md")):
        if candidate_path.name.lower() != "readme.md":
            continue
        readme_path = candidate_path
        text = readme_path.read_text(encoding="utf-8")
        atom_id = readme_path.parent.name.replace("Agent_", "").lower()
        document_id = f"agent-readme-{slugify(atom_id)}"
        title = f"{atom_id} agent manual"

        metadata = {
            "atom_id": atom_id,
            "source_type": "agent_readme",
            "original_path": str(readme_path.relative_to(agent_root.parent)),
        }

        yield DocumentRecord(
            document_id=document_id,
            title=title,
            content=text,
            metadata=metadata,
            source_path=readme_path,
        )


def render_atom_entry(category_name: str, category_description: str, atom_info: dict) -> str:
    """Convert an atom entry from the knowledge base into rich markdown."""
    lines: List[str] = [
        f"# {atom_info.get('title', atom_info.get('id', 'Atom'))}",
        "",
        f"**Atom ID:** {atom_info.get('id', 'unknown')}",
        f"**Category:** {category_name}",
    ]

    if category_description:
        lines.append(f"**Category Summary:** {category_description}")

    description = atom_info.get("description")
    if description:
        lines.extend(["", "## Description", description])

    def _append_section(header: str, values: Sequence[str]) -> None:
        if not values:
            return
        lines.extend(["", f"## {header}"])
        for value in values:
            lines.append(f"- {value}")

    _append_section("Tags", atom_info.get("tags", []))
    _append_section("Capabilities", atom_info.get("capabilities", []))
    _append_section("Use Cases", atom_info.get("use_cases", []))
    _append_section("Outputs", atom_info.get("outputs", []))
    _append_section("Typical Next Atoms", atom_info.get("typical_next_atoms", []))

    typical_role = atom_info.get("typical_workflow_role")
    if typical_role:
        lines.extend(["", "## Typical Workflow Role", typical_role])

    business_value = atom_info.get("business_value")
    if business_value:
        lines.extend(["", "## Business Value", business_value])

    when_to_use = atom_info.get("when_to_use")
    if when_to_use:
        _append_section("When To Use", when_to_use)

    example_requests = atom_info.get("example_requests")
    if example_requests:
        _append_section("Example Requests", example_requests)

    prompt_guidelines = atom_info.get("prompt_guidelines")
    if prompt_guidelines:
        _append_section("Prompt Guidelines", prompt_guidelines)

    return "\n".join(lines)


def gather_atom_knowledge(rag_root: Path) -> Iterator[DocumentRecord]:
    """Explode ``atoms_knowledge_base.json`` into per-atom documents."""
    knowledge_file = rag_root / "atoms_knowledge_base.json"
    if not knowledge_file.exists():
        logger.warning("Atom knowledge base file missing: %s", knowledge_file)
        return

    data = json.loads(knowledge_file.read_text(encoding="utf-8"))
    categories = data.get("categories", {})

    for category_key, category_info in categories.items():
        atoms = category_info.get("atoms", [])
        for atom in atoms:
            atom_id = atom.get("id", slugify(atom.get("title", "atom")))
            document_id = f"knowledge-{slugify(atom_id)}"
            title = f"{atom.get('title', atom_id)} knowledge profile"

            content = render_atom_entry(
                category_name=category_info.get("name", category_key),
                category_description=category_info.get("description", ""),
                atom_info=atom,
            )

            metadata = {
                "atom_id": atom_id,
                "source_type": "atom_knowledge_profile",
                "category_key": category_key,
                "category_name": category_info.get("name"),
                "original_path": str(knowledge_file.relative_to(rag_root.parent)),
            }

            yield DocumentRecord(
                document_id=document_id,
                title=title,
                content=content,
                metadata=metadata,
                source_path=knowledge_file,
            )


def gather_json_catalogs(rag_root: Path) -> Iterator[DocumentRecord]:
    """
    Convert the remaining workflow-mode JSON catalogs into documents.

    Each catalog becomes a single document, preserving the JSON structure in a
    pretty-printed form so GraphRAG can surface schema-level relationships.
    """
    catalog_files = [
        "atom_sequences.json",
        "atom_requirements.json",
        "atom_knowledge_prompts.json",
        "molecule_patterns.json",
        "workflow_sequences.json",
        "use_case_workflows.json",
    ]

    for file_name in catalog_files:
        json_path = rag_root / file_name
        if not json_path.exists():
            logger.warning("Catalog file missing: %s", json_path)
            continue

        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as decode_error:
            logger.error("Unable to parse %s: %s", json_path, decode_error)
            continue

        document_id = f"catalog-{slugify(file_name.replace('.json', ''))}"
        title = f"{file_name} catalog"
        content = json.dumps(data, indent=2, ensure_ascii=False)

        metadata = {
            "source_type": "workflow_catalog",
            "catalog_name": file_name,
            "original_path": str(json_path.relative_to(rag_root.parent)),
        }

        yield DocumentRecord(
            document_id=document_id,
            title=title,
            content=content,
            metadata=metadata,
            source_path=json_path,
        )


def collect_documents(source_root: Path) -> List[DocumentRecord]:
    """Gather all documents from the Trinity atom knowledge base."""
    trinity_root = source_root / "TrinityAgent" if (source_root / "TrinityAgent").exists() else source_root
    workflow_rag_root = trinity_root / "workflow_mode" / "rag"

    documents: List[DocumentRecord] = []
    documents.extend(gather_agent_readmes(trinity_root))
    documents.extend(gather_atom_knowledge(workflow_rag_root))
    documents.extend(gather_json_catalogs(workflow_rag_root))

    logger.info("Collected %d documents for GraphRAG ingestion", len(documents))
    return documents


def write_workspace_documents(
    records: Sequence[DocumentRecord],
    config: GraphRAGWorkspaceConfig,
    clean_workspace: bool = False,
) -> None:
    """Persist the prepared documents and metadata to disk."""
    if clean_workspace and config.workspace_root.exists():
        logger.info("Cleaning existing workspace at %s", config.workspace_root)
        shutil.rmtree(config.workspace_root)

    documents_dir = config.documents_dir
    metadata_dir = config.metadata_dir

    documents_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    metadata_index_path = metadata_dir / "documents.jsonl"
    with metadata_index_path.open("w", encoding="utf-8") as metadata_file:
        for record in records:
            document_file = documents_dir / f"{record.document_id}.md"
            header = f"# {record.title}\n\n"
            document_file.write_text(header + record.content, encoding="utf-8")

            metadata_payload = {
                "id": record.document_id,
                "title": record.title,
                "metadata": record.metadata,
                "source_path": str(record.source_path),
            }
            metadata_file.write(json.dumps(metadata_payload, ensure_ascii=False) + "\n")

    logger.info("Workspace written to %s", config.workspace_root)
    logger.info("Metadata index created at %s", metadata_index_path)


def parse_args(args: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build / refresh the GraphRAG workspace from Trinity atom docs.",
    )
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=DEFAULT_WORKSPACE_CONFIG.workspace_root,
        help="Destination directory for the GraphRAG workspace.",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
        help="Repository root containing the TrinityAgent assets.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="If set, remove any existing workspace before regenerating.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args(args)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO),
        format="%(levelname)s %(message)s",
    )

    workspace_config = GraphRAGWorkspaceConfig(workspace_root=args.workspace_root)

    documents = collect_documents(source_root=args.source_root)
    if not documents:
        logger.warning("No documents discovered; workspace will remain empty.")
        return

    write_workspace_documents(
        records=documents,
        config=workspace_config,
        clean_workspace=args.clean,
    )

    logger.info(
        "Workspace ready. Run `graphrag index --root %s` to build the graph.",
        workspace_config.workspace_root,
    )


if __name__ == "__main__":
    main()


