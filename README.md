# Trinity Platform Quick Start

This repository contains three top level folders:

- **TrinityFrontend** – React application served by Vite
- **TrinityBackendDjango** – Django admin and orchestration layer
- **TrinityBackendFastAPI** – Microservice backend with ML/utility features

Follow the steps below to run all services together.

## 1. Environment setup

1. Copy `TrinityBackendDjango/.env.example` to `TrinityBackendDjango/.env` and adjust values if required.
2. Copy `TrinityFrontend/.env.example` to `TrinityFrontend/.env`.
   Ensure `DEBUG=true` in the Django `.env` file so error messages appear if
   tenant creation fails.
   The frontend `.env` includes `VITE_SUBSCRIPTIONS_API` which should point to
   the Django subscription endpoints.

Docker and Node.js must be installed locally. The Python dependencies listed in
`TrinityBackendDjango/requirements.txt` (including pandas, motor and
python-multipart) will be installed inside the containers during the build
step.
Set `SIMPLE_TENANT_CREATION=true` in `.env` if your environment cannot run
database migrations for new tenants.

## 2. Start the backend containers

From the `TrinityBackendDjango` directory run the following command. It builds
the Docker image and launches all backend services:

```bash
docker-compose up --build
```

This starts PostgreSQL, MongoDB, Redis, the Django admin API on `localhost:8000`
and a FastAPI instance on `localhost:8001`. Uvicorn loads the app from
`apps/orchestration/fastapi_app.py`. Use `docker-compose logs fastapi` to
confirm the FastAPI server started successfully. CORS is enabled so the React
frontend served from `localhost:8080` can call the API. Once the containers
finish installing dependencies the text service is reachable at
`http://localhost:8001/api/t`.

## 3. Start the frontend

```bash
cd TrinityFrontend
npm install
npm run dev
```

Visit `http://localhost:8080` and log in with your Django credentials. In
Laboratory mode drag the **Text Box** atom onto the canvas. Enter some text and
click **Save Text** – the editor will send the payload to the FastAPI backend
which stores it in MongoDB.

Use the trash icon next to the **Exhibit the Card** toggle to remove a card.
When clicked the frontend archives the entire card object to the FastAPI
endpoint `/api/cards/archive` before deleting any associated atoms.
Text Box atoms are archived by setting their status to `archived` via
`DELETE /api/t/text/<id>` so nothing is permanently lost.

## 4. Verify the services communicate

1. Open the frontend and add a Text Box. After clicking **Save Text** open
   another terminal and run:

   ```bash
   curl http://localhost:8001/api/t/text/<ID>
   ```

   Replace `<ID>` with the `textId` you used. You should receive the stored
   document from MongoDB confirming Django and FastAPI are working together.

3. To verify subscription endpoints, run:

   ```bash
   curl http://localhost:8000/api/subscriptions/companies/
   ```

   You should see any companies created during tenant signup along with their
   subscription limits.

If tenant creation returns a **500** error the traceback will appear in the
backend logs. Run:

```bash
docker-compose logs web
```

Common issues are saving the tenant while connected to a tenant schema or using
a duplicate domain. Ensure the request is sent to the public host (e.g.
`localhost`) and that the domain is unique.

2. The FastAPI container also relies on the MinIO client. The required Python
   packages, including `motor` for MongoDB access and `python-multipart` for
   form parsing, are installed from `TrinityBackendDjango/requirements.txt`.

With these steps the Django orchestration layer, FastAPI features and the
React frontend are fully connected.

## 5. Download the embedding model

Some of the AI helpers require the SentenceTransformers model
`all-MiniLM-L6-v2`. The provided Dockerfile for `TrinityAI/Agent_fetch_atom`
runs the download script automatically during the build so the model is
available when the container starts. If you are running the services outside of
Docker, execute the following command once to download it locally:

```bash
python TrinityAI/Agent_fetch_atom/download_model.py
```

The script stores the files under
`TrinityAI/Agent_fetch_atom/models/all-MiniLM-L6-v2` so future runs can load
the model without internet access.


