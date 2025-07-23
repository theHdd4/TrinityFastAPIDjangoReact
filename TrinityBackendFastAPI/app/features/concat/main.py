from fastapi import FastAPI
from .routes import router as concat_router

app = FastAPI(title="Concatinate Atom")
app.include_router(concat_router,prefix="/concat", tags=["concat"])

@app.on_event("startup")
async def startup_event() -> None:
    from . import deps
    await deps.init_object_prefix()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or your frontend's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)