# Production Environment Setup

This guide explains how to run the Trinity services using the main
`docker-compose.yml` file. The containers expose the application on the
standard production ports and connect to the `trinity-net` Docker network.

## Files
- `docker-compose.yml` – defines the production services and network
  `trinity-net`.
- `cloudflared/` – compose file and credentials for the Cloudflare tunnel
  exposing `trinity.quantmatrixai.com`.

## Preparing the Cloudflare tunnel
1. Install the `cloudflared` CLI and authenticate with your
   Cloudflare account.
2. Create a tunnel and DNS record for the production domain:
   ```bash
   cloudflared tunnel create trinity-prod
   cloudflared tunnel route dns trinity-prod trinity.quantmatrixai.com
   ```
3. Copy the generated credentials JSON into `cloudflared/tunnelCreds/` and
   update `cloudflared/tunnelCreds/config.yml` with the tunnel ID. The config
   forwards traffic to the Traefik container.

Start the tunnel:
```bash
cd cloudflared
docker compose up -d
```

## Running the production stack
From the repository root run:
```bash
docker compose up -d
```
The default project name `trinity-prod` is derived from the
`name:` field in `docker-compose.yml`.

After the containers report **healthy** you can access the services at:
- `http://localhost:8080` – React frontend
- `http://localhost:8000/admin/` – Django admin
- `http://localhost:8001/api/` – FastAPI
- `http://localhost:5050` – PgAdmin
- `http://localhost:8082` – Mongo Express

Requests to `https://trinity.quantmatrixai.com` will reach the same
services through the Cloudflare tunnel.
