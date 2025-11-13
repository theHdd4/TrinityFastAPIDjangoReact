# Trinity AI Services

This directory houses the language model driven services used by the Trinity platform. The Dockerfile builds a container exposing these APIs on port **8002**. The examples below assume the host machine is reachable at **192.168.1.98**.

The frontend references these URLs directly so the host and port must match your deployment. Each subfolder contains the implementation for a specific agent.

- **Agent_fetch_atom** – main chat endpoint that detects which atom/tool fits a user query.
- **Agent_concat** – assists with concatenation configuration.
- **Agent_Merge** – assists with dataset merges.
- **Agent_chart_maker** – internal helpers for chart making (no standalone API).

Each agent folder uses a small `ai_logic.py` module that contains only the
prompt building and JSON parsing required for the language model. The FastAPI
apps and file management code import this module so an AI expert can adjust the
behaviour by editing a single file. To create a new agent simply copy an
existing folder, tweak `ai_logic.py` and wire up the endpoints.

See the individual READMEs for details and exact endpoints.

The AI agents read `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` and
`MINIO_SECRET_KEY` from the environment to fetch files. The endpoint
value comes from your `.env` or docker-compose configuration so dev and
prod agents can target their respective MinIO services.

## Persistent Memory Service

Trinity AI chat history can now be stored in MinIO instead of the
browser's `localStorage`. The new memory endpoints live under
`/trinityai/memory/...` and use the following environment variables:

- `TRINITY_AI_MEMORY_PREFIX` – root folder inside the MinIO bucket
  (defaults to `trinity-ai-memory`).
- `TRINITY_AI_MEMORY_BUCKET` – bucket that holds chat data. Defaults to
  the standard `MINIO_BUCKET`.
- `TRINITY_AI_MEMORY_MAX_MESSAGES` – retention window per chat
  (defaults to 400 messages).
- `TRINITY_AI_MEMORY_MAX_BYTES` – hard limit for a single chat payload
  in bytes (defaults to 2 MB).

Chats are stored under
`{PREFIX}/{PROJECT_NAME}/chats/{chatId}/messages.json`.
Session state is persisted alongside the chat transcripts in the same
project-aware hierarchy: `{PREFIX}/{PROJECT_NAME}/sessions/{sessionId}/context.json`.

The path structure is simplified to match the project structure:
- `trinity/trinity_ai_memory/[PROJECT_NAME]/chats/` - for chat history
- `trinity/trinity_ai_memory/[PROJECT_NAME]/sessions/` - for session context

Where `PROJECT_NAME` comes from the `PROJECT_NAME` environment variable, or defaults to "default" if not set.