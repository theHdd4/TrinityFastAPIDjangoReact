from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from app.features.dataframe_operations.routes import router as save_router
import uvicorn

app = FastAPI(
    title="DataFrame Operations API",
    description="API for DataFrame upload and save operations.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(save_router, prefix="/api/dataframe-operations")

@app.get("/")
async def root():
    return {
        "message": "DataFrame Operations API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 