# app/main.py - FastAPI App Entrypoint
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
import uvicorn

# Create FastAPI app instance
app = FastAPI(
    title="Validate Atom API",
    description="Custom Data Validation System with Multiple Validator Types",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/validator_atom")

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Validate Atom API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/validator_atom/health"
    }

# Health check endpoint (additional to the one in routes)
@app.get("/")
async def root():
    return {
        "message": "Data Validation Service API",
        "docs": "/docs",
        "health": "/health"
    }

# Optional: Add startup/shutdown events
@app.on_event("startup")
async def startup_event():
    print("🚀 Validate Atom API starting up...")
    print("📊 Available validators: base, price_elasticity, mmm, innovation, custom")
    print("📖 API Documentation: http://localhost:8000/docs")

@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Validate Atom API shutting down...")

# For development - run with python -m app.main
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )