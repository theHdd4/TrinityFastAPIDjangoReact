# main.py - FastAPI App Entrypoint
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.features.column_classify.routes import router  # ✅ Direct import, not relative
import uvicorn

# Create FastAPI app instance
app = FastAPI(
    title="Data Classification API",
    description="Advanced Data Classification System for Column Analysis and Business Intelligence",
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
app.include_router(router, prefix="/classify")

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Data Classification API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/classify/health"
    }

# Optional: Add startup/shutdown events
@app.on_event("startup")
async def startup_event():
    print("🚀 Data Classification API starting up...")
    print("📊 Available classifiers: column_classifier, auto_classification, user_override")
    print("📖 API Documentation: http://localhost:8001/docs")

@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Data Classification API shutting down...")

# For development - run with python main.py
if __name__ == "__main__":
    uvicorn.run(
        app,  # ✅ Pass app object directly
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )