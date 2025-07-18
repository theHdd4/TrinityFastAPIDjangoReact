# Cloudflared Tunnel

This directory contains a standalone compose file for running the
Cloudflare Tunnels used by the Trinity stack. Two services are defined:
`cloudflared-prod` forwards `trinity.quantmatrixai.com` to the production
Traefik instance while `cloudflared-dev` forwards
`trinity-dev.quantmatrixai.com` to the development stack.

Ensure the `trinity-net` networks exist. They are created automatically when the
backend stack is started via `../scripts/start_backend.sh` (for development) or
`../scripts/start_backend.sh prod` (for production). If running the tunnel
before the other containers you can create one manually:

```bash
docker network create trinity-net
```

Then from this folder run:

```bash
docker compose up -d
```

Both services mount `./tunnelCreds` which should contain `config.yml` for
production, `config.dev.yml` for development and the corresponding
credential JSON files.
