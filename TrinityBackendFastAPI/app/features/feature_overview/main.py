from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router as feature_overview_router

app = FastAPI(title="Feature Overview Validator")

# CORS settings (optional)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(feature_overview_router, prefix="/feature-overview", tags=["Feature Overview"])

