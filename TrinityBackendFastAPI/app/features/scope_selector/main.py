# main.py - FastAPI Application with Environment Configuration
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router as scope_selector_router
from datetime import datetime

# Import environment settings
from .config import settings

# Create FastAPI app with environment settings
app = FastAPI(
    title=settings.app_name,
    description="Model scope definition with identifier combinations and timeframe filtering",
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    debug=settings.debug
)

# CORS configuration from environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)

# Include routes
app.include_router(scope_selector_router, prefix="/scope-selector", tags=["Scope Selector"])

@app.get("/")
async def root():
    """Root endpoint with environment information"""
    return {
        "message": f"{settings.app_name} Active",
        "system": "scope_selector_atom",
        "version": settings.app_version,
        "environment": settings.environment,
        "status": "operational",
        "docs": "/docs" if settings.debug else "disabled",
        "redoc": "/redoc" if settings.debug else "disabled"
    }

@app.get("/health")
async def health_check():
    """Health check with environment info"""
    return {
        "status": "healthy",
        "service": "scope_selector_atom",
        "timestamp": datetime.now().isoformat(),
        "version": settings.app_version,
        "environment": settings.environment,
        "debug_mode": settings.debug
    }

if __name__ == "__main__":
    import uvicorn
    print(f"🎯 Starting {settings.app_name}...")
    print(f"🌍 Environment: {settings.environment}")
    print(f"📊 Port: {settings.api_port}")
    print(f"📚 Documentation: http://localhost:{settings.api_port}/docs")
    print(f"🔧 Debug Mode: {settings.debug}")
    
    uvicorn.run(
        app, 
        host=settings.api_host, 
        port=settings.api_port, 
        reload=settings.api_reload
    )