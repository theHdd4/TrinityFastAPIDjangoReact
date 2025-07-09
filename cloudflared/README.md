# Cloudflared Tunnel

This directory contains a standalone compose file for running the
Cloudflare Tunnel used by the Trinity stack.

From this folder run:

```bash
docker-compose up -d
```

The service mounts `../tunnelCreds` which should contain `config.yml` and
your credential JSON.
