from fastapi import FastAPI
from .routes import router as autoreg_router

app = FastAPI(title="AutoRegressive Atom")
app.include_router(autoreg_router,prefix="/autoreg", tags=["autoreg"])
