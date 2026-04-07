from __future__ import annotations

from app.data.gangneung_seed import GANGNEUNG_PLACE_SEEDS, PlaceSeed
from app.schemas.recommendation import RecommendationRequest, RecommendedCourse


class RecommendationEngineService:
    def recommend(self, request: RecommendationRequest) -> list[RecommendedCourse]:
        if request.city not in (None, "gangneung-si"):
            return []

        max_courses = 3
        if request.mode in {"deep-dive", "deep-dive-research"} and request.filters:
            max_courses = min(request.filters.course_count or 3, 5)

        candidates = self._build_course_candidates(request)
        filtered = self._apply_budget_filter(candidates, request)
        ordered = self._order_courses(filtered, request.mode)
        return ordered[:max_courses]

    def _build_course_candidates(
        self,
        request: RecommendationRequest,
    ) -> list[RecommendedCourse]:
        time_key = self._resolve_time_key(request.scheduled_at)
        genre_key = (
          request.filters.date_genre.lower().replace(" ", "-")
          if request.filters and request.filters.date_genre
          else None
        )

        course_specs = [
            (
                "gangneung-course-a",
                self._build_title(time_key, request.transport, "A"),
                self._select_places(["brunch", "cafe", "activity"], genre_key),
            ),
            (
                "gangneung-course-b",
                self._build_title(time_key, request.transport, "B"),
                self._select_places(["lunch", "cafe", "activity"], genre_key),
            ),
            (
                "gangneung-course-c",
                self._build_title(time_key, request.transport, "C"),
                self._select_places(["dinner", "cafe", "night-view"], genre_key),
            ),
        ]

        courses: list[RecommendedCourse] = []
        for course_id, title, places in course_specs:
            estimated_budget = sum(place.budget_krw for place in places)
            transport_buffer = 40 if request.transport == "walk" else 70
            total_duration = len(places) * 55 + transport_buffer
            tags = sorted({tag for place in places for tag in place.tags})

            courses.append(
                RecommendedCourse(
                    id=course_id,
                    title=title,
                    estimated_budget=estimated_budget,
                    total_duration_minutes=total_duration,
                    place_ids=[place.id for place in places],
                    tags=tags[:5],
                )
            )

        return courses

    def _apply_budget_filter(
        self,
        courses: list[RecommendedCourse],
        request: RecommendationRequest,
    ) -> list[RecommendedCourse]:
        budget_limit = request.filters.budget_limit if request.filters else None
        if budget_limit is None:
            return courses

        filtered = [
            course for course in courses if course.estimated_budget <= budget_limit
        ]
        return filtered or courses

    def _order_courses(
        self,
        courses: list[RecommendedCourse],
        mode: str,
    ) -> list[RecommendedCourse]:
        if len(courses) <= 1:
            return courses

        if mode == "simple-refresh":
            return courses[1:] + courses[:1]

        if mode == "deep-dive-research":
            return courses[2:] + courses[:2]

        return courses

    def _build_title(self, time_key: str, transport: str, suffix: str) -> str:
        time_labels = {
            "morning": "\uc624\uc804",
            "afternoon": "\uc624\ud6c4",
            "evening": "\uc800\ub141",
            "night": "\uc57c\uac04",
        }
        transport_labels = {
            "walk": "\ub3c4\ubcf4",
            "public-transport": "\ub300\uc911\uad50\ud1b5",
            "car": "\uc790\ucc28",
            "mixed": "\ubcf5\ud569",
            "unselected": "\uae30\ubcf8",
        }
        return (
            f"\uac15\ub989\uc2dc {time_labels.get(time_key, '\ucd94\ucc9c')} "
            f"{transport_labels.get(transport, '\uae30\ubcf8')} \ucf54\uc2a4 {suffix}"
        )

    def _resolve_time_key(self, scheduled_at: str | None) -> str:
        if scheduled_at in {"10:00", "11:00"}:
            return "morning"
        if scheduled_at in {"14:00", "15:00"}:
            return "afternoon"
        if scheduled_at in {"18:00", "19:00"}:
            return "evening"
        return "night"

    def _select_places(
        self,
        categories: list[str],
        genre_key: str | None,
    ) -> list[PlaceSeed]:
        places: list[PlaceSeed] = []
        for category in categories:
            matched = [
                place
                for place in GANGNEUNG_PLACE_SEEDS
                if place.category == category
                and (
                    genre_key is None
                    or genre_key in place.tags
                    or genre_key.replace("-", "") in "".join(place.tags)
                )
            ]
            if not matched:
                matched = [
                    place
                    for place in GANGNEUNG_PLACE_SEEDS
                    if place.category == category
                ]
            places.append(matched[0])
        return places
