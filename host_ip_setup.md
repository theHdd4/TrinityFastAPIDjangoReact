# Configuring HOST_IP

The backend and frontend read the `HOST_IP` variable from their respective
`.env` files. Both examples default to `127.0.0.1`. Edit the value in
`TrinityBackendDjango/.env` and `TrinityFrontend/.env` if the services should
listen on another IP address.

Run `scripts/start_backend.sh` from the repository root to build and launch the
containers. Rebuild the frontend container after updating its `.env` so Vite
embeds the new setting.
