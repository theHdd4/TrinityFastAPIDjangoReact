# Cloudflared Tunnel

This directory contains a standalone compose file for running the
Cloudflare Tunnel used by the Trinity stack.

Ensure the `trinity-net` network exists. It is created automatically when the
backend stack is started via `../scripts/start_backend.sh`. If running the
tunnel before the other containers you can create it manually:

```bash
docker network create trinity-net
```

Then from this folder run:

```bash
docker compose up -d
```

The service mounts `./tunnelCreds` which should contain `config.yml` and
your credential JSON.
