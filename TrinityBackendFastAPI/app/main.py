# from fastapi import FastAPI
# from app.api.router import api_router

# app = FastAPI()

# app.include_router(api_router)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router, text_router
import os

app = FastAPI()

origins = os.getenv(
    "FASTAPI_CORS_ORIGINS",
    "http://127.0.0.1:8080,"
    "http://10.2.1.242:8080,"
    "http://172.17.48.1:8080,"
    "http://10.2.1.65:8080,"
    "http://127.0.0.1:8081,"
    "http://10.2.1.242:8081,"
    "http://172.17.48.1:8081,"
    "http://10.2.1.65:8081,"
    "https://trinity.quantmatrixai.com,"
    "https://trinity-dev.quantmatrixai.com",
)
allowed_origins = [o.strip() for o in origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# Include the text router under /api/text
app.include_router(text_router, prefix="/api/t")


@app.on_event("startup")
async def log_env():
    print(
        "🚀 env CLIENT_NAME=%s APP_NAME=%s PROJECT_NAME=%s"
        % (
            os.getenv("CLIENT_NAME"),
            os.getenv("APP_NAME"),
            os.getenv("PROJECT_NAME"),
        )
    )

