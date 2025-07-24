# Development Environment Setup

This project now includes a separate Docker Compose file for running
all services in a development stack without interfering with the
production containers.

## Files
- `docker-compose-dev.yml` – defines the development services with
  different port mappings and a dedicated Docker network `trinity-dev-net`.
- `cloudflared-dev/` – contains the compose file and credentials for a
  Cloudflare tunnel exposing `trinity-dev.quantmatrixai.com`.

## Preparing the Cloudflare tunnel
1. Install the `cloudflared` CLI and authenticate with your
   Cloudflare account.
2. Create a new tunnel and DNS record for the dev domain:
   ```bash
   cloudflared tunnel create trinity-dev
   cloudflared tunnel route dns trinity-dev trinity-dev.quantmatrixai.com
   ```
3. Copy the generated credentials JSON into
   `cloudflared-dev/tunnelCreds/` and update
   `cloudflared-dev/tunnelCreds/config.yml` with the tunnel ID. The
   config already points at `trinity-dev.quantmatrixai.com` and will
   forward traffic to the Traefik container.

Start the tunnel:
```bash
cd cloudflared-dev
docker compose -p trinity-dev up -d
```
The development compose file no longer includes a `cloudflared`
service, so launch the tunnel separately as shown above or simply run
the helper script which starts both the stack and tunnel:
```bash
./scripts/start_dev.sh
```

## Running the development stack
From the repository root run:
```bash
docker compose -f docker-compose-dev.yml -p trinity-dev up -d
```
Using the `-p trinity-dev` flag ensures container, volume and network
names differ from the production stack.

After the containers report **healthy** you can access the services at:
- `http://localhost:8081` – React frontend
- `http://localhost:8003/admin/` – Django admin
- `http://localhost:8004/api/` – FastAPI
- `http://localhost:5051` – PgAdmin
- `http://localhost:8082` – Mongo Express

The frontend automatically detects when it is served from port `8081` and
adjusts API calls to the backend ports `8003`–`8005`. If you create a custom
`.env` file for the frontend these ports can still be overridden with the
`VITE_DJANGO_PORT`, `VITE_FASTAPI_PORT` and `VITE_AI_PORT` variables.

Requests to `https://trinity-dev.quantmatrixai.com` will reach the
same services through the Cloudflare tunnel.

The production stack remains unaffected and can run simultaneously
because ports, network names and the Cloudflare tunnel are all
separate.
