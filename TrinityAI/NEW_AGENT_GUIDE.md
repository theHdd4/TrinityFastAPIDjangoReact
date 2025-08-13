# Adding a New AI Agent

This guide walks through creating an additional AI agent and hooking it up across the Trinity platform. Each agent lives under `TrinityAI/Agent_<name>` and exposes a FastAPI application that is consumed by the backend and frontend.

## 1. Create the agent service

1. **Create a folder** `TrinityAI/Agent_<name>`.
2. Inside it implement `main_app.py` that defines `app = FastAPI()` with the required endpoints. Look at `Agent_concat/main_app.py` for structure. Place the language model prompt and parsing logic in `ai_logic.py` so it can be tweaked independently of the API layer.
3. Add any extra files or utilities the agent needs.
4. Update `TrinityAI/requirements.txt` if new dependencies are required so the Docker image installs them.

## 2. Expose the agent in `main_api.py`

Edit `TrinityAI/main_api.py` so your agent routes are available:

```python
NEW_PATH = Path(__file__).resolve().parent / "Agent_<name>"
sys.path.append(str(NEW_PATH))
from Agent_<name>.main_app import app as new_app
app.include_router(new_app.router)
```

This ensures the Docker container running `main_api.py` serves the agent on port **8002** alongside the existing ones.

## 3. Connect with backend FastAPI

Backend features live under `TrinityBackendFastAPI/app/features`. Create a folder there if one does not exist for your atom and implement the logic required by the agent.

- Provide endpoints like `/perform` that execute the actual data operation (see `concat/routes.py` for an example).
- When the agent generates a configuration (for example a list of files to merge), call the `/perform` endpoint from the frontend to produce results. The agent itself does not directly access the backend.

## 4. Integrate with the frontend

1. Add a human readable label for the agent in `LLM_MAP` found inside `TrinityFrontend/src/components/LaboratoryMode/components/CanvasArea.tsx`.
2. Ensure the frontend knows the agent URL via `TRINITY_AI_API` in `src/lib/api.ts`. The base host and port are typically defined in the `.env` files.
3. Use the `AtomAIChatBot` component to interact with the agent from a card. Pass the `atomType` prop matching your agent folder name.
4. If the agent should run automatically after suggesting a configuration, update the callback in `AtomAIChatBot.tsx` to POST the configuration to your backend `/perform` endpoint and store the results in the atom settings.

Following these steps a new AI agent becomes available at `http://<host>:8002/<name>` and can configure its corresponding atom through the backend and the user interface.
