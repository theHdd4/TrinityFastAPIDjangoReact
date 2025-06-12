# from fastapi import FastAPI
# from app.api.router import api_router

# app = FastAPI()

# app.include_router(api_router)

from fastapi import FastAPI
from app.api.router import api_router, text_router

app = FastAPI()

app.include_router(api_router, prefix="/api")

# Include the text router under /api/text
app.include_router(text_router, prefix="/api/t")

