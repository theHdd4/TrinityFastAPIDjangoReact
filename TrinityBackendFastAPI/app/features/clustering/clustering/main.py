from fastapi import FastAPI
from .config import settings
from .routes import router

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/",
)

app.include_router(router)

# ─── Uvicorn entry ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
