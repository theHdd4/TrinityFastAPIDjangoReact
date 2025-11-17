from fastapi import APIRouter

from .unpivot_router import router as unpivot_router


router = APIRouter()
router.include_router(unpivot_router)

