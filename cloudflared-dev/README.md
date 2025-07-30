# Cloudflared Tunnel (Dev)

This directory mirrors `cloudflared/` but provides a separate tunnel
for the development environment. Copy your dev tunnel credentials into
`./tunnelCreds` and update `config.yml` with the tunnel ID and
hostname `trinity-dev.quantmatrixai.com`.

Start the tunnel with:

```bash
docker compose -p trinity-dev -f docker-compose.yml up -d
```
