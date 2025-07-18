# Configuring HOST_IP

The backend and frontend read the `HOST_IP` variable from their respective
`.env` files. These examples use `10.2.1.242` as the address of the main host.
Adjust this value when deploying to a different machine.

The Trinity AI container may need to reach an external Ollama server. Set
`OLLAMA_IP` to that server's IP address (for example `10.2.1.65`) so the
internal services can connect to it.

Run `scripts/start_backend.sh` (or `scripts/start_backend.sh prod`) from the
repository root to build and launch the containers. Rebuild the frontend
container after updating its `.env` so Vite
embeds the new setting.
