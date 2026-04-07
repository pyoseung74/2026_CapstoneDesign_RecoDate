from fastapi import APIRouter

from app.schemas.course_rebuild import CourseRebuildRequest, CourseRebuildResponse
from app.services.course_rebuild import CourseRebuildService


router = APIRouter()
service = CourseRebuildService()


@router.post("/rebuild", response_model=CourseRebuildResponse)
def rebuild_course(payload: CourseRebuildRequest) -> CourseRebuildResponse:
    return service.rebuild(payload)
