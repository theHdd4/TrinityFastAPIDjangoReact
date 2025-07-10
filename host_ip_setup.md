# Configuring HOST_IP

To avoid hard coding the IP address of the Docker host inside the project files
you can define it once in `host.env` and share it across all services.

1. Copy `host.env.example` to `host.env` at the repository root.
2. Edit `host.env` and set `HOST_IP` to the IP address used to reach Docker
   containers from your browser or other services.
3. Start the stack from the repository root:
   ```bash
   docker compose up --build
   ```
   Docker Compose loads `host.env` for every container so `HOST_IP` becomes
   available in Django, FastAPI, the AI service and any helper scripts.
4. When updating the frontend `.env`, you can reference the same value:
   ```bash
   echo "VITE_HOST_IP=$HOST_IP" > TrinityFrontend/.env
   ```
   Rebuild the frontend container afterwards so Vite embeds the new setting.

With this setup you only need to change `HOST_IP` in one place whenever the host
address changes.
