# app/main.py

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from routes import router
from config import settings, Settings

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    # Use the settings instance directly
    
    app = FastAPI(
        title="Select Models Feature Based API",
        description="""
        ## Selection API
        
        This API allows you to:
        - **Select unique combinations** from MongoDB scope data
        - **Filter combinations** by various criteria
        - **Download files** from MinIO storage
        - **Monitor system health** and connections
        
        ### Database Configuration
        - **MongoDB**: Standard connection with authentication
        - **MinIO**: Standard connection with access keys
        - **Redis**: Standard connection for caching
        
        ### Key Features
        - Unique combination extraction from scope data
        - File download with presigned URLs
        - Health monitoring for all services
        - Comprehensive error handling
        """,
        version="1.0.0",
        debug=True,
        contact={
            "name": "Selection API",
            "url": "http://localhost:8012/docs",
        },
        license_info={
            "name": "MIT",
        },
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routes
    app.include_router(router, prefix="/api/select")
    
    return app

# Create the app instance
app = create_app()

@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to docs."""
    return RedirectResponse(url="/docs")

@app.get("/info", tags=["Info"])
async def get_app_info():
    """Get application information and available endpoints."""
    return {
        "app_name": "Select Models Feature Based API",
        "version": "1.0.0",
        "database": {
            "mongodb_endpoint": "mongodb://admin_dev:pass_dev@10.2.1.65:9005/?authSource=admin",
            "database": "validator_atoms_db",
            "collection": "validator_atoms"
        },
        "minio": {
            "endpoint": "minio:9000",
            "bucket": "trinity"
        },
        "redis": {
            "host": "redis",
            "port": 6379,
            "db": 0
        },
        "available_endpoints": {
            "health_check": "/api/select/health",
            "combination_ids": "/api/select/combination-ids",
            "documentation": "/docs",
            "openapi_schema": "/openapi.json"
        }
    }

# For direct execution
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8012,
        reload=True,
        log_level="info"
    )