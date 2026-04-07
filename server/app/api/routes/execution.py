from fastapi import APIRouter

from app.schemas.execution import LiveReplanningRequest, LiveReplanningResponse
from app.services.live_replanning import LiveReplanningService


router = APIRouter()
service = LiveReplanningService()


@router.post("/live-replan", response_model=LiveReplanningResponse)
def live_replan(payload: LiveReplanningRequest) -> LiveReplanningResponse:
    return service.replan(payload)
