# Trinity Platform Quick Start

This repository contains three top level folders:

- **TrinityFrontend** – React application served by Vite
- **TrinityBackendDjango** – Django admin and orchestration layer
- **TrinityBackendFastAPI** – Microservice backend with ML/utility features

Follow the steps below to run all services together.

## 1. Environment setup

1. Edit `TrinityBackendDjango/.env` and `TrinityFrontend/.env` to set the
   `HOST_IP` variable. In most setups this is the IP of the machine running the
   containers. For the current deployment the main services use
   `HOST_IP=10.2.1.242`.
   The Trinity AI container communicates with an external Ollama server so set
   `OLLAMA_IP=10.2.1.65` either in `docker-compose.yml` or the environment to
   reach that server.
2. Copy `TrinityBackendDjango/.env.example` to `TrinityBackendDjango/.env` and adjust values if required.
3. Copy `TrinityFrontend/.env.example` to `TrinityFrontend/.env`.
   Ensure `DEBUG=true` in the Django `.env` file so error messages appear if
   tenant creation fails.
   The frontend `.env` includes `VITE_SUBSCRIPTIONS_API` which should point to
   the Django subscription endpoints and `VITE_TRINITY_AI_API` for the AI
   service.
  When exposing the app via Cloudflare Tunnel, set
  `VITE_BACKEND_ORIGIN=https://trinity.quantmatrixai.com` so the frontend sends
  API requests through Traefik. Rebuild the `frontend` service after changing
  this file so Vite picks up the new value:

  ```bash
  docker compose build frontend
  ```

  The frontend is exposed at `https://trinity.quantmatrixai.com` through
  Cloudflare Tunnel while Traefik proxies `/admin/` to the Django container and
  `/api/` to the FastAPI service. Traefik strips the `/admin` prefix so Django
  receives requests under `/api/` and `/admin/` as defined in `config/urls.py`.
  Login requests therefore go to `/admin/api/accounts/login/` when accessed
  through Traefik or the frontend proxy. When connecting directly to the Django
  container on port `8000` the prefix is **not** removed, so the frontend falls
  back to `/api/accounts/login/`. This selection happens automatically in
  `src/lib/api.ts` based on whether `VITE_BACKEND_ORIGIN` contains `:8000`.
  Override the API paths with `VITE_ACCOUNTS_API` etc. if needed when deploying
  the APIs on a separate domain.

  If API requests return **403 Forbidden** ensure the browser has a valid session
  cookie. Log in via the correct `/api/accounts/login/` path before calling
  authenticated endpoints like `/api/registry/laboratory-actions/`.

The frontend performs a preliminary GET request to `/api/accounts/users/me/`
during login to verify the API is reachable. Since no session exists yet this
check will usually return **401** or **403**. The actual login follows
immediately after.

### Debugging login failures

If you still hit **403 Forbidden** after submitting valid credentials:

1. Open the browser developer tools and inspect the network response for
   `POST /admin/api/accounts/login/`. Confirm the server responds with **200**
   and includes a `Set-Cookie` header named `sessionid`.
   If the request instead returns **404** or **405**, verify that
   `VITE_BACKEND_ORIGIN` in `TrinityFrontend/.env` points at the correct
   host. Use the `/admin` prefix only when requests are routed through Traefik.
2. After the request completes, visit `/admin/api/accounts/users/me/` in a new
   tab or run:

   ```bash
   curl -b cookies.txt -c cookies.txt \
     -X GET http://10.2.1.242:8080/admin/api/accounts/users/me/
   ```

   Replace `cookies.txt` with a file captured from the login response. A JSON
   payload containing your username confirms the session was stored correctly.
3. If the endpoint still returns **403**, verify that `CSRF_TRUSTED_ORIGINS` and
   `CORS_ALLOWED_ORIGINS` in `TrinityBackendDjango/.env` include the public
   domain. Missing entries can prevent the session cookie from being accepted.
