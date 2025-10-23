# Cloudflared Tunnel (Staging)

This directory mirrors `cloudflared/` but provides a separate tunnel
for the staging environment. Copy your staging tunnel credentials into
`./tunnelCreds` and update `config.yml` with the tunnel ID and
hostname `trinity-staging.quantmatrixai.com`.

Ensure the `trinity-staging-net` network exists. It is created automatically when the
staging stack is started. If running the tunnel before the other containers you can create it manually:

```bash
docker network create trinity-staging-net
```

Start the tunnel with:

```bash
docker compose -p trinity-staging -f docker-compose.yml up -d
```

