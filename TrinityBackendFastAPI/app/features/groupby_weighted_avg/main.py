from fastapi import FastAPI
from .routes import router as groupby_router

app = FastAPI()

# Mount the groupby router with a prefix
app.include_router(groupby_router, prefix="/groupby", tags=["groupby"])
