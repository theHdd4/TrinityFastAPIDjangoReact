# Production Environment Setup

This guide covers running the full Trinity stack in production using
`docker-compose.yml` and the Cloudflare tunnel provided under
`cloudflared/`.

## Files
- `docker-compose.yml` – defines the production services and the shared
  Docker network `trinity-net`.
- `cloudflared/` – compose file and credentials for the production
  Cloudflare tunnel exposing `trinity.quantmatrixai.com`.

## Preparing the Cloudflare tunnel
1. Install the `cloudflared` CLI and log in to your Cloudflare account.
2. Create a tunnel and DNS record for the production domain:
   ```bash
   cloudflared tunnel create trinity-prod
   cloudflared tunnel route dns trinity-prod trinity.quantmatrixai.com
   ```
3. Place the generated credentials JSON inside
   `cloudflared/tunnelCreds/` and update `config.yml` with the tunnel ID.
   The configuration already forwards traffic to the Traefik container.

Start the tunnel with:
```bash
cd cloudflared
docker compose up -d
```

## Running the production stack
From the repository root run:
```bash
./scripts/start_backend.sh
```
This builds and launches all containers defined in `docker-compose.yml`.

After the services report **healthy** access them at:
- `http://localhost:8080` – React frontend
- `http://localhost:8000/admin/` – Django admin
- `http://localhost:8001/api/` – FastAPI
- `http://localhost:5050` – PgAdmin
- `http://localhost:8082` – Mongo Express

Requests to `https://trinity.quantmatrixai.com` will be routed through
Cloudflare to Traefik and then to the appropriate service.
