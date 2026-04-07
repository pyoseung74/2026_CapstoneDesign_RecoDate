from app.schemas.execution import LiveReplanningRequest, LiveReplanningResponse


class LiveReplanningService:
    def replan(self, request: LiveReplanningRequest) -> LiveReplanningResponse:
        return LiveReplanningResponse(
            course_id=request.course_id,
            replanned=True,
            message=f"현 위치 기준으로 코스를 다시 계산했습니다: {request.reason}",
        )
