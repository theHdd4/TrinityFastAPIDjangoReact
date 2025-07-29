from fastapi import FastAPI
from .routes import router as transform_router

app = FastAPI(title="Create Atom")
app.include_router(transform_router,prefix="/create", tags=["Create"])
