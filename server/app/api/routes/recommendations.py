from fastapi import APIRouter

from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services.recommendation_engine import RecommendationEngineService


router = APIRouter()
service = RecommendationEngineService()


@router.post("", response_model=RecommendationResponse)
def recommend_courses(payload: RecommendationRequest) -> RecommendationResponse:
    courses = service.recommend(payload)
    return RecommendationResponse(courses=courses, mode=payload.mode)
