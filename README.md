# Trinity Platform Quick Start

This repository contains three top level folders:

- **TrinityFrontend** – React application served by Vite
- **TrinityBackendDjango** – Django admin and orchestration layer
- **TrinityBackendFastAPI** – Microservice backend with ML/utility features

Follow the steps below to run all services together.

## 1. Environment setup

1. Copy `TrinityBackendDjango/.env.example` to `TrinityBackendDjango/.env` and adjust values if required.
2. Copy `TrinityFrontend/.env.example` to `TrinityFrontend/.env`.

Docker and Node.js must be installed locally.

## 2. Start the backend containers

From the `TrinityBackendDjango` directory run:

```bash
docker-compose up --build
```

This launches PostgreSQL, MongoDB, Redis, the Django admin API and a FastAPI instance on port `8001`.

To start the feature services (including the Text Box API) run in a separate terminal:

```bash
cd TrinityBackendFastAPI
docker-compose -f docker-compose.dev.yml up --build
```

The text service will be reachable at `http://localhost:8001/api/t`.

## 3. Start the frontend

```bash
cd TrinityFrontend
npm install
npm run dev
```

Visit `http://localhost:8080` and log in with your Django credentials. In Laboratory mode drag the **Text Box** atom onto the canvas. The editor allows entering text and sends it to the FastAPI backend where it is persisted in MongoDB.


