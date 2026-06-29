# ============================================================
# 이 파일은 RecoDate MVP FastAPI 백엔드의 진입점이다.
# 장소 검색 API, 추천 코스 생성 API, 지도 이미지 프록시 API를 제공하며,
# 내부적으로 TMAP API와 추천 알고리즘 서비스를 호출한다.
# ============================================================

from pathlib import Path
import json
import shutil
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import (
    AnniversaryUpdate,
    ChatMessageCreate,
    ChatRoomCreate,
    ChatRoomRenameRequest,
    CommentCreate,
    CommunityPostCreate,
    CoupleRequestBody,
    CoupleRespondBody,
    PasswordResetRequest,
    ReportCreate,
    CourseResponse,
    FindLoginIdRequest,
    KakaoSignupCompleteRequest,
    LoginRequest,
    PlaceSearchResponse,
    PlaceReviewCreate,
    ProfileUpdateRequest,
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    RecalculateCourseRequest,
    RegisterRequest,
    RecommendationRequest,
    RecommendationResponse,
    RouteResponse,
    SelectedCourseRouteRequest,
    TriptiResultRequest,
)
from app.services.auth_repository import AuthRepository
from app.services.community_repository import CommunityRepository
from app.config import settings
from app.services.google_places_client import GooglePlacesClient
from app.services.naver_local_client import NaverLocalClient
from app.services.recommendation_service import RecommendationService
from app.services.tmap_client import TmapClient


