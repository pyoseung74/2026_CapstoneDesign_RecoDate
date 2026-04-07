from typing import Literal

from pydantic import BaseModel


EditableField = Literal["place", "time", "activity-type"]
SatisfactionResult = Literal["satisfied", "unsatisfied", "undecided"]


class CourseRebuildRequest(BaseModel):
    course_id: str
    replaced_place_ids: list[str]
    reordered_place_ids: list[str]
    edited_fields: list[EditableField]


class CourseRebuildResponse(BaseModel):
    overwritten_course_id: str
    recalculated: bool = True
    satisfaction: SatisfactionResult = "undecided"
