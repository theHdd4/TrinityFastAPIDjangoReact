from fastapi import FastAPI
from .routes import router as evaluate_router

app = FastAPI(title="Evaluate Atom")
app.include_router(evaluate_router,prefix="/evaluate", tags=["Evaluate"])
