from fastapi import FastAPI
from .routes import router as merge_router
from fastapi.middleware.cors import CORSMiddleware



app = FastAPI(title="Merge Atom")
app.include_router(merge_router,prefix="/merge", tags=["merge"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or replace "*" with ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)