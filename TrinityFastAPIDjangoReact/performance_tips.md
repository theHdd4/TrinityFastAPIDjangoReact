# Performance Tips

If you notice the stack running slowly, consider the following optimizations:

- **Build images once**: Run `docker compose build` before `docker compose up` to cache dependencies so subsequent starts are faster.
- **Allocate more resources**: Increase CPU and memory limits for Docker Desktop or your container runtime so database and Python services have room to work.
- **Disable Django DEBUG**: Set `DEBUG=false` in `TrinityBackendDjango/.env` for production so template reloading and extra logging do not slow down responses.
- **Run multiple workers**: Update the FastAPI and Uvicorn commands to use more workers if CPU resources allow:
  ```bash
  uvicorn apps.orchestration.fastapi_app:app --workers 4
  ```
- **Use a production React build**: Build the frontend with `npm run build` and serve the `dist/` directory using a web server or the `frontend` container's production mode.
- **Monitor container logs**: Use `docker compose logs` to check for errors or repeated restarts which can slow requests.

These tweaks can help the services respond more quickly under load.
