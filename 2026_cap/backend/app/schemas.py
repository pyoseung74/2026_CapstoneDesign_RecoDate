# ============================================================
# 이 파일은 RecoDate MVP 백엔드 API의 요청/응답 데이터 구조를 정의한다.
# 프론트엔드는 이 구조에 맞춰 시작 장소 검색과 추천 생성 요청을 보낸다.
# 추천 결과는 나중에 자유 수정 기능을 붙일 수 있도록 places 배열 구조로 반환한다.
# ============================================================

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class PlaceInput(BaseModel):
    id: str = Field("gangneung_station", description="장소 ID")
    name: str = Field("강릉역", description="장소 이름")
    lat: float = Field(37.76516161, description="위도")
    lon: float = Field(128.90139644, description="경도")

    upperBizName: str = ""
    middleBizName: str = ""
    lowerBizName: str = ""
    detailBizName: str = ""
    naver_popular: bool = False
    naver_popularity_rank: int | None = None


    class Config:
        title = "시작 장소 입력"
        json_schema_extra = {
            "example": {
                "id": "gangneung_station",
                "name": "강릉역",
                "lat": 37.76516161,
                "lon": 128.90139644,
            }
        }


class RecommendationRequest(BaseModel):
    required_place: PlaceInput | None = None
    required_places: list[PlaceInput] = Field(default_factory=list)
    accommodation_place: PlaceInput | None = None
    overnight: bool = False
    start_time: str | None = None
    start_place: PlaceInput = Field(default_factory=PlaceInput, description="데이트 시작 장소")
    transport: Literal["walk", "transit", "car"] = Field(
        "walk", description="이동수단. walk=도보, transit=대중교통, car=자차"
    )
    mode: Literal["quick", "detail"] = Field("quick", description="추천 방식. quick=빠른 추천, detail=상세 설정")
    radius_km: float | None = Field(None, description="주변 장소 검색 반경(km). 빠른 추천에서는 기본값 사용")
    course_count: int | None = Field(None, description="추천받을 코스 개수. 상세 설정에서 최대 5개")
    waypoint_count: int | None = Field(None, description="코스에 포함할 기본 경유지 개수")
    include_food: bool = True
    include_cafe: bool = True
    include_dinner: bool = True
    include_bar: bool = False
    region_key: str | None = None
    include_nearby_admin_regions: bool = False
    only_open_now: bool = False
    food_categories: list[str] | None = Field(None, description="음식 종류. 예: 한식, 중식, 일식, 음식")
    dinner_food_categories: list[str] | None = Field(None, description="숙박 코스의 저녁 음식 종류")
    travel_date: str | None = Field(None, description="여행 날짜(YYYY-MM-DD). 상세 설정에서 선택")
    apply_weather: bool = Field(False, description="여행 날짜의 기상청 예보(비/더위)를 코스 구성에 반영할지 여부")
    exclude_franchise_food: bool = Field(
        False, description="공정위 가맹정보 기준 프랜차이즈(외식·가맹점 10개 이상) 음식점을 추천에서 제외"
    )

    preferred_place_categories: list[str] | None = Field(
        None,
        description="Preferred course-role categories from TripTI. Used as priority, not as a strict filter.",
    )

    class Config:
        title = "추천 코스 생성 요청"
        json_schema_extra = {
            "examples": [
                {
                    "summary": "빠른 추천 도보",
                    "value": {
                        "transport": "walk",
                        "mode": "quick",
                    },
                },
                {
                    "summary": "상세 설정 자차",
                    "value": {
                        "transport": "car",
                        "mode": "detail",
                        "radius_km": 5,
                        "course_count": 5,
                        "food_categories": ["한식"],
                        "start_place": {
                            "id": "gangneung_station",
                            "name": "강릉역",
                            "lat": 37.76516161,
                            "lon": 128.90139644,
                        },
                    },
                },
            ]
        }