app = FastAPI(
    title="RecoDate MVP API",
    description="""
TMAP 장소·지도 API와 TAGO 강릉 버스 SQLite를 함께 사용하는 RecoDate MVP 추천 백엔드입니다.

현재 MVP에서 가능한 기능:

- 시작 장소 검색
- 빠른 추천: 기본 3개
- 상세 설정 추천: 최대 5개
- 도보/대중교통/자차 이동수단 반영
- 음식 종류, 이동 반경, 추천 개수 반영
- SQLite 공식 가격 우선 반영, 미등록 장소는 카테고리 대표값으로 보완
- 안목해변처럼 지역 특성이 뚜렷한 장소의 특화 순서 후보 추가
- 강릉 버스 SQLite 기반 직행 및 1회 환승 경로 안내
- 추천 단계에서는 TMAP 경로 API 호출 없이 예상 거리/시간 사용
- 선택한 코스만 실제 TMAP 경로 계산
- 선택한 코스 확인용 TMAP StaticMap 이미지 제공

아직 보류한 기능:

- 시작/종료 시간 반영
- 사용자 입력 예산에 따른 추천 결과 필터
- 운영시간 필터
- 자유 편집 UI
""",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/web", StaticFiles(directory=FRONTEND_DIR, html=True), name="recodate-web")


@app.get("/", summary="서버 상태 확인", tags=["기본"])
def root():
    return {"message": "RecoDate MVP API 서버가 실행 중입니다.", "version": "0.1.0"}


@app.get("/api/health", summary="운영 상태 확인", tags=["기본"])
def health():
    place_database = Path(__file__).resolve().parents[1] / "data" / "recodate_places.db"
    disk = shutil.disk_usage(place_database.parent)
    return {
        "status": "ok" if place_database.exists() and disk.free >= 500_000_000 else "degraded",
        "place_database": {
            "exists": place_database.exists(),
            "size_bytes": place_database.stat().st_size if place_database.exists() else 0,
        },
        "disk": {
            "free_bytes": disk.free,
            "total_bytes": disk.total,
        },
    }


# ------------------- 무차별 대입 방어(레이트 리밋) -------------------
# 로그인/가입류 엔드포인트에 IP당 시도 횟수를 제한한다. 인메모리 슬라이딩 윈도 방식
# (단일 uvicorn 프로세스 기준이라 별도 저장소 없이 충분하다).
import time as _time

_RATE_BUCKETS = {}


def _client_ip(request):
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce_rate_limit(request, bucket, limit, window_seconds):
    now = _time.time()
    key = (bucket, _client_ip(request))
    attempts = [stamp for stamp in _RATE_BUCKETS.get(key, []) if now - stamp < window_seconds]
    if len(attempts) >= limit:
        raise HTTPException(status_code=429, detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
    attempts.append(now)
    _RATE_BUCKETS[key] = attempts
    if len(_RATE_BUCKETS) > 10000:
        _RATE_BUCKETS.clear()


def _bearer_token(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return authorization.removeprefix("Bearer ").strip()


def _require_user(authorization):
    user = AuthRepository().get_user_by_token(_bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="로그인 정보가 만료되었습니다.")
    return user


@app.post("/api/auth/register", tags=["로그인"])
def register(req: RegisterRequest, request: Request = None):
    if request is not None:
        _enforce_rate_limit(request, "register", limit=5, window_seconds=3600)
    try:
        if req.password != req.password_confirm:
            raise ValueError("비밀번호 확인이 일치하지 않습니다.")
        if not (req.agreed_terms and req.agreed_privacy and req.agreed_location and req.age_over_14 and req.agreed_content_license):
            raise ValueError("필수 약관(콘텐츠 활용 동의 포함)과 만 14세 이상 확인에 동의해 주세요.")
        user = AuthRepository().register(
            req.email,
            req.phone,
            req.nickname,
            req.password,
            req.agreed_terms,
            req.agreed_privacy,
            req.agreed_location,
            req.age_over_14,
            agreed_content_license=req.agreed_content_license,
        )
        return {"user": user}
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/auth/login", tags=["로그인"])
def login(req: LoginRequest, request: Request = None):
    if request is not None:
        _enforce_rate_limit(request, "login", limit=10, window_seconds=300)
    try:
        email = req.email or req.login_id or ""
        return AuthRepository().login(email, req.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/auth/kakao/start", tags=["로그인"])
def start_kakao_login():
    if not settings.kakao_rest_api_key:
        raise HTTPException(status_code=503, detail="KAKAO_REST_API_KEY가 설정되어 있지 않습니다.")
    redirect_uri = settings.kakao_redirect_uri
    url = (
        "https://kauth.kakao.com/oauth/authorize"
        f"?response_type=code&client_id={settings.kakao_rest_api_key}&redirect_uri={redirect_uri}"
    )
    return RedirectResponse(url)


@app.get("/api/auth/kakao/callback", tags=["로그인"])
def kakao_login_callback(code: str = Query(...)):
    if not settings.kakao_rest_api_key:
        raise HTTPException(status_code=503, detail="KAKAO_REST_API_KEY가 설정되어 있지 않습니다.")
    token_params = {
        "grant_type": "authorization_code",
        "client_id": settings.kakao_rest_api_key,
        "redirect_uri": settings.kakao_redirect_uri,
        "code": code,
    }
    # 카카오 개발자 콘솔에서 Client Secret을 '사용함'으로 설정한 경우 토큰 요청에 포함해야 한다.
    if settings.kakao_client_secret:
        token_params["client_secret"] = settings.kakao_client_secret
    token_payload = urlencode(token_params).encode()
    token_request = Request(
        "https://kauth.kakao.com/oauth/token",
        data=token_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(token_request, timeout=10) as response:
            token_data = json.loads(response.read().decode("utf-8"))
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("카카오 토큰을 받지 못했습니다.")
        user_request = Request(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        with urlopen(user_request, timeout=10) as response:
            kakao_user = json.loads(response.read().decode("utf-8"))
        kakao_account = kakao_user.get("kakao_account") or {}
        profile = kakao_account.get("profile") or {}
        auth_result = AuthRepository().login_or_prepare_kakao(
            kakao_user.get("id"),
            kakao_account.get("email") or "",
            profile.get("nickname") or "",
        )
    except Exception as exc:
        return RedirectResponse(f"/?auth_error={quote(str(exc))}")
    if auth_result.get("status") == "signup_required":
        return RedirectResponse(
            "/?"
            f"kakao_signup={quote(auth_result['pending_token'])}"
            f"&kakao_email={quote(auth_result['email'])}"
            f"&kakao_nickname={quote(auth_result.get('nickname') or '')}"
        )
    return RedirectResponse(f"/?kakao_token={auth_result['token']}")


@app.post("/api/auth/kakao/complete", tags=["로그인"])
def complete_kakao_signup(req: KakaoSignupCompleteRequest):
    try:
        if not (req.agreed_terms and req.agreed_privacy and req.agreed_location and req.age_over_14):
            raise ValueError("필수 약관과 만 14세 이상 확인에 동의해 주세요.")
        return AuthRepository().complete_kakao_signup(
            req.pending_token,
            req.nickname,
            req.agreed_terms,
            req.agreed_privacy,
            req.agreed_location,
            req.age_over_14,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/auth/me", tags=["로그인"])
def get_me(authorization: str | None = Header(None)):
    user = AuthRepository().get_user_by_token(_bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="로그인 정보가 만료되었습니다.")
    return {"user": user}


@app.post("/api/auth/logout", tags=["로그인"])
def logout(authorization: str | None = Header(None)):
    AuthRepository().logout(_bearer_token(authorization))
    return {"ok": True}


@app.post("/api/auth/find-login-id", tags=["로그인"])
def find_login_id(req: FindLoginIdRequest, request: Request = None):
    if request is not None:
        _enforce_rate_limit(request, "find_id", limit=5, window_seconds=300)
    login_id = AuthRepository().find_login_id(req.email)
    if not login_id:
        raise HTTPException(status_code=404, detail="등록된 이메일을 찾지 못했습니다.")
    return {"login_id": login_id}


@app.post("/api/auth/reset-password", tags=["로그인"], summary="비밀번호 재설정(이메일+전화번호 확인)")
def reset_password(req: PasswordResetRequest, request: Request = None):
    if request is not None:
        _enforce_rate_limit(request, "reset_password", limit=5, window_seconds=3600)
    try:
        return AuthRepository().reset_password(req.email, req.phone, req.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/auth/profile", tags=["로그인"])
def update_profile(req: ProfileUpdateRequest, authorization: str | None = Header(None)):
    try:
        user = AuthRepository().update_profile(
            _bearer_token(authorization),
            nickname=req.nickname,
            profile_image=req.profile_image,
        )
        if not user:
            raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
        return {"user": user}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/auth/tripti-result", tags=["TripTI"])
def get_tripti_result(authorization: str | None = Header(None)):
    result = AuthRepository().get_tripti_result(_bearer_token(authorization))
    return {"result": result}


@app.post("/api/auth/tripti-result", tags=["TripTI"])
def save_tripti_result(req: TriptiResultRequest, authorization: str | None = Header(None)):
    result = AuthRepository().save_tripti_result(_bearer_token(authorization), req.result)
    if result is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return {"result": result}


@app.get(
    "/api/config/tmap-sdk",
    summary="TMAP 지도 SDK 설정 가져오기",
    description="프론트엔드에서 TMAP JavaScript 지도 SDK를 로드할 때 필요한 appKey를 반환합니다. 배포 전에는 도메인 제한 설정이 필요합니다.",
    tags=["지도 이미지"],
)
def get_tmap_sdk_config():
    try:
        # 지도 SDK는 브라우저 노출 전용 키를 쓴다(서버용 키는 SK 콘솔에서 IP 제한).
        return {"appKey": settings.tmap_sdk_app_key or TmapClient().app_key}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/api/places/search",
    response_model=PlaceSearchResponse,
    summary="시작 장소 검색",
    description="사용자가 입력한 장소명으로 TMAP POI 통합검색을 실행해 시작 장소 후보를 반환합니다.",
    tags=["장소 검색"],
)
def search_places(keyword: str = Query(..., min_length=1), count: int = Query(10, ge=1, le=20)):
    try:
        service = RecommendationService()
        return service.search_start_places(keyword, count=count)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/api/places/replacements",
    response_model=PlaceSearchResponse,
    summary="비슷한 장소 자동 추천",
    tags=["장소 검색"],
)
def search_replacement_places(
    lat: float,
    lon: float,
    category: str,
    source_category: str = "",
    exclude_name: str = "",
    count: int = Query(5, ge=1, le=10),
):
    try:
        service = RecommendationService()
        return service.search_replacement_places(lat, lon, category, source_category, exclude_name, count)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/places/browse", tags=["장소 검색"])
def browse_places(
    category: str,
    region: str = "all",
    region_key: str = Query(""),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    area_label: str = Query(""),
    count: int = Query(12, ge=1, le=24),
    offset: int = Query(0, ge=0),
):
    try:
        return RecommendationService().browse_gangneung_places(
            category, count, region, offset, lat, lon, area_label, region_key
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/places/map-browse", tags=["장소 검색"])
def map_browse_places(
    keyword: str = Query("", description="장소 검색어(좌표 lat/lon을 주면 생략 가능)"),
    categories: str = Query("food,cafe,bar,tourist,activity,culture,stay,shopping,other"),
    radius_km: float = Query(2.5, ge=0.5, le=10),
    count: int = Query(8, ge=1, le=20),
    lat: float | None = Query(None, description="'이 지역 검색'용 지도 중심 위도"),
    lon: float | None = Query(None, description="'이 지역 검색'용 지도 중심 경도"),
):
    try:
        selected_categories = [
            item.strip()
            for item in categories.split(",")
            if item.strip()
        ]
        return RecommendationService().map_browse_places(
            keyword,
            categories=selected_categories,
            radius_km=radius_km,
            count=count,
            center_lat=lat,
            center_lon=lon,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post(
    "/api/recommendations",
    response_model=RecommendationResponse,
    summary="추천 코스 생성",
    description="시작 장소, 이동수단, 추천 방식, 음식 종류, 반경, 추천 개수를 바탕으로 데이트 코스를 생성합니다.",
    tags=["코스 추천"],
)
def create_recommendations(req: RecommendationRequest, authorization: str | None = Header(None)):
    try:
        _require_user(authorization)
        service = RecommendationService()
        return service.recommend(req)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post(
    "/api/routes/selected-course",
    response_model=RouteResponse,
    summary="선택한 코스 실제 경로 계산",
    description="선택한 코스의 도보·자차 구간은 TMAP으로 계산하고, 대중교통 구간은 ODsay 전국 버스·지하철 경로를 우선 사용합니다.",
    tags=["코스 추천"],
)
def calculate_selected_course_route(req: SelectedCourseRouteRequest, authorization: str | None = Header(None)):
    try:
        _require_user(authorization)
        service = RecommendationService()
        return service.calculate_selected_route(req)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post(
    "/api/courses/recalculate",
    response_model=CourseResponse,
    summary="수정한 추천 코스 다시 계산",
    tags=["코스 추천"],
)
def recalculate_course(req: RecalculateCourseRequest, authorization: str | None = Header(None)):
    try:
        _require_user(authorization)
        service = RecommendationService()
        return service.recalculate_course(req)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/courses/preview/{course_id}", response_model=CourseResponse, tags=["코스 추천"])
def get_preview_course(
    course_id: str,
    transport: str = Query("transit", pattern="^(walk|transit|car)$"),
    overnight: bool = Query(False),
    include_food: bool = Query(True),
    include_cafe: bool = Query(True),
    include_dinner: bool = Query(True),
    include_bar: bool = Query(False),
    authorization: str | None = Header(None),
):
    try:
        _require_user(authorization)
        return RecommendationService().preview_course(
            course_id,
            transport=transport,
            overnight=overnight,
            include_food=include_food,
            include_cafe=include_cafe,
            include_dinner=include_dinner,
            include_bar=include_bar,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/api/maps/static",
    summary="TMAP 지도 이미지 가져오기",
    description="프론트엔드에 appKey를 노출하지 않고 TMAP StaticMap 이미지를 백엔드에서 대신 가져옵니다.",
    tags=["지도 이미지"],
)
def get_static_map(
    lat: float = Query(..., description="지도 중심 위도"),
    lon: float = Query(..., description="지도 중심 경도"),
    zoom: int = Query(15, ge=6, le=19, description="지도 확대 레벨"),
):
    try:
        image, content_type, _elapsed_ms = TmapClient().static_map_image(lat=lat, lon=lon, zoom=zoom)
        return Response(content=image, media_type=content_type.split(";")[0])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/places/google-photo", tags=["장소 검색"])
def get_google_place_photo(
    name: str = Query(..., min_length=1),
    width: int = Query(720, ge=1, le=1600),
    height: int = Query(480, ge=1, le=1600),
):
    try:
        image, content_type = GooglePlacesClient().get_photo(name, width, height)
        return Response(content=image, media_type=content_type.split(";")[0])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/places/google-photo-search", tags=["장소 검색"])
def search_google_place_photo(
    name: str = Query(..., min_length=1),
    lat: float = Query(...),
    lon: float = Query(...),
    include_details: bool = Query(False),
):
    return GooglePlacesClient().search_photo_by_name(name, lat, lon, include_details=include_details) or {}


@app.get("/api/places/naver-image", tags=["장소 검색"])
def search_naver_place_image(name: str = Query(..., min_length=1), display: int = Query(6, ge=1, le=10)):
    return NaverLocalClient().search_image(f"{name} 장소 사진", display=display) or {}


@app.get("/api/places/reviews", tags=["장소 리뷰"], summary="RecoDate 장소 리뷰 조회")
def list_place_reviews(
    place_id: str = Query(""),
    place_name: str = Query(..., min_length=1),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    authorization: str | None = Header(None),
):
    user = _require_user(authorization)
    return CommunityRepository().get_place_reviews(user["id"], place_id, place_name, lat, lon)


@app.post("/api/places/reviews", tags=["장소 리뷰"], summary="RecoDate 장소 리뷰 작성/수정")
def save_place_review(req: PlaceReviewCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "place_review", limit=20, window_seconds=3600)
    repository = CommunityRepository()
    try:
        image_filenames = repository.save_images(req.images) if req.images is not None else None
        return repository.save_place_review(user["id"], req, image_filenames=image_filenames)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.delete("/api/places/reviews/{review_id}", tags=["장소 리뷰"], summary="내 RecoDate 장소 리뷰 삭제")
def delete_place_review(review_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().delete_place_review(review_id, user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@app.post("/api/community/posts", tags=["커뮤니티"], summary="코스 공유 게시")
def create_community_post(req: CommunityPostCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "post_create", limit=10, window_seconds=3600)
    repository = CommunityRepository()
    try:
        image_filenames = repository.save_images(req.images) if req.images else []
        return repository.create_post(
            user["id"], req.title, req.comment, req.region_label, req.transport, req.course, req.visibility,
            post_type=req.post_type, image_filenames=image_filenames, as_couple=req.as_couple,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/posts", tags=["커뮤니티"], summary="코스 피드 조회")
def list_community_posts(
    scope: str = Query("all"),
    sort: str = Query("recent"),
    authorization: str | None = Header(None),
):
    user = _require_user(authorization)
    return {"posts": CommunityRepository().list_posts(user["id"], scope=scope, sort=sort)}


@app.post("/api/community/posts/{post_id}/like", tags=["커뮤니티"], summary="좋아요 토글")
def toggle_community_like(post_id: int, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "post_like", limit=60, window_seconds=300)
    try:
        return CommunityRepository().toggle_like(post_id, user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/community/posts/{post_id}", tags=["커뮤니티"], summary="내 게시물 삭제")
def delete_community_post(post_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().delete_post(post_id, user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/community/images/{filename}", tags=["커뮤니티"], summary="게시물 이미지")
def get_community_image(filename: str):
    path = CommunityRepository().image_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")
    return FileResponse(path)


@app.get("/api/community/my-stats", tags=["커뮤니티"], summary="내 커뮤니티 통계")
def get_my_community_stats(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().my_stats(user["id"])


@app.get("/api/community/following", tags=["커뮤니티"], summary="팔로잉 목록")
def list_following(target_id: int | None = Query(None), authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"users": CommunityRepository().list_following(user["id"], target_id)}


@app.get("/api/community/followers", tags=["커뮤니티"], summary="팔로워 목록")
def list_followers(target_id: int | None = Query(None), authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"users": CommunityRepository().list_followers(user["id"], target_id)}


@app.get("/api/community/recommend-friends", tags=["커뮤니티"], summary="추천 친구(친구의 친구)")
def recommend_friends(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"users": CommunityRepository().recommend_friends(user["id"])}


# ------------------- 연인(커플) 맺기 -------------------


@app.get("/api/community/couple", tags=["커뮤니티"], summary="내 연인 상태(디데이 포함)")
def get_couple(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().couple_status(user["id"])


@app.post("/api/community/couple/request", tags=["커뮤니티"], summary="연인 맺기 요청")
def request_couple(req: CoupleRequestBody, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().request_couple(user["id"], req.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/community/couple/respond", tags=["커뮤니티"], summary="연인 요청 수락/거절")
def respond_couple(req: CoupleRespondBody, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().respond_couple(user["id"], req.requester_id, req.accept)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/community/couple/cancel", tags=["커뮤니티"], summary="보낸 연인 요청 취소")
def cancel_couple(req: CoupleRequestBody, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().cancel_couple_request(user["id"], req.user_id)


@app.delete("/api/community/couple", tags=["커뮤니티"], summary="헤어지기")
def breakup_couple(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().breakup_couple(user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/community/couple/anniversary", tags=["커뮤니티"], summary="기념일 설정")
def set_anniversary(req: AnniversaryUpdate, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().set_anniversary(user["id"], req.anniversary_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/users/search", tags=["커뮤니티"], summary="사용자 검색(닉네임)")
def search_community_users(q: str = Query(..., min_length=1), authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "user_search", limit=30, window_seconds=300)
    return {"users": CommunityRepository().search_users(user["id"], q)}


@app.post("/api/community/follow", tags=["커뮤니티"], summary="팔로우")
def follow_user(body: dict, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "follow", limit=60, window_seconds=3600)
    try:
        return CommunityRepository().follow_user(user["id"], int(body.get("user_id", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/community/follow/{followee_id}", tags=["커뮤니티"], summary="언팔로우")
def unfollow_user(followee_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().unfollow_user(user["id"], followee_id)


@app.get("/api/community/users/{user_id}/avatar", tags=["커뮤니티"], summary="사용자 프로필 사진")
def get_user_avatar(user_id: int, request: Request = None):
    """users.profile_image(data URL)를 이미지로 서빙한다. 피드·채팅·댓글 아바타가 공통으로 쓴다.

    사진을 바꾸면 즉시 모든 곳에 반영되도록, 캐시는 'no-cache'(매 요청 재검증)로 두고
    내용 해시 ETag를 붙인다. 안 바뀌었으면 304로 가볍게, 바뀌었으면 새 이미지를 내려준다.
    """
    import base64 as _base64
    import hashlib as _hashlib

    row = AuthRepository().get_profile_image(user_id)
    if not row or not row.startswith("data:image/"):
        raise HTTPException(status_code=404, detail="프로필 사진이 없습니다.")
    try:
        header, encoded = row.split(",", 1)
        media_type = header.split(";")[0].removeprefix("data:") or "image/jpeg"
        content = _base64.b64decode(encoded)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=404, detail="프로필 사진이 없습니다.") from exc
    etag = '"' + _hashlib.md5(content).hexdigest() + '"'
    cache_headers = {"Cache-Control": "no-cache", "ETag": etag}
    if request is not None and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cache_headers)
    return Response(content=content, media_type=media_type, headers=cache_headers)


@app.get("/api/community/users/{user_id}/profile", tags=["커뮤니티"], summary="사용자 프로필")
def get_user_profile(user_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().get_user_profile(user["id"], user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------- 커뮤니티 Phase 4: 댓글·신고·차단 -------------------


@app.post("/api/community/posts/{post_id}/comments", tags=["커뮤니티"], summary="댓글 작성")
def add_post_comment(post_id: int, req: CommentCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "comment_create", limit=30, window_seconds=300)
    try:
        return CommunityRepository().add_comment(post_id, user["id"], req.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/posts/{post_id}/comments", tags=["커뮤니티"], summary="댓글 목록")
def list_post_comments(post_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"comments": CommunityRepository().list_comments(post_id, user["id"])}


@app.delete("/api/community/comments/{comment_id}", tags=["커뮤니티"], summary="댓글 삭제")
def delete_post_comment(comment_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().delete_comment(comment_id, user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/community/reports", tags=["커뮤니티"], summary="게시물/댓글/사용자 신고")
def create_community_report(req: ReportCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "report_create", limit=10, window_seconds=3600)
    try:
        return CommunityRepository().create_report(user["id"], req.target_type, req.target_id, req.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/community/blocks", tags=["커뮤니티"], summary="사용자 차단")
def block_community_user(body: dict, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().block_user(user["id"], int(body.get("user_id", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/community/blocks/{blocked_id}", tags=["커뮤니티"], summary="차단 해제")
def unblock_community_user(blocked_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().unblock_user(user["id"], blocked_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/blocks", tags=["커뮤니티"], summary="차단한 사용자 목록")
def list_blocked_community_users(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"blocked": CommunityRepository().list_blocked_users(user["id"])}


# ------------------- 알림 (좋아요·댓글·메시지·친구) -------------------


@app.get("/api/community/notifications", tags=["커뮤니티"], summary="알림 목록")
def list_notifications(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    repository = CommunityRepository()
    return {
        "notifications": repository.list_notifications(user["id"]),
        "unread_count": repository.unread_notification_count(user["id"]),
    }


@app.get("/api/community/notifications/unread", tags=["커뮤니티"], summary="안 읽은 알림 개수")
def get_unread_notification_count(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"count": CommunityRepository().unread_notification_count(user["id"])}


@app.post("/api/community/notifications/read", tags=["커뮤니티"], summary="알림 모두 읽음 처리")
def mark_notifications_read(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().mark_notifications_read(user["id"])


# ------------------- 푸시 알림 구독 (FCM / 웹푸시) -------------------


@app.get("/api/push/vapid-public-key", tags=["푸시"], summary="웹푸시 VAPID 공개키")
def get_vapid_public_key():
    """PWA가 pushManager.subscribe()에 넣을 공개키. 미설정이면 빈 값(웹푸시 비활성)."""
    return {"public_key": settings.vapid_public_key}


@app.post("/api/push/subscribe", tags=["푸시"], summary="푸시 구독 등록")
def subscribe_push(req: PushSubscribeRequest, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    # 채널별로 endpoint 칸에 들어갈 값을 정한다(fcm=디바이스 토큰, webpush=endpoint URL).
    if req.channel == "fcm":
        endpoint = (req.token or "").strip()
        p256dh = auth_key = None
    else:
        endpoint = (req.endpoint or "").strip()
        p256dh = (req.p256dh or "").strip() or None
        auth_key = (req.auth or "").strip() or None
    if not endpoint:
        raise HTTPException(status_code=400, detail="구독 정보가 비어 있어요.")
    return CommunityRepository().add_push_subscription(
        user["id"], req.channel, endpoint, p256dh, auth_key, req.platform or ""
    )


@app.post("/api/push/unsubscribe", tags=["푸시"], summary="푸시 구독 해제")
def unsubscribe_push(req: PushUnsubscribeRequest, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    endpoint = (req.endpoint or req.token or "").strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail="해제할 구독 정보가 없어요.")
    return CommunityRepository().remove_push_subscription(user["id"], endpoint)


# ------------------- 커뮤니티 Phase 3: DM (친구끼리 채팅) -------------------


# 입력 중 표시용 신호. 단일 프로세스라 인메모리로 충분하다. {(입력자, 상대): 마지막 신호 시각}
_TYPING_SIGNALS = {}


@app.post("/api/community/chats/{friend_id}/messages", tags=["커뮤니티"], summary="채팅 메시지 보내기")
def send_chat_message(friend_id: int, req: ChatMessageCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "chat_send", limit=60, window_seconds=300)
    repository = CommunityRepository()
    try:
        image_filenames = repository.save_images(req.images) if req.images else []
        message = repository.send_chat_message(
            user["id"], friend_id, req.content, req.course, image_filenames, reply_to_id=req.reply_to_id
        )
        # 메시지를 보냈으면 입력 중 상태는 끝난 것으로 본다.
        _TYPING_SIGNALS.pop((user["id"], friend_id), None)
        return message
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/chats/{friend_id}/messages", tags=["커뮤니티"], summary="채팅 메시지 조회(증분)")
def list_chat_messages(
    friend_id: int,
    after_id: int = Query(0, ge=0),
    authorization: str | None = Header(None),
):
    user = _require_user(authorization)
    try:
        result = CommunityRepository().list_chat_messages(user["id"], friend_id, after_id=after_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    # 상대가 4초 안에 입력 신호를 보냈으면 "입력 중"으로 본다(3초 폴링에 맞춘 여유).
    peer_typing = _time.time() - _TYPING_SIGNALS.get((friend_id, user["id"]), 0) < 4
    return {**result, "peer_typing": peer_typing}


@app.post("/api/community/chats/{friend_id}/typing", tags=["커뮤니티"], summary="입력 중 신호")
def signal_chat_typing(friend_id: int, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    _TYPING_SIGNALS[(user["id"], friend_id)] = _time.time()
    if len(_TYPING_SIGNALS) > 10000:
        _TYPING_SIGNALS.clear()
    return {"ok": True}


@app.get("/api/community/chats/unread", tags=["커뮤니티"], summary="안읽은 메시지 개수")
def get_chat_unread(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().chat_unread_summary(user["id"])


# ------------------- 단체 채팅방 -------------------


@app.get("/api/community/chats", tags=["커뮤니티"], summary="채팅 통합 목록(1:1+단체방)")
def list_chats(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return {"chats": CommunityRepository().list_chats(user["id"])}


@app.get("/api/community/chats/total-unread", tags=["커뮤니티"], summary="채팅 전체 안읽음(탭 배지)")
def get_total_chat_unread(authorization: str | None = Header(None)):
    user = _require_user(authorization)
    return CommunityRepository().total_chat_unread(user["id"])


@app.post("/api/community/chat-rooms", tags=["커뮤니티"], summary="단체 채팅방 만들기")
def create_chat_room(req: ChatRoomCreate, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().create_chat_room(user["id"], req.member_ids, req.name or "")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/community/chat-rooms/{room_id}", tags=["커뮤니티"], summary="단체 채팅방 이름 변경")
def rename_chat_room(room_id: int, req: ChatRoomRenameRequest, authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().rename_chat_room(user["id"], room_id, req.name or "")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@app.post("/api/community/chat-rooms/{room_id}/messages", tags=["커뮤니티"], summary="단체방 메시지 보내기")
def send_room_message(room_id: int, req: ChatMessageCreate, authorization: str | None = Header(None), request: Request = None):
    user = _require_user(authorization)
    if request is not None:
        _enforce_rate_limit(request, "chat_send", limit=60, window_seconds=300)
    repository = CommunityRepository()
    try:
        image_filenames = repository.save_images(req.images) if req.images else []
        return repository.send_room_message(
            user["id"], room_id, req.content, req.course, image_filenames, reply_to_id=req.reply_to_id
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/community/chat-rooms/{room_id}/messages", tags=["커뮤니티"], summary="단체방 메시지 조회(증분)")
def list_room_messages(room_id: int, after_id: int = Query(0, ge=0), authorization: str | None = Header(None)):
    user = _require_user(authorization)
    try:
        return CommunityRepository().list_room_messages(user["id"], room_id, after_id=after_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

