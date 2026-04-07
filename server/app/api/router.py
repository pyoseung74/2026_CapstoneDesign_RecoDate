from fastapi import APIRouter

from app.api.routes.courses import router as courses_router
from app.api.routes.execution import router as execution_router
from app.api.routes.health import router as health_router
from app.api.routes.recommendations import router as recommendations_router


api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(recommendations_router, prefix="/api/recommendations", tags=["recommendations"])
api_router.include_router(courses_router, prefix="/api/courses", tags=["courses"])
api_router.include_router(execution_router, prefix="/api/execution", tags=["execution"])
