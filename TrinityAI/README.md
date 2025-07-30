# Trinity AI Services

This directory houses the language model driven services used by the Trinity platform. The Dockerfile builds a container exposing these APIs on port **8002**. The examples below assume the host machine is reachable at **10.2.1.242**.

The frontend references these URLs directly so the host and port must match your deployment. Each subfolder contains the implementation for a specific agent.

- **Agent_fetch_atom** – main chat endpoint that detects which atom/tool fits a user query.
- **Agent_concat** – assists with concatenation configuration.
- **Agent_Merge** – assists with dataset merges.
- **Agent_chart_maker** – internal helpers for chart making (no standalone API).

See the individual READMEs for details and exact endpoints.

The AI agents read `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` and
`MINIO_SECRET_KEY` from the environment to fetch files. The endpoint
value comes from your `.env` or docker-compose configuration so dev and
prod agents can target their respective MinIO services.
