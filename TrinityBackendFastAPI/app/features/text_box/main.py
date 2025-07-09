from fastapi import FastAPI
from app.api.router import api_router, text_router

app = FastAPI()

app.include_router(api_router, prefix="/app")

# Include the text router under /app/text
app.include_router(text_router, prefix="/app/t")

