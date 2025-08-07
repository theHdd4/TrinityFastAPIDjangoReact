# Agent_fetch_atom

This module powers the main chat endpoint used to determine which atom the user needs. The service runs as part of the `trinity-ai` container and listens on port **8002**.

## Endpoints

- `POST http://192.168.1.98:8002/trinityai/chat` – analyse a natural language query and return the best matching atom in JSON format.
- `GET http://192.168.1.98:8002/trinityai/health` – health check for the service.
- `GET http://192.168.1.98:8002/trinityai/debug/{query}` – debug a query and view the processing details.
- `GET http://192.168.1.98:8002/trinityai/atoms` – list all atoms recognised by the agent.

## Usage

Send a POST request to `/trinityai/chat` with `{ "query": "describe your task" }`. The response includes `atom_name` and other metadata that the frontend uses to activate the correct atom UI.
