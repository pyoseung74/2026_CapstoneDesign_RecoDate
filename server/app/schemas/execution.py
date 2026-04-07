from pydantic import BaseModel


class LiveReplanningRequest(BaseModel):
    course_id: str
    current_latitude: float
    current_longitude: float
    reason: str


class LiveReplanningResponse(BaseModel):
    course_id: str
    replanned: bool = True
    message: str
