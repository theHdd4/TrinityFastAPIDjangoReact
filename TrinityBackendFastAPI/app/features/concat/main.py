from fastapi import FastAPI
from .routes import router as concat_router

app = FastAPI(title="Concatinate Atom")
app.include_router(concat_router,prefix="/concat", tags=["concat"])

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or your frontend's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)