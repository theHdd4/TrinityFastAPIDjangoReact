# Stream AI ↔ GraphRAG Workspace

Phase 1 of the GraphRAG migration introduces a repeatable way to build a graph
workspace from Trinity's existing atom documentation.

## Layout

- `ingest_atoms.py` – collects agent READMEs, atom knowledge JSON, and workflow
  catalogues into the structure expected by the `graphrag` CLI.
- `settings.template.yaml` – starter configuration. Copy to
  `<workspace>/settings.yaml` and customise provider credentials/models.
- `graphrag_workspace/` (generated) – storage root produced by the ingestion
  script. Matches the structure created by `graphrag init`.

## Bootstrapping the Workspace

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Generate the workspace (from the repo root):
   ```bash
   python -m TrinityAgent.STREAMAI.graphrag.ingest_atoms --clean
   ```
   This creates `TrinityAgent/STREAMAI/graphrag_workspace/input/...`.
3. Copy the settings template:
   ```bash
   cp TrinityAgent/STREAMAI/graphrag/settings.template.yaml \
      TrinityAgent/STREAMAI/graphrag_workspace/settings.yaml
   ```
   Update the file with your OpenAI/Azure credentials or the provider of choice.
4. Build the graph with Microsoft's CLI:
   ```bash
   graphrag index --root TrinityAgent/STREAMAI/graphrag_workspace
   ```

The resulting workspace is what Phase 2 will query from the Stream AI planner.

## Notes

- The ingestion script is idempotent and can be re-run whenever source docs
  change. Use `--clean` to rebuild from scratch.
- Metadata is stored in `input/metadata/documents.jsonl` for downstream tests.
- The script can target a custom workspace:
  ```bash
  python -m TrinityAgent.STREAMAI.graphrag.ingest_atoms --workspace-root /tmp/graphrag
  ```
- Further integration (hooking the planner into GraphRAG queries) will land in
  Phase 2.



