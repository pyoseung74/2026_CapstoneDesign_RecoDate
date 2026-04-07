from app.schemas.recommendation import RecommendedCourse, RecommendationRequest


class RecommendationEngineService:
    def recommend(self, request: RecommendationRequest) -> list[RecommendedCourse]:
        city_title = request.city or "강릉시"
        mode_title = request.mode.replace("-", " ")

        return [
            RecommendedCourse(
                id="gangneung-course-001",
                title=f"{city_title} 추천 코스 ({mode_title})",
                estimated_budget=45000,
                total_duration_minutes=240,
                place_ids=["place-001", "place-002", "place-003"],
            )
        ]