class PlaceResponse(BaseModel):
    order: int = Field(..., description="코스 안에서 장소 순서")
    id: str = Field(..., description="장소 ID")
    name: str = Field(..., description="장소 이름")
    category: str = Field(..., description="RecoDate 내부 카테고리")
    lat: float = Field(..., description="위도")
    lon: float = Field(..., description="경도")
    locked: bool = Field(..., description="시작 장소처럼 고정된 장소인지 여부")
    replaceable: bool = Field(..., description="나중에 장소 교체가 가능한지 여부")
    source_category: str = Field("", description="TMAP 검색에 사용한 원본 카테고리")
    park_flag: str = Field("", description="TMAP 주차 가능 표시값")
    naver_popular: bool = Field(False, description="네이버 리뷰 인기 검색 결과 포함 여부")
    naver_popularity_rank: int | None = Field(None, description="네이버 리뷰 인기 검색 내 순위")
    google_rating: float | None = Field(None, description="Google Maps 평점")
    google_review_count: int | None = Field(None, description="Google Maps 사용자 리뷰 수")
    google_maps_uri: str = Field("", description="Google Maps 장소 링크")
    opening_hours: list[str] = Field(default_factory=list, description="Google Maps 요일별 운영시간")
    open_now: bool | None = Field(None, description="Google Maps 현재 운영 여부")

    class Config:
        title = "추천 장소 정보"


class RouteLegResponse(BaseModel):
    from_place: str = Field(alias="from", description="출발 장소")
    to: str = Field(..., description="도착 장소")
    distance_m: int = Field(..., description="구간 이동거리(m)")
    time_sec: int = Field(..., description="구간 이동시간(초)")
    mode: str = Field("", description="구간 이동수단")
    estimated: bool = Field(False, description="예상값 사용 여부")
    instructions: list[dict] = Field(default_factory=list, description="구간별 상세 이동 안내")
    taxi_fare_estimate_won: int | None = Field(None, description="지역별 중형택시 낮 시간 거리 기준 예상 요금")
    taxi_recommended: bool = Field(False, description="택시 이동 추천 여부")
    taxi_required: bool = Field(False, description="대중교통 경로가 없어 택시가 필요한 구간인지 여부")
    taxi_reason: str = Field("", description="택시 이동이 필요한 이유")

    class Config:
        title = "구간 경로 정보"
        populate_by_name = True


class RoutePathPointResponse(BaseModel):
    lat: float = Field(..., description="경로선 위도")
    lon: float = Field(..., description="경로선 경도")

    class Config:
        title = "경로 좌표 정보"


class RouteResponse(BaseModel):
    type: str = Field(..., description="경로 계산 방식")
    total_distance_m: int = Field(..., description="전체 이동거리(m)")
    total_time_sec: int = Field(..., description="전체 이동시간(초)")
    api_call_count: int = Field(..., description="경로 계산에 사용한 API 호출 수")
    legs: list[RouteLegResponse] = Field(default_factory=list, description="도보 구간별 경로 정보")
    path: list[RoutePathPointResponse] = Field(default_factory=list, description="지도에 표시할 실제 경로 좌표 목록")
    transit_fallback_used: bool = Field(False, description="대중교통 예상값 대체 사용 여부")
    transportation_budget_won: int = Field(0, description="1인 기준 예상 교통비")
    transportation_budget_label: str = Field("", description="교통비 산정 방식 안내")
    taxi_option_total_won: int | None = Field(None, description="택시 선택 구간 예상 요금 합계")
    taxi_return_estimate_won: int | None = Field(None, description="마지막 장소에서 시작 장소까지 예상 택시 요금")
    taxi_round_trip_estimate_won: int | None = Field(None, description="택시 선택 구간과 귀환 예상 택시 요금 합계")
    taxi_round_trip_recommended: bool = Field(False, description="귀환 포함 택시 예상 요금이 추천 한도 이내인지 여부")

    class Config:
        title = "전체 경로 정보"


class CourseResponse(BaseModel):
    course_id: str = Field(..., description="추천 코스 ID")
    title: str = Field(..., description="추천 코스 제목")
    transport: str = Field(..., description="이동수단")
    score: float = Field(..., description="추천 점수")
    places: list[PlaceResponse] = Field(..., description="코스에 포함된 장소 목록")
    route: RouteResponse = Field(..., description="경로 정보")
    estimated_budget_won: int = Field(..., description="교통비를 포함한 1인 기준 예상 예산")
    estimated_place_budget_won: int = Field(..., description="1인 기준 장소 이용 예상 예산")
    estimated_transportation_budget_won: int = Field(..., description="1인 기준 예상 교통비")
    budget_items: list[dict] = Field(default_factory=list, description="장소별 예산 산정 내역")
    budget_has_actual_prices: bool = Field(False, description="SQLite 공식 가격이 하나 이상 반영되었는지 여부")
    recommendation_reason: str = Field(..., description="추천 이유")

    class Config:
        title = "추천 코스 정보"


class RecommendationResponse(BaseModel):
    input: dict = Field(..., description="추천 요청에 사용된 입력값")
    candidate_counts: dict = Field(..., description="검색된 후보 장소 개수")
    weather: dict | None = Field(None, description="여행 날짜 기상 반영 결과(applied, summary 등)")
    courses: list[CourseResponse] = Field(..., description="최종 추천 코스 목록")

    class Config:
        title = "추천 코스 생성 응답"


