# app/main.py

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from routes import router
from config import get_settings, Settings

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title=settings.app_name,
        description="""
        ## Selection API
        
        This API allows you to:
        - **Select unique combinations** from MongoDB scope data
        - **Filter combinations** by various criteria
        - **Download files** from MinIO storage
        - **Monitor system health** and connections
        
        ### Database Configuration
        - **MongoDB**: Port 9005 with authentication
        - **MinIO**: Port 9003 with access keys
        
        ### Key Features
        - Unique combination extraction from scope data
        - File download with presigned URLs
        - Health monitoring for all services
        - Comprehensive error handling
        """,
        version=settings.app_version,
        debug=settings.debug,
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
    app.include_router(router, prefix=settings.api_prefix)
    
    return app

# Create the app instance
app = create_app()

@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to docs."""
    return RedirectResponse(url="/docs")

@app.get("/info", tags=["Info"])
async def get_app_info(settings: Settings = Depends(get_settings)):
    """Get application information and available endpoints."""
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "database": {
            "mongodb_endpoint": settings.mongo_details.split('@')[1] if '@' in settings.mongo_details else settings.mongo_details,
            "database": settings.database_name,
            "collection": settings.collection_name
        },
        "minio": {
            "endpoint": settings.minio_url,
            "bucket": settings.minio_bucket_name,
            "port": "9003"
        },
        "available_endpoints": {
            "health_check": f"{settings.api_prefix}/health",
            "all_combinations": f"{settings.api_prefix}/combinations",
            "filter_combinations": f"{settings.api_prefix}/combinations/filter",
            "combination_details": f"{settings.api_prefix}/combinations/{{combination_id}}",
            "file_download": f"{settings.api_prefix}/files/download/{{file_key}}",
            "list_files": f"{settings.api_prefix}/files/list",
            "list_scopes": f"{settings.api_prefix}/scopes",
            "documentation": "/docs",
            "openapi_schema": "/openapi.json"
        }
    }

# For direct execution
if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info"
    )
