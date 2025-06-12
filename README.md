# Trinity Platform Quick Start

This repository contains three top level folders:

- **TrinityFrontend** – React application served by Vite
- **TrinityBackendDjango** – Django admin and orchestration layer
- **TrinityBackendFastAPI** – Microservice backend with ML/utility features

Follow the steps below to run all services together.

## 1. Environment setup

1. Copy `TrinityBackendDjango/.env.example` to `TrinityBackendDjango/.env` and adjust values if required.
2. Copy `TrinityFrontend/.env.example` to `TrinityFrontend/.env`.

Docker and Node.js must be installed locally. The Python dependencies listed in
`TrinityBackendDjango/requirements.txt` (including pandas) will be installed
inside the containers during the build step.

## 2. Start the backend containers

From the `TrinityBackendDjango` directory run the following command. It builds
the Docker image and launches all backend services:

```bash
docker-compose up --build
```

This starts PostgreSQL, MongoDB, Redis, the Django admin API and a FastAPI
instance on port `8001`. Once the containers finish installing dependencies the
FastAPI text service is reachable at `http://localhost:8001/api/t`.

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

## 4. Verify the services communicate

1. Open the frontend and add a Text Box. After clicking **Save Text** open
   another terminal and run:

   ```bash
   curl http://localhost:8001/api/t/text/<ID>
   ```

   Replace `<ID>` with the `textId` you used. You should receive the stored
   document from MongoDB confirming Django and FastAPI are working together.

2. The FastAPI container also relies on the MinIO client. The required Python package is installed from `TrinityBackendDjango/requirements.txt`.