4. Finally ensure the browser isn't blocking third‑party cookies. Same‑site
   restrictions may prevent the session from persisting if the frontend and
   backend live on different domains.

  When testing the column classifier endpoints a **404 Not Found** response
  often indicates the specified `validator_atom_id` or `file_key` does not exist
  rather than a missing route. Double-check these parameters if the API returns
  a 404 JSON message like `{"detail": "Validator atom 'demo123' not found in database"}`.

  A **405 Not Allowed** response when uploading a file usually means the
  `VITE_VALIDATE_API` URL is missing the protocol. Make sure it includes
  `http://` (or `https://`) like `http://${HOST_IP}:8001/api/data-upload-validate`.

  Update `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS` in
  `TrinityBackendDjango/.env` so both the local frontend URL
  `http://${HOST_IP}:8080` and the public domain
  `https://trinity.quantmatrixai.com` are trusted. This prevents CORS and CSRF
  errors when logging in from either address.
  Set `FASTAPI_CORS_ORIGINS` to the same comma separated list so the FastAPI
  service accepts requests from both origins as well.
  When exposing a public hostname also add it, the host IP, and `localhost` to
  the `ADDITIONAL_DOMAINS` variable so Django's tenant middleware accepts all
  three. Run `python create_tenant.py` again after adjusting this list if the
  entries were not added during the initial setup.

Docker and Node.js must be installed locally. The Python dependencies listed in
`TrinityBackendDjango/requirements.txt` and
`TrinityBackendFastAPI/requirements.txt` (including pandas, motor,
`python-multipart` and `asyncpg`) will be installed inside the containers during
the build step. If `asyncpg` cannot be installed the FastAPI service falls back
to the `CLIENT_NAME`, `APP_NAME` and `PROJECT_NAME` environment variables
instead of querying PostgreSQL.
Set `SIMPLE_TENANT_CREATION=true` in `.env` if your environment cannot run
database migrations for new tenants.

## 2. Start the backend containers

From the repository root run the helper script which builds and starts the
containers:

```bash
./scripts/start_backend.sh
```

This script starts PostgreSQL, MongoDB, Redis, the Django admin API on
`localhost:8000` and a FastAPI instance on `localhost:8001`. Uvicorn loads the
app from
`apps/orchestration/fastapi_app.py`. A separate AI service from the `TrinityAI`
folder runs on `localhost:8002` for chat prompts. Use `docker compose logs
fastapi` or `docker compose logs trinity-ai` to confirm the servers started
successfully. CORS is enabled so the React frontend served from `localhost:8080`
 can call the APIs. Once the containers finish installing dependencies the text
 service is reachable at `http://localhost:8001/api/t` and Trinity AI at
 `http://localhost:8002/chat`. When accessed through the tunnel, Traefik
 proxies `/chat` to the `trinity-ai` container so the frontend posts to
 `https://trinity.quantmatrixai.com/chat`. The router uses a high priority so
 `/chat` requests never fall back to the frontend service. Use
 `python scripts/check_ai_tunnel.py` to verify the chat endpoint responds
 through the tunnel.

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
docker compose logs web
```

Common issues are saving the tenant while connected to a tenant schema or using
a duplicate domain. Ensure the request is sent to the public host (e.g.
`localhost`) and that the domain is unique.

2. The FastAPI container also relies on the MinIO client. The required Python
   packages, including `motor` for MongoDB access and `python-multipart` for
   form parsing, are installed from `TrinityBackendDjango/requirements.txt`.

With these steps the Django orchestration layer, FastAPI features and the
React frontend are fully connected.

## 5. Validate the tunnels

After exposing the services through Cloudflare Tunnels you can verify that each
public hostname responds. Docker Compose automatically launches short‑lived
`check-*` containers when you start the stack. They run once and then exit. You
can also run the helpers manually from the repository root:

```bash
python scripts/check_django_tunnel.py
python scripts/check_frontend_tunnel.py
python scripts/check_fastapi_tunnel.py
```

A healthy tunnel prints the HTTP status and server header, for example:

```
Checking https://trinity.quantmatrixai.com/admin/login/
Status 200
Server cloudflare
```

If you see a 4xx or 5xx status code the request reached the server but
returned an error. Double‑check the URL and that the Django container is
running. A 404 response usually means the endpoint path is wrong while a 5xx
status indicates the tunnel or backend might be down. If FastAPI endpoints
return a **502 Bad Gateway**, check that the FastAPI container is running and
that its Traefik service label points to port `8001`:

```yaml
traefik.http.services.fastapi.loadbalancer.server.port=8001
```

Similarly the Trinity AI service should map port `8002`:

```yaml
traefik.http.services.trinity-ai.loadbalancer.server.port=8002
```

Run `python scripts/check_ai_tunnel.py` to confirm `/chat` is reachable
through the tunnel and routed to the AI container.

Use `docker compose logs traefik` and `docker compose logs fastapi` for
additional details. Use `docker compose logs cloudflared` to confirm the tunnel
is connected if you suspect connectivity issues.

For tips on reducing startup times and improving responsiveness see
[performance_tips.md](performance_tips.md).


