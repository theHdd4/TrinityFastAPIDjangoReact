from fastapi import APIRouter
from app.features.scenario_planner_category_forecasting.scenario_planner_category_forecasting.app.routes.routes_scenario import router as scenario_router

router = APIRouter()

# Include the scenario planning routes
router.include_router(scenario_router, prefix="/scenario", tags=["Scenario Planning"])
