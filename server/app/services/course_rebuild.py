from app.schemas.course_rebuild import CourseRebuildRequest, CourseRebuildResponse


class CourseRebuildService:
    def rebuild(self, request: CourseRebuildRequest) -> CourseRebuildResponse:
        return CourseRebuildResponse(
            overwritten_course_id=request.course_id,
            recalculated=True,
            satisfaction="undecided",
        )
