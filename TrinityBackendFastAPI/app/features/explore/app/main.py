# main.py - Enhanced Version
import os
import logging
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("explore_atom")

# Settings
class Settings:
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8001"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    ALLOWED_ORIGINS: List[str] = os.getenv(
        "ALLOWED_ORIGINS", 
        "http://localhost:3000,http://localhost:8501"
    ).split(",")

settings = Settings()

# Lifespan events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Explore Atom API starting up...")
    logger.info(f"📊 Available at: http://{settings.API_HOST}:{settings.API_PORT}")
    yield
    # Shutdown
    logger.info("🛑 Explore Atom API shutting down...")

# Import routes with error handling
try:
    from routes import router
except ImportError as e:
    logger.error(f"Failed to import routes: {e}")
    raise

# Create app
app = FastAPI(
    title="Explore Atom API",
    description="Data Exploration and Analysis System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router, prefix="/explore")

# Your existing endpoints (they're perfect!)
@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "message": "Explore Atom API is running",
        "version": "1.0.0",
        "system": "explore_atom",
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "explore": "/explore"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "system": "explore_atom",
        "message": "Explore Atom system is operational"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level="info"
    )