class CommunityPostCreate(BaseModel):
    post_type: Literal["course", "text"] = Field("course", description="게시물 종류. course=코스 공유, text=글·사진")
    title: str | None = Field("", max_length=60, description="코스 제목(코스 게시물 필수)")
    comment: str | None = Field("", max_length=500, description="본문 또는 한 줄 소개")
    region_label: str | None = Field("", max_length=40, description="지역 라벨. 예: 서울 중구")
    transport: str | None = Field("walk", description="이동수단")
    visibility: Literal["public", "friends"] = Field("public", description="공개 범위")
    course: dict | None = Field(None, description="코스 스냅샷(JSON). 코스 게시물에서 필수")
    images: list[str] | None = Field(None, description="base64 data URL 이미지 목록(글 게시물, 최대 4장)")
    as_couple: bool = Field(False, description="커플로 올리기(연인이 있을 때 작성자❤️연인으로 표시)")

    class Config:
        title = "커뮤니티 게시 요청"


class CoupleRequestBody(BaseModel):
    user_id: int = Field(..., description="연인 맺기를 요청할 상대 user id")

    class Config:
        title = "연인 맺기 요청"


class CoupleRespondBody(BaseModel):
    requester_id: int = Field(..., description="연인 요청을 보낸 상대 user id")
    accept: bool = Field(..., description="수락 여부")

    class Config:
        title = "연인 요청 응답"


class AnniversaryUpdate(BaseModel):
    anniversary_date: str | None = Field("", max_length=10, description="기념일 YYYY-MM-DD(비우면 해제)")

    class Config:
        title = "기념일 설정"


class PasswordResetRequest(BaseModel):
    email: str = Field(..., max_length=120, description="가입 이메일")
    phone: str = Field(..., max_length=20, description="가입 시 등록한 전화번호")
    new_password: str = Field(..., min_length=8, max_length=100, description="새 비밀번호")

    class Config:
        title = "비밀번호 재설정 요청"


class CommentCreate(BaseModel):
    content: str = Field(..., max_length=300, description="댓글 내용")

    class Config:
        title = "댓글 작성 요청"


class PlaceReviewCreate(BaseModel):
    place_id: str | None = Field("", max_length=120)
    place_name: str = Field(..., min_length=1, max_length=120)
    place_category: str | None = Field("", max_length=80)
    address: str | None = Field("", max_length=240)
    lat: float | None = None
    lon: float | None = None
    rating: int = Field(..., ge=1, le=5)
    content: str = Field(..., min_length=1, max_length=500)
    images: list[str] | None = Field(None, description="base64 data URL 이미지 목록(최대 4장)")
    share_to_feed: bool = Field(False, description="체크 시에만 리뷰를 커뮤니티 피드에도 올린다")

    class Config:
        title = "장소 리뷰 작성 요청"


class ReportCreate(BaseModel):
    target_type: Literal["post", "comment", "user"] = Field(..., description="신고 대상 종류")
    target_id: int = Field(..., description="신고 대상 ID")
    reason: str | None = Field("", max_length=100, description="신고 사유")

    class Config:
        title = "신고 요청"


class ChatMessageCreate(BaseModel):
    content: str | None = Field("", max_length=500, description="메시지 본문(코스·사진 첨부 시 생략 가능)")
    course: dict | None = Field(None, description="첨부할 코스 스냅샷(JSON)")
    images: list[str] | None = Field(None, description="base64 data URL 이미지 목록(최대 4장)")
    reply_to_id: int | None = Field(None, description="답장 대상 메시지 ID(같은 대화 안에서만 유효)")

    class Config:
        title = "채팅 메시지 전송 요청"


class ChatRoomCreate(BaseModel):
    member_ids: list[int] = Field(..., description="초대할 친구 user id 목록(맞팔로우만, 2명 이상)")
    name: str | None = Field("", max_length=40, description="방 이름(비우면 참여자 이름으로 자동)")

    class Config:
        title = "단체 채팅방 생성 요청"


class ChatRoomRenameRequest(BaseModel):
    name: str | None = Field("", max_length=40, description="새 방 이름(비우면 자동 이름)")

    class Config:
        title = "단체 채팅방 이름 변경 요청"


class SelectedCourseRouteRequest(BaseModel):
    transport: Literal["walk", "transit", "car"] = Field(
        ..., description="이동수단. walk=도보, transit=대중교통, car=자차"
    )
    places: list[PlaceInput] = Field(..., min_length=2, description="실제 경로를 계산할 선택된 코스 장소 목록")

    class Config:
        title = "선택 코스 실제 경로 계산 요청"
        json_schema_extra = {
            "example": {
                "transport": "walk",
                "places": [
                    {
                        "id": "gangneung_station",
                        "name": "강릉역",
                        "lat": 37.76516161,
                        "lon": 128.90139644,
                    },
                    {
                        "id": "10107144",
                        "name": "은화식당",
                        "lat": 37.76460611,
                        "lon": 128.90103538,
                    },
                    {
                        "id": "cafe_001",
                        "name": "프라이데이",
                        "lat": 37.76402285,
                        "lon": 128.90106318,
                    },
                ],
            }
        }


class RecalculateCourseRequest(BaseModel):
    course_id: str
    transport: Literal["walk", "transit", "car"]
    places: list[PlaceResponse] = Field(..., min_length=2)


class PlaceSearchResponse(BaseModel):
    keyword: str = Field(..., description="검색어")
    total_count: int | str | None = Field(..., description="TMAP 검색 전체 결과 수")
    places: list[dict] = Field(..., description="시작 장소 후보 목록")
    nearby_places: list[dict] = Field(default_factory=list, description="현재 장소와 가까운 유사 장소 목록")

    class Config:
        title = "시작 장소 검색 응답"


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    phone: str = Field(..., min_length=8, max_length=30)
    nickname: str = Field(..., min_length=2, max_length=30)
    password: str = Field(..., min_length=8, max_length=100)
    password_confirm: str = Field(..., min_length=8, max_length=100)
    agreed_terms: bool = False
    agreed_privacy: bool = False
    agreed_location: bool = False
    age_over_14: bool = False
    agreed_content_license: bool = Field(False, description="작성 리뷰·게시물의 서비스 운영·개선·통계 목적 활용 동의(필수)")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value):
        normalized = re.sub(r"\D", "", value)
        if not 9 <= len(normalized) <= 15:
            raise ValueError("전화번호를 확인해 주세요.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value):
        if any(character.isspace() for character in value) or not re.search(r"[^A-Za-z0-9가-힣]", value):
            raise ValueError("비밀번호는 8자 이상이며 특수문자를 1개 이상 포함해야 합니다.")
        return value


class LoginRequest(BaseModel):
    email: str | None = None
    login_id: str | None = None
    password: str


class KakaoSignupCompleteRequest(BaseModel):
    pending_token: str = Field(..., min_length=20, max_length=200)
    nickname: str = Field(..., min_length=2, max_length=30)
    agreed_terms: bool = False
    agreed_privacy: bool = False
    agreed_location: bool = False
    age_over_14: bool = False


class FindLoginIdRequest(BaseModel):
    email: str


class ProfileUpdateRequest(BaseModel):
    nickname: str | None = Field(None, min_length=2, max_length=30)
    profile_image: str | None = Field(None, max_length=300000)


class TriptiResultRequest(BaseModel):
    result: dict[str, Any]


class PushSubscribeRequest(BaseModel):
    """푸시 구독 등록 요청.

    - channel="webpush": PWA(브라우저) 푸시. endpoint + keys(p256dh, auth)가 필요하다.
    - channel="fcm": 네이티브 앱(안드로이드) 푸시. token 한 개만 필요하다.
    """

    channel: Literal["webpush", "fcm"] = Field(..., description="푸시 채널")
    # FCM 토큰(네이티브). webpush일 때는 비움.
    token: str | None = Field(None, max_length=4096, description="FCM 디바이스 토큰")
    # 웹푸시 구독 객체(PushSubscription.toJSON()). fcm일 때는 비움.
    endpoint: str | None = Field(None, max_length=2048, description="웹푸시 endpoint URL")
    p256dh: str | None = Field(None, max_length=512, description="웹푸시 공개키(p256dh)")
    auth: str | None = Field(None, max_length=512, description="웹푸시 auth secret")
    platform: str | None = Field("", max_length=40, description="플랫폼(android/ios/web)")

    class Config:
        title = "푸시 구독 등록 요청"


class PushUnsubscribeRequest(BaseModel):
    """푸시 구독 해제. 토큰(fcm) 또는 endpoint(webpush) 중 가진 값으로 지운다."""

    token: str | None = Field(None, max_length=4096)
    endpoint: str | None = Field(None, max_length=2048)

    class Config:
        title = "푸시 구독 해제 요청"
