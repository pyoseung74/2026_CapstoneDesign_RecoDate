# ============================================================
# 이 파일은 RecoDate MVP 백엔드 설정을 관리한다.
# 프로젝트 루트의 .env 파일에서 외부 API 키를 읽고,
# 추천 API에서 사용할 기본 반경과 추천 개수 제한값을 제공한다.
# ============================================================

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ENV_PATH = PROJECT_ROOT / ".env"
ENV_PATHS = (PROJECT_ROOT / ".env", BACKEND_DIR / ".env")


def load_env_file():
    for env_path in ENV_PATHS:
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip().lstrip("\ufeff"), value.strip())


load_env_file()


class Settings:
    tmap_app_key = os.getenv("TMAP_APP_KEY", "")
    # 브라우저 지도 SDK 전용 키(노출 전제). 서버용 키(tmap_app_key)에 IP 제한을 걸기 위해 분리.
    # 미설정 시 기존 키로 폴백되어 동작 변화 없음.
    tmap_sdk_app_key = os.getenv("TMAP_SDK_APP_KEY", "") or tmap_app_key
    tago_service_key = os.getenv("TAGO_SERVICE_KEY", "")
    business_store_service_key = os.getenv("BUSINESS_STORE_SERVICE_KEY", "") or tago_service_key
    tour_photo_service_key = os.getenv("TOUR_PHOTO_SERVICE_KEY", "") or tago_service_key
    tour_content_service_key = os.getenv("TOUR_CONTENT_SERVICE_KEY", "") or tago_service_key
    # 기상청 단기/중기예보 키 — 공공데이터포털 계정 공용키라 별도 설정이 없으면 TAGO 키를 재사용한다.
    kma_service_key = os.getenv("KMA_SERVICE_KEY", "") or tago_service_key
    google_places_api_key = os.getenv("GOOGLE_PLACES_API_KEY", "")
    odsay_api_key = os.getenv("ODSAY_API_KEY", "")
    odsay_referer = os.getenv("ODSAY_REFERER", "http://localhost:5174")
    stcis_api_key = os.getenv("STCIS_API_KEY", "")
    naver_local_client_id = os.getenv("NAVER_LOCAL_CLIENT_ID", "")
    naver_local_client_secret = os.getenv("NAVER_LOCAL_CLIENT_SECRET", "")
    kakao_rest_api_key = os.getenv("KAKAO_REST_API_KEY", "")
    kakao_client_secret = os.getenv("KAKAO_CLIENT_SECRET", "")
    kakao_redirect_uri = os.getenv("KAKAO_REDIRECT_URI", "https://recodate.com/api/auth/kakao/callback")
    # ----- 푸시 알림 -----
    # 웹푸시(VAPID): 키쌍이 있어야 PWA 푸시가 동작한다. 없으면 웹푸시 비활성(인앱 알림만).
    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY", "")
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:parkdarren123@gmail.com")
    # FCM(네이티브): 서비스 계정 JSON 파일 경로. 없으면 FCM 비활성.
    fcm_service_account_path = os.getenv("FCM_SERVICE_ACCOUNT_PATH", "")
    fcm_project_id = os.getenv("FCM_PROJECT_ID", "")
    cors_allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,http://10.0.2.2:8010,https://recodate.com,capacitor://localhost,https://localhost",
        ).split(",")
        if origin.strip()
    ]
    cors_allowed_origin_regex = os.getenv(
        "CORS_ALLOWED_ORIGIN_REGEX",
        r"https://.*\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.app)",
    )
    tago_city_code = "32030"
    tago_station_endpoint = "https://apis.data.go.kr/1613000/BusSttnInfoInqireService"
    tago_route_endpoint = "https://apis.data.go.kr/1613000/BusRouteInfoInqireService"
    tago_arrival_endpoint = "https://apis.data.go.kr/1613000/ArvlInfoInqireService"
    max_course_count = 5
    quick_course_count = 3
    default_walk_radius_km = 2
    default_transit_radius_km = 5
    default_car_radius_km = 5
    max_walk_radius_km = 3
    max_transit_radius_km = 12
    max_car_radius_km = 20
    transit_walk_threshold_m = 500
    transit_bus_stop_walk_limit_m = 700
    gangneung_bus_card_fare_won = 1530
    car_operating_cost_won_per_km = 170
    taxi_leg_recommendation_limit_won = 6000
    taxi_round_trip_recommendation_limit_won = 11000


settings = Settings()
