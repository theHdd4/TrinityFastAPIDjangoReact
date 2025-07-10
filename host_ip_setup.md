# Configuring HOST_IP

To avoid hard coding the IP address of the Docker host inside the project files
you can define it once in `host.env` and share it across all services.

1. Run `scripts/start_backend.sh` from the repository root. The script copies
   `host.env.example` to `host.env` the first time so you can edit `HOST_IP`
   once and reuse it across all services. It then builds and starts the
   containers.
2. When updating the frontend `.env`, you can reference the same value:
   ```bash
   echo "VITE_HOST_IP=$HOST_IP" > TrinityFrontend/.env
   ```
   Rebuild the frontend container afterwards so Vite embeds the new setting.

With this setup you only need to change `HOST_IP` in one place whenever the host
address changes.
