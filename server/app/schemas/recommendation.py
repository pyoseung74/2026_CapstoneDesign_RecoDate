from typing import Literal

from pydantic import BaseModel, Field


TransportMethod = Literal["walk", "public-transport", "car", "mixed", "unselected"]
RecommendationMode = Literal["quick-start", "deep-dive", "simple-refresh", "deep-dive-research"]
SupportedCity = Literal["강릉시"]


class RecommendationFilters(BaseModel):
    place_preference: Literal["direct", "random", "food-type"] | None = None
    budget_limit: int | None = Field(default=None, ge=0)
    movement_radius_meters: int | None = Field(default=None, ge=0)
    course_count: int | None = Field(default=None, ge=1, le=5)
    date_genre: str | None = None


class RecommendationRequest(BaseModel):
    mode: RecommendationMode
    transport: TransportMethod
    city: SupportedCity | None = None
    district: str | None = None
    scheduled_at: str | None = None
    filters: RecommendationFilters | None = None


class RecommendedCourse(BaseModel):
    id: str
    title: str
    estimated_budget: int
    total_duration_minutes: int
    place_ids: list[str]


class RecommendationResponse(BaseModel):
    mode: RecommendationMode
    courses: list[RecommendedCourse]
