# ============================================================
# 이 파일은 RecoDate MVP 추천 코스를 생성하는 서비스이다.
# 시작 장소, 이동수단, 음식 종류, 반경, 추천 개수를 입력받아
# 추천 단계에서는 TMAP 주변 POI만 호출하고, 좌표 기반 예상 거리/시간으로 추천 코스 목록을 만든다.
# 실제 TMAP 길찾기 API는 사용자가 코스를 선택한 뒤 calculate_selected_route에서만 호출한다.
# ============================================================

import html
import itertools
import json
import math
import random
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import settings
from app.services.bus_repository import BusRepository
from app.services.business_place_repository import BusinessPlaceRepository
from app.services.google_places_client import GooglePlacesClient
from app.services.naver_local_client import NaverLocalClient
from app.services.odsay_client import OdsayClient
from app.services.offline_place_catalog import search_offline_keyword, search_offline_places
from app.services.osm_place_repository import OsmPlaceRepository
from app.services.price_repository import PriceRepository
from app.services.tmap_client import TmapClient, extract_pois, summarize_route_features
from app.services.tour_photo_client import TourPhotoClient
from app.services.tour_place_repository import TourPlaceRepository
from app.services.weather_client import WeatherClient


BROWSE_CACHE_TTL_SECONDS = 3600
_BROWSE_PLACE_CACHE = {}
_ADMIN_REGION_INDEX = None
_FRANCHISE_BRAND_NAMES = None
BUSINESS_PRIMARY_CATEGORIES = {"음식점", "카페", "술집", "숙박", "숙소", "쇼핑", "기타"}
BUSINESS_SECONDARY_CATEGORIES = {"액티비티", "엑티비티", "실내 액티비티", "야외 액티비티", "공연/관람", "문화/전시"}

# 공정위 목록의 표기와 지도 상호가 다른 브랜드(영문 표기) 및
# 직영 위주라 공정위에 등록되지 않는 대형 외식 체인 보완 목록.
EXTRA_FRANCHISE_ALIASES = [
    "bhc",
    "bbq",
    "서브웨이",
    "아웃백",
    "빕스",
    "애슐리",
    "쉐이크쉑",
    "파이브가이즈",
]


def load_franchise_brand_names():
    """공정위 가맹정보(브랜드별 가맹점 현황) 기반 외식 프랜차이즈 브랜드명 목록을 로드한다.

    backend/data/franchise_brands.json — 외식 업종 + 가맹점 10개 이상만 수록되어 있어
    직영으로만 확장한 맛집(가맹점 없음/소수)은 목록에 없다(사용자 합의: 그런 곳은 추천 유지).
    """
    global _FRANCHISE_BRAND_NAMES
    if _FRANCHISE_BRAND_NAMES is not None:
        return _FRANCHISE_BRAND_NAMES
    candidates = [
        Path("/opt/recodate/data/franchise_brands.json"),
        Path(__file__).resolve().parents[2] / "data" / "franchise_brands.json",
    ]
    names = []
    for path in candidates:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            names = [normalize_name(html.unescape(brand)) for brand in data.get("brands", []) if brand]
            break
        except (OSError, ValueError):
            continue
    names += [normalize_name(alias) for alias in EXTRA_FRANCHISE_ALIASES]
    _FRANCHISE_BRAND_NAMES = sorted({name for name in names if len(name) >= 2})
    return _FRANCHISE_BRAND_NAMES


COMMON_CAFE_NAME_KEYWORDS = [
    "\uc2a4\ud0c0\ubc85\uc2a4",
    "\ud22c\uc378\ud50c\ub808\uc774\uc2a4",
    "\uc774\ub514\uc57c",
    "\uba54\uac00MGC\ucee4\ud53c",
    "\uba54\uac00\ucee4\ud53c",
    "\ucef4\ud3ec\uc988\ucee4\ud53c",
    "\ube7d\ub2e4\ubc29",
    "\ub354\ubca4\ud2f0",
    "\ud560\ub9ac\uc2a4",
    "\uc5d4\uc81c\ub9ac\ub108\uc2a4",
    "\ud30c\uc2a4\ucfe0\ucc0c",
    "\ucee4\ud53c\ube48",
    "\ud3f4\ubc14\uc14b",
    "\ud0d0\uc564\ud0d0\uc2a4",
    "\ud504\ub77c\uc774\ub370\uc774",
]
MIN_RECOMMENDATION_SCORE = 65
GANGNEUNG_PROTOTYPE_BOUNDS = {
    "min_lat": 37.54,
    "max_lat": 37.96,
    "min_lon": 128.68,
    "max_lon": 129.12,
}

REGION_KEYWORDS = [
    "서울",
    "부산",
    "대구",
    "인천",
    "광주",
    "대전",
    "울산",
    "세종",
    "경기",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "제주",
    "강릉",
]
NATIONAL_FEATURED_PLACES = [
    ("N서울타워", "관광지", "전망대", "서울특별시 용산구 남산공원길 105", 37.5512, 126.9882),
    ("경복궁", "관광지", "성/궁궐", "서울특별시 종로구 사직로 161", 37.5796, 126.9770),
    ("광장시장", "관광지", "시장", "서울특별시 종로구 창경궁로 88", 37.5700, 126.9995),
    ("제주동문시장", "관광지", "시장", "제주특별자치도 제주시 관덕로14길 20", 33.5116, 126.5261),
    ("감천문화마을", "관광지", "관광명소", "부산광역시 사하구 감내2로 203", 35.0975, 129.0106),
    ("해운대해수욕장", "관광지", "해수욕장", "부산광역시 해운대구 해운대해변로 264", 35.1587, 129.1604),
    ("전주한옥마을", "관광지", "관광명소", "전북특별자치도 전주시 완산구 기린대로 99", 35.8149, 127.1532),
    ("불국사", "관광지", "종교시설", "경상북도 경주시 불국로 385", 35.7900, 129.3320),
    ("성산일출봉", "관광지", "자연명소", "제주특별자치도 서귀포시 성산읍 일출로 284-12", 33.4589, 126.9408),
    ("롯데월드", "액티비티", "테마파크", "서울특별시 송파구 올림픽로 240", 37.5109, 127.0982),
    ("에버랜드", "액티비티", "테마파크", "경기도 용인시 처인구 포곡읍 에버랜드로 199", 37.2939, 127.2048),
    ("캐리비안 베이", "액티비티", "워터파크", "경기도 용인시 처인구 포곡읍 에버랜드로 199", 37.2974, 127.2007),
    ("북촌한옥마을", "관광지", "관광명소", "서울특별시 종로구 계동길 37", 37.5826, 126.9830),
    ("창덕궁", "관광지", "성/궁궐", "서울특별시 종로구 율곡로 99", 37.5821, 126.9912),
    ("광안리해수욕장", "관광지", "해수욕장", "부산광역시 수영구 광안해변로 219", 35.1532, 129.1187),
    ("오죽헌", "관광지", "관광명소", "강원특별자치도 강릉시 율곡로3139번길 24", 37.7789, 128.8780),
    ("안목해변", "관광지", "해수욕장", "강원특별자치도 강릉시 창해로 14", 37.7728, 128.9477),
    ("국립중앙박물관", "공연/관람", "박물관", "서울특별시 용산구 서빙고로 137", 37.5239, 126.9804),
    ("서울숲", "관광지", "공원", "서울특별시 성동구 뚝섬로 273", 37.5444, 127.0374),
    ("한밭수목원", "관광지", "수목원", "대전광역시 서구 둔산대로 169", 36.3660, 127.3881),
]
SUBWAY_REGION_KEYWORDS = {"서울", "경기", "인천", "부산", "대구", "광주", "대전"}
TAXI_FARE_PROFILES = {
    "서울": {"base_won": 4800, "base_m": 1600, "unit_m": 131, "unit_won": 100, "label": "서울 중형택시 주간"},
    "경기": {"base_won": 4800, "base_m": 1600, "unit_m": 131, "unit_won": 100, "label": "경기 중형택시 주간"},
    "인천": {"base_won": 4800, "base_m": 1600, "unit_m": 135, "unit_won": 100, "label": "인천 중형택시 주간"},
    "부산": {"base_won": 4800, "base_m": 2000, "unit_m": 132, "unit_won": 100, "label": "부산 중형택시 주간"},
    "대구": {"base_won": 4000, "base_m": 2000, "unit_m": 130, "unit_won": 100, "label": "대구 중형택시 주간"},
    "대전": {"base_won": 4300, "base_m": 2000, "unit_m": 132, "unit_won": 100, "label": "대전 중형택시 주간"},
    "광주": {"base_won": 4300, "base_m": 2000, "unit_m": 133, "unit_won": 100, "label": "광주 중형택시 주간"},
    "울산": {"base_won": 4000, "base_m": 2000, "unit_m": 125, "unit_won": 100, "label": "울산 중형택시 주간"},
    "세종": {"base_won": 4300, "base_m": 2000, "unit_m": 132, "unit_won": 100, "label": "세종 중형택시 주간"},
    "강원": {"base_won": 4600, "base_m": 2000, "unit_m": 131, "unit_won": 100, "label": "강원 중형택시 주간"},
    "강릉": {"base_won": 4600, "base_m": 2000, "unit_m": 131, "unit_won": 100, "label": "강릉 중형택시 주간"},
    "충북": {"base_won": 4300, "base_m": 2000, "unit_m": 137, "unit_won": 100, "label": "충북 중형택시 주간"},
    "충남": {"base_won": 4300, "base_m": 2000, "unit_m": 131, "unit_won": 100, "label": "충남 중형택시 주간"},
    "전북": {"base_won": 4300, "base_m": 2000, "unit_m": 134, "unit_won": 100, "label": "전북 중형택시 주간"},
    "전남": {"base_won": 4300, "base_m": 2000, "unit_m": 130, "unit_won": 100, "label": "전남 중형택시 주간"},
    "경북": {"base_won": 4000, "base_m": 2000, "unit_m": 131, "unit_won": 100, "label": "경북 중형택시 주간"},
    "경남": {"base_won": 4300, "base_m": 2000, "unit_m": 130, "unit_won": 100, "label": "경남 중형택시 주간"},
    "제주": {"base_won": 4500, "base_m": 2000, "unit_m": 126, "unit_won": 100, "label": "제주 중형택시 주간"},
}
DEFAULT_TAXI_FARE_PROFILE = TAXI_FARE_PROFILES["서울"]
TRANSIT_CARD_FARES = {
    "서울": 1550,
    "경기": 1550,
    "인천": 1550,
    "부산": 1600,
    "대구": 1500,
    "대전": 1500,
    "광주": 1500,
    "울산": 1500,
    "강릉": settings.gangneung_bus_card_fare_won,
}
DEFAULT_TRANSIT_CARD_FARE_WON = 1500

PLAY_CATEGORY_NAMES = {
    "액티비티",
    "엑티비티",
    "야외 액티비티",
    "실내 액티비티",
    "공연/관람",
    "문화/전시",
    "관광 액티비티",
    "해변 액티비티",
}
PLAY_TMAP_CATEGORIES = [
    "놀이공원",
    "테마파크",
    "스포츠",
    "산책로",
    "관광지",
    "동물원",
    "체험",
    "보드카페",
    "오락실",
    "영화관",
    "볼링장",
    "방탈출",
    "박물관",
    "전시장",
    "공연장",
    "미술관",
]

BROWSE_CATEGORY_ALIASES = {
    "all": "전체",
    "total": "전체",
    "food": "음식점",
    "restaurant": "음식점",
    "restaurants": "음식점",
    "meal": "음식점",
    "cafe": "카페",
    "coffee": "카페",
    "play": "액티비티",
    "indoor": "액티비티",
    "indoor_activity": "액티비티",
    "outdoor": "액티비티",
    "outdoor_activity": "액티비티",
    "activity": "액티비티",
    "culture": "공연/관람",
    "exhibition": "공연/관람",
    "performance": "공연/관람",
    "show": "공연/관람",
    "finish": "관광지",
    "walk": "관광지",
    "healing": "관광지",
    "bar": "술집",
    "pub": "술집",
    "drink": "술집",
    "stay": "숙박",
    "accommodation": "숙박",
    "hotel": "숙박",
    "shopping": "쇼핑",
    "shop": "쇼핑",
    "store": "쇼핑",
    "other": "기타",
    "etc": "기타",
    "놀거리": "액티비티",
    "엑티비티": "액티비티",
    "공연/관람": "공연/관람",
    "문화/전시": "공연/관람",
    "관광": "관광지",
    "숙소": "숙박",
}


EXCLUDE_NAME_KEYWORDS = ["주차장", "정문", "입구", "교차로", "오피스텔", "버스정류장"]
FOOD_CATEGORY_ALIASES = {
    "음식": ["한식", "중식", "일식", "양식", "패스트푸드", "전문음식점", "음식점"],
    "한식": ["한식"],
    "중식": ["중식"],
    "일식": ["일식"],
    "양식": ["양식", "스테이크"],
    "패스트푸드": ["패스트푸드", "치킨", "피자"],
    "기타": ["전문음식점", "쌀국수", "베트남음식", "인도음식", "태국음식", "분식", "음식점"],
}
REPLACEMENT_GOOGLE_TYPES = {
    "음식점": ["restaurant"],
    "카페": ["cafe"],
    "술집": ["bar", "pub"],
    "숙박": ["lodging"],
    "숙소": ["lodging"],
    "쇼핑": ["shopping_mall", "department_store", "store"],
    "기타": ["point_of_interest"],
    "액티비티": ["tourist_attraction", "amusement_park", "bowling_alley", "movie_theater", "aquarium"],
    "야외 액티비티": ["tourist_attraction", "amusement_park", "park"],
    "실내 액티비티": ["bowling_alley", "movie_theater", "aquarium"],
    "공연/관람": ["museum", "art_gallery", "performing_arts_theater"],
    "문화/전시": ["museum", "art_gallery"],
    "마무리/산책": ["park", "tourist_attraction"],
}

ESTIMATED_BUDGET_WON_BY_CATEGORY = {
    "음식점": 12000,
    "카페": 6000,
    "야외 액티비티": 0,
    "해변 액티비티": 0,
    "실내 액티비티": 14000,
    "문화/전시": 3000,
    "공연/관람": 3000,
    "액티비티": 14000,
    "관광 액티비티": 0,
    "마무리/산책": 0,
    "술집": 18000,
    "숙박": 0,
    "쇼핑": 0,
    "기타": 0,
}


def normalize_name(name):
    return (name or "").replace(" ", "").replace("[중식]", "").lower()


def haversine_m(lat1, lon1, lat2, lon2):
    radius = 6371000
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    d_phi = math.radians(float(lat2) - float(lat1))
    d_lambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


class RecommendationService:
    def __init__(self):
        self.tmap = TmapClient()
        self.prices = PriceRepository()
        self.buses = BusRepository()
        self.photos = TourPhotoClient()
        self.google = GooglePlacesClient()
        self.naver = NaverLocalClient()
        self.odsay = OdsayClient()
        self.tour_places = TourPlaceRepository()
        self.osm_places = OsmPlaceRepository()
        self.business_places = BusinessPlaceRepository()

    def search_start_places(self, keyword, count=10):
        data = {}
        try:
            data, _ = self.tmap.search_pois(keyword, count=count)
            pois = extract_pois(data)
        except Exception:
            pois = []
        places = []
        for poi in pois:
            places.append(
                {
                    "id": poi.get("id") or poi.get("pkey") or "",
                    "name": poi.get("name", ""),
                    "lat": float(poi.get("frontLat")),
                    "lon": float(poi.get("frontLon")),
                    "upperBizName": poi.get("upperBizName", ""),
                    "middleBizName": poi.get("middleBizName", ""),
                    "lowerBizName": poi.get("lowerBizName", ""),
                    "detailBizName": poi.get("detailBizName", ""),
                    "address": " ".join(
                        part
                        for part in [
                            poi.get("upperAddrName", ""),
                            poi.get("middleAddrName", ""),
                            poi.get("lowerAddrName", ""),
                            poi.get("detailAddrName", ""),
                        ]
                        if part
                    ),
                }
            )
        if len(places) < count:
            missing_count = count - len(places)
            places = self._dedupe_places(
                [
                    *places,
                    *self.business_places.search_keyword(keyword, missing_count),
                    *search_offline_keyword(keyword, missing_count),
                ]
            )
        normalized_keyword = normalize_name(keyword)
        has_exact_match = any(
            normalize_name(place.get("name", "")) == normalized_keyword
            for place in places
        )
        if not has_exact_match:
            try:
                google_places = self.google.search_text_places(keyword, count=count)
            except Exception:
                google_places = []
            places = self._dedupe_places([*google_places, *places])
        places.sort(
            key=lambda place: (
                0
                if normalize_name(place.get("name", "")) == normalized_keyword
                else 1
                if normalize_name(place.get("name", "")).startswith(normalized_keyword)
                else 2,
                -int(place.get("google_review_count") or 0),
                place.get("name", ""),
            )
        )
        return {
            "keyword": keyword,
            "total_count": data.get("searchPoiInfo", {}).get("totalCount") or len(places),
            "places": places[:count],
        }

    def map_browse_places(self, keyword, categories=None, radius_km=2.5, count=8, center_lat=None, center_lon=None):
        keyword = (keyword or "").strip()
        use_coords = center_lat is not None and center_lon is not None
        if not keyword and not use_coords:
            raise ValueError("검색어를 입력해 주세요.")

        category_defs = {
            "food": {
                "label": "음식점",
                "category": "음식점",
                "tmap": ["한식", "중식", "일식", "양식", "전문음식점", "음식점"],
                "google": ["restaurant"],
            },
            "cafe": {
                "label": "카페",
                "category": "카페",
                "tmap": ["카페"],
                "google": ["cafe"],
            },
            "activity": {
                "label": "액티비티",
                "category": "액티비티",
                "tmap": ["테마파크", "놀이공원", "스포츠", "체험", "동물원", "수족관"],
                "google": ["amusement_park", "aquarium", "zoo", "bowling_alley"],
            },
            "culture": {
                "label": "공연/관람",
                "category": "공연/관람",
                "tmap": ["박물관", "미술관", "전시관", "공연장", "문화센터"],
                "google": ["museum", "art_gallery", "performing_arts_theater"],
            },
            "tourist": {
                "label": "관광지",
                "category": "관광지",
                "tmap": ["관광지", "전망대", "명소", "공원", "산책로"],
                "google": ["tourist_attraction", "park"],
            },
            "bar": {
                "label": "술집",
                "category": "술집",
                "tmap": ["술집", "호프", "와인바", "칵테일바", "이자카야"],
                "google": ["bar"],
            },
            "stay": {
                "label": "숙박",
                "category": "숙박",
                "tmap": ["호텔", "모텔", "펜션", "게스트하우스", "숙박"],
                "google": ["lodging"],
            },
            "shopping": {
                "label": "쇼핑",
                "category": "쇼핑",
                "tmap": ["백화점", "아울렛", "쇼핑몰", "소품샵", "시장"],
                "google": ["shopping_mall", "department_store", "store"],
            },
            "other": {
                "label": "기타",
                "category": "기타",
                "tmap": ["편의시설", "서비스", "상점"],
                "google": ["point_of_interest"],
            },
        }
        requested = categories or list(category_defs.keys())
        selected_keys = [key for key in requested if key in category_defs]
        if not selected_keys:
            selected_keys = list(category_defs.keys())

        if use_coords:
            # 지도 이동 후 자동 갱신: 지오코딩 없이 지도 중심 좌표로 주변 장소를 찾는다.
            center = {
                "id": "map_area_center",
                "name": "이 지역",
                "lat": float(center_lat),
                "lon": float(center_lon),
                "map_category": "area",
                "map_category_label": "이 지역",
            }
        else:
            search_result = self.search_start_places(keyword, count=5)
            centers = search_result.get("places") or []
            if not centers:
                centers = self.google.search_text_places(keyword, count=5)
            if not centers:
                return {
                    "keyword": keyword,
                    "center": None,
                    "radius_km": radius_km,
                    "categories": [],
                    "places": [],
                }
            center = {**centers[0], "map_category": "center", "map_category_label": "검색 장소"}
        radius_km = max(0.5, min(float(radius_km or 2.5), 10.0))
        count = max(1, min(int(count or 8), 20))
        center_name = normalize_name(center.get("name", ""))

        def load_map_category(key):
            info = category_defs[key]
            use_business_places = (
                info["category"] in BUSINESS_PRIMARY_CATEGORIES
                or info["category"] in BUSINESS_SECONDARY_CATEGORIES
            )
            business_places = (
                self.business_places.search(
                    center,
                    info["category"],
                    radius_km,
                    limit=max(count * 3, 40),
                    strict_category=True,
                )
                if use_business_places
                else []
            )
            osm_places = self.osm_places.search(
                center,
                info["category"],
                radius_km,
                limit=max(count * 2, 30),
                strict_category=True,
            )
            base_places = (
                [*business_places, *osm_places]
                if info["category"] in BUSINESS_PRIMARY_CATEGORIES
                else [*osm_places, *business_places]
                if info["category"] in BUSINESS_SECONDARY_CATEGORIES
                else osm_places
            )
            google_places = []
            tmap_places = []
            candidates = self._dedupe_places([*base_places, *google_places, *tmap_places])
            candidates = self._filter_browse_category_places(info["category"], candidates)
            candidates = [
                place
                for place in candidates
                if normalize_name(place.get("name", "")) != center_name
                and haversine_m(center["lat"], center["lon"], place["lat"], place["lon"]) <= radius_km * 1000 + 50
            ]
            candidates = self._sort_places_by_distance(center, candidates)[:count]
            places = [
                {
                    **place,
                    "category": info["category"],
                    "map_category": key,
                    "map_category_label": info["label"],
                }
                for place in candidates
            ]
            return {"key": key, "label": info["label"], "places": places}, places

        grouped = []
        all_places = []
        with ThreadPoolExecutor(max_workers=min(len(selected_keys), 5)) as executor:
            category_results = executor.map(load_map_category, selected_keys)
            for group, places in category_results:
                grouped.append(group)
                all_places.extend(places)

        return {
            "keyword": keyword,
            "center": center,
            "radius_km": radius_km,
            "categories": grouped,
            "places": self._dedupe_places(all_places),
        }

    def search_replacement_places(self, lat, lon, category, source_category="", exclude_name="", count=5):
        category = self._normalize_browse_category(category)
        center = {"lat": lat, "lon": lon}
        tmap_categories = self._replacement_tmap_categories(category, source_category)
        places = self._search_places(center, category, tmap_categories, radius_km=5, count=max(count * 2, 8))
        places = self._prioritize_google_places(
            center,
            5,
            category,
            REPLACEMENT_GOOGLE_TYPES.get(category, ["tourist_attraction"]),
            places,
            limit=max(count * 2, 8),
        )
        nearby_places = self._sort_places_by_distance(center, places)[:count]
        if category == "\uce74\ud398":
            places = self._prioritize_local_cafes(places)
        if category == "\uc74c\uc2dd\uc810":
            places = self._interleave_places_by_source(places, tmap_categories)
        excluded = normalize_name(exclude_name)
        places = [place for place in places if normalize_name(place["name"]) != excluded][:count]
        nearby_places = [
            place for place in nearby_places if normalize_name(place["name"]) != excluded
        ][:count]
        return {
            "keyword": category,
            "total_count": len(places),
            "places": places,
            "nearby_places": nearby_places,
        }

    def browse_gangneung_places(
        self,
        category,
        count=12,
        region="all",
        offset=0,
        lat=None,
        lon=None,
        area_label="",
        region_key="",
    ):
        category = self._normalize_browse_category(category)
        region_filter = self._build_admin_region_filter(region_key or region, include_nearby=False)
        all_centers = [
            {"lat": 37.76516161, "lon": 128.90139644},
            {"lat": 37.77096744, "lon": 128.94989190},
            {"lat": 37.80515710, "lon": 128.90739466},
            {"lat": 37.892556, "lon": 128.829661},
            {"lat": 37.691140, "lon": 129.032575},
        ]
        region_centers = {
            "national": [
                {"lat": 37.5665, "lon": 126.9780},
                {"lat": 35.1796, "lon": 129.0756},
                {"lat": 35.8714, "lon": 128.6014},
                {"lat": 37.4563, "lon": 126.7052},
                {"lat": 35.1595, "lon": 126.8526},
                {"lat": 36.3504, "lon": 127.3845},
                {"lat": 35.5384, "lon": 129.3114},
                {"lat": 36.4800, "lon": 127.2890},
                {"lat": 37.4138, "lon": 127.5183},
                {"lat": 37.8228, "lon": 128.1555},
                {"lat": 36.6357, "lon": 127.4913},
                {"lat": 36.6588, "lon": 126.6728},
                {"lat": 35.8242, "lon": 127.1480},
                {"lat": 34.8161, "lon": 126.4629},
                {"lat": 35.8562, "lon": 129.2247},
                {"lat": 35.2383, "lon": 128.6924},
                {"lat": 33.4996, "lon": 126.5312},
            ],
            "seoul": [{"lat": 37.5665, "lon": 126.9780}],
            "busan": [{"lat": 35.1796, "lon": 129.0756}],
            "daejeon": [{"lat": 36.3504, "lon": 127.3845}],
            "jeonju": [{"lat": 35.8242, "lon": 127.1480}],
            "gyeongju": [{"lat": 35.8562, "lon": 129.2247}],
            "gyeongpo": [{"lat": 37.80515710, "lon": 128.90739466}],
            "jumunjin": [{"lat": 37.892556, "lon": 128.829661}],
            "anmok": [{"lat": 37.77096744, "lon": 128.94989190}],
            "downtown": [{"lat": 37.76516161, "lon": 128.90139644}],
            "jeongdongjin": [{"lat": 37.691140, "lon": 129.032575}],
        }
        region_labels = {
            "all": "",
            "national": "전국",
            "seoul": "서울",
            "busan": "부산",
            "daejeon": "대전",
            "jeonju": "전주",
            "gyeongju": "경주",
            "gyeongpo": "경포",
            "jumunjin": "주문진",
            "anmok": "안목 송정",
            "downtown": "교동 시내",
            "jeongdongjin": "정동진",
        }
        has_custom_center = lat is not None and lon is not None
        if has_custom_center:
            centers = [{"lat": float(lat), "lon": float(lon)}]
            region_label = (area_label or "").strip() or region_labels.get(region, "") or region
        else:
            centers = region_centers.get(region, all_centers)
            region_label = region_labels.get(region, "")
        google_centers = centers
        google_radius_km = 12 if has_custom_center else (12 if region == "national" else (10 if region == "all" else 3))
        if region == "all" and not has_custom_center:
            google_centers = [{"lat": 37.76516161, "lon": 128.90139644}]
            google_radius_km = 30
        category_map = {
            "\uc804\uccb4": ("\uad00\uad11\uc9c0", ["\ud55c\uc2dd", "\uc911\uc2dd", "\uc77c\uc2dd", "\uc804\ubb38\uc74c\uc2dd\uc810", "\uce74\ud398", "\ub180\uc774\uacf5\uc6d0", "\ud14c\ub9c8\ud30c\ud06c", "\ubc15\ubb3c\uad00", "\ubbf8\uc220\uad00", "\uacf5\uc6d0", "\ud574\uc218\uc695\uc7a5", "\uc220\uc9d1", "\uc1fc\ud551"]),
            "\uc74c\uc2dd\uc810": ("\uc74c\uc2dd\uc810", ["\ud55c\uc2dd", "\uc911\uc2dd", "\uc77c\uc2dd", "\uc591\uc2dd", "\ud328\uc2a4\ud2b8\ud478\ub4dc", "\uce58\ud0a8", "\ud53c\uc790", "\uc804\ubb38\uc74c\uc2dd\uc810", "\uc74c\uc2dd\uc810"]),
            "\uce74\ud398": ("\uce74\ud398", ["\uce74\ud398"]),
            "\uc561\ud2f0\ube44\ud2f0": ("\uc561\ud2f0\ube44\ud2f0", ["\ub180\uc774\uacf5\uc6d0", "\ud14c\ub9c8\ud30c\ud06c", "\uc2a4\ud3ec\uce20", "\uc0b0\ucc45\ub85c", "\uad00\uad11\uc9c0", "\ub3d9\ubb3c\uc6d0", "\ud574\uc218\uc695\uc7a5", "\ubcf4\ub4dc\uce74\ud398", "\uc624\ub77d\uc2e4", "\ubc29\ud0c8\ucd9c", "\uc601\ud654\uad00", "\ubcfc\ub9c1\uc7a5", "\uccb4\ud5d8"]),
            "\uc5d1\ud2f0\ube44\ud2f0": ("\uc561\ud2f0\ube44\ud2f0", ["\ub180\uc774\uacf5\uc6d0", "\ud14c\ub9c8\ud30c\ud06c", "\uc2a4\ud3ec\uce20", "\uccb4\ud5d8"]),
            "\uc57c\uc678 \uc561\ud2f0\ube44\ud2f0": ("\uc561\ud2f0\ube44\ud2f0", ["\ub180\uc774\uacf5\uc6d0", "\ud14c\ub9c8\ud30c\ud06c", "\uc2a4\ud3ec\uce20", "\uc0b0\ucc45\ub85c", "\uad00\uad11\uc9c0", "\ub3d9\ubb3c\uc6d0", "\ud574\uc218\uc695\uc7a5"]),
            "\uc2e4\ub0b4 \uc561\ud2f0\ube44\ud2f0": ("\uc561\ud2f0\ube44\ud2f0", ["\ubcf4\ub4dc\uce74\ud398", "\uc624\ub77d\uc2e4", "\ubc29\ud0c8\ucd9c", "\uc601\ud654\uad00", "\ubcfc\ub9c1\uc7a5", "\uccb4\ud5d8"]),
            "\uacf5\uc5f0/\uad00\ub78c": ("\uacf5\uc5f0/\uad00\ub78c", ["\ubc15\ubb3c\uad00", "\uc804\uc2dc\uad00", "\uacf5\uc5f0\uc7a5", "\ubbf8\uc220\uad00", "\uae30\ub150\uad00", "\ubb38\ud654\uc13c\ud130", "\uc601\ud654\uad00"]),
            "\ubb38\ud654/\uc804\uc2dc": ("\uacf5\uc5f0/\uad00\ub78c", ["\ubc15\ubb3c\uad00", "\uc804\uc2dc\uad00", "\uacf5\uc5f0\uc7a5", "\ubbf8\uc220\uad00", "\uae30\ub150\uad00", "\ubb38\ud654\uc13c\ud130"]),
            "\uad00\uad11\uc9c0": ("\uad00\uad11\uc9c0", ["\uac70\ub9ac", "\uacf5\uc6d0", "\ud574\uc218\uc695\uc7a5", "\uc0b0\ucc45\ub85c", "\uc804\ub9dd\ub300", "\uad00\uad11\uc9c0", "\uba85\uc18c"]),
            "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45": ("\uad00\uad11\uc9c0", ["\uac70\ub9ac", "\uacf5\uc6d0", "\ud574\uc218\uc695\uc7a5", "\uc0b0\ucc45\ub85c", "\uc804\ub9dd\ub300"]),
            "\uc220\uc9d1": ("\uc220\uc9d1", ["\uc220\uc9d1", "\ud638\ud504", "\uc640\uc778\ubc14", "\uce75\ud14c\uc77c\ubc14", "\uc774\uc790\uce74\uc57c"]),
            "\uc219\ubc15": ("\uc219\ubc15", ["\ud638\ud154", "\ubaa8\ud154", "\ud39c\uc158", "\uac8c\uc2a4\ud2b8\ud558\uc6b0\uc2a4", "\uc219\ubc15"]),
            "\uc219\uc18c": ("\uc219\ubc15", ["\ud638\ud154", "\ubaa8\ud154", "\ud39c\uc158", "\uac8c\uc2a4\ud2b8\ud558\uc6b0\uc2a4", "\uc219\ubc15"]),
            "\uc1fc\ud551": ("\uc1fc\ud551", ["\ubc31\ud654\uc810", "\uc544\uc6b8\ub81b", "\uc1fc\ud551\ubab0", "\uc18c\ud488\uc0f5", "\uc2dc\uc7a5", "\uc0c1\uc810"]),
            "\uae30\ud0c0": ("\uae30\ud0c0", ["\ud3b8\uc758\uc2dc\uc124", "\uc11c\ube44\uc2a4", "\uc0c1\uc810"]),
        }
        google_type_map = {
            "\uc804\uccb4": [
                "restaurant",
                "cafe",
                "tourist_attraction",
                "museum",
                "art_gallery",
                "park",
                "bar",
                "movie_theater",
                "bowling_alley",
                "shopping_mall",
            ],
            "\uc74c\uc2dd\uc810": ["restaurant"],
            "\uce74\ud398": ["cafe"],
            "\uc561\ud2f0\ube44\ud2f0": ["tourist_attraction", "amusement_park", "bowling_alley", "movie_theater", "aquarium"],
            "\uc5d1\ud2f0\ube44\ud2f0": ["tourist_attraction", "amusement_park"],
            "\uc57c\uc678 \uc561\ud2f0\ube44\ud2f0": ["tourist_attraction", "amusement_park", "park"],
            "\uc2e4\ub0b4 \uc561\ud2f0\ube44\ud2f0": ["bowling_alley", "movie_theater", "aquarium"],
            "\uacf5\uc5f0/\uad00\ub78c": ["museum", "art_gallery", "performing_arts_theater"],
            "\ubb38\ud654/\uc804\uc2dc": ["museum", "art_gallery"],
            "\uad00\uad11\uc9c0": ["park", "tourist_attraction"],
            "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45": ["park", "tourist_attraction"],
            "\uc220\uc9d1": ["bar", "pub"],
            "\uc219\ubc15": ["lodging"],
            "\uc219\uc18c": ["lodging"],
            "\uc1fc\ud551": ["shopping_mall", "department_store", "store"],
            "\uae30\ud0c0": ["point_of_interest"],
        }
        recodate_category, tmap_categories = category_map.get(category, category_map["\ub9c8\ubb34\ub9ac/\uc0b0\ucc45"])
        place_database_version = (
            self.tour_places.database_path.stat().st_mtime_ns
            if self.tour_places.database_path.exists()
            else 0
        )
        cache_key = (
            "browse_osm_google_tmap_tour_db_v3",
            category,
            region,
            round(float(lat), 5) if lat is not None else None,
            round(float(lon), 5) if lon is not None else None,
            region_label,
            region_key or "",
            place_database_version,
        )
        cached = _BROWSE_PLACE_CACHE.get(cache_key)
        now = time.time()
        if cached and now - cached["fetched_at"] < BROWSE_CACHE_TTL_SECONDS:
            places = cached["places"]
            page_places = places[offset : offset + count]
            return {
                "category": category,
                "region": region,
                "offset": offset,
                "count": count,
                "next_offset": offset + len(page_places),
                "has_more": offset + len(page_places) < len(places),
                "places": page_places,
            }
        browse_radius_km = 12 if has_custom_center else (12 if region == "national" else (10 if region == "all" else 3))
        requested_end = max(int(offset) + int(count), int(count))
        search_count = max(int(count) * 2, requested_end + int(count), 24)
        search_count = max(1, min(search_count, 60))
        google_types = google_type_map.get(category, ["tourist_attraction"])

        business_places = []
        osm_places = []
        use_business_places = (
            recodate_category in BUSINESS_PRIMARY_CATEGORIES
            or recodate_category in BUSINESS_SECONDARY_CATEGORIES
        )
        for center in centers:
            if use_business_places:
                business_places.extend(
                    self.business_places.search(
                        center,
                        recodate_category,
                        browse_radius_km,
                        limit=search_count,
                        strict_category=True,
                    )
                )
            osm_places.extend(
                self.osm_places.search(
                    center,
                    recodate_category,
                    browse_radius_km,
                    limit=search_count,
                    strict_category=True,
                )
            )
        base_places = (
            [*business_places, *osm_places]
            if recodate_category in BUSINESS_PRIMARY_CATEGORIES
            else [*osm_places, *business_places]
            if recodate_category in BUSINESS_SECONDARY_CATEGORIES
            else osm_places
        )
        places = self._filter_browse_category_places(category, self._dedupe_places(base_places))

        def search_google(center):
            if len(google_types) <= 1:
                return self.google.search_nearby(
                    center,
                    radius_km=google_radius_km,
                    category=recodate_category,
                    included_types=google_types,
                    count=min(search_count, 20),
                )

            def search_google_type(google_type):
                return self.google.search_nearby(
                    center,
                    radius_km=google_radius_km,
                    category=recodate_category,
                    included_types=[google_type],
                    count=20,
                )

            type_results = []
            with ThreadPoolExecutor(max_workers=min(len(google_types), 6)) as type_executor:
                for type_result in type_executor.map(search_google_type, google_types):
                    type_results.extend(type_result)
            return type_results

        google_places = []
        if len(places) < requested_end:
            with ThreadPoolExecutor(max_workers=min(len(google_centers), 5)) as executor:
                for result in executor.map(search_google, google_centers):
                    google_places.extend(result)
            places = self._filter_browse_category_places(
                category,
                self._sort_browse_places_by_google_reviews(google_places, places),
            )
        if len(places) < requested_end:
            offline_places = []
            for center in centers:
                offline_places.extend(
                    search_offline_places(
                        center,
                        recodate_category,
                        tmap_categories,
                        browse_radius_km,
                        search_count,
                        strict_category=True,
                    )
                )
            places = self._filter_browse_category_places(
                category,
                self._sort_browse_places_by_google_reviews(google_places, offline_places),
            )

        tmap_places = []
        tmap_jobs = []
        if len(places) < requested_end:
            tmap_page_range = range(1, 2) if region == "national" and not has_custom_center else range(1, 4)
            tmap_jobs = [
                (center, tmap_category, page)
                for center in centers
                for tmap_category in tmap_categories
                for page in tmap_page_range
            ]

        def search_tmap_page(job):
            center, tmap_category, page = job
            try:
                data, _ = self.tmap.search_around(
                    center,
                    tmap_category,
                    browse_radius_km,
                    count=20,
                    page=page,
                )
            except Exception:
                return []
            result = []
            place_category = recodate_category if category != "전체" else self._browse_role_for_source_category(tmap_category)
            for poi in extract_pois(data):
                try:
                    place = self._poi_to_place(poi, place_category, tmap_category)
                except (TypeError, ValueError):
                    continue
                if self._is_valid_place(place):
                    result.append(place)
            return result

        if tmap_jobs:
            with ThreadPoolExecutor(max_workers=min(len(tmap_jobs), 16)) as executor:
                for result in executor.map(search_tmap_page, tmap_jobs):
                    tmap_places.extend(result)

        tour_places = self.tour_places.search(
            centers,
            category,
            browse_radius_km,
            limit=3000,
        )
        places = self._filter_browse_category_places(
            category,
            self._sort_browse_places_by_google_reviews(places, [*tour_places, *tmap_places]),
        )
        naver_query = " ".join(part for part in [region_label or "강릉", category] if part)
        places = self._sort_by_naver_review_rank(
            self._apply_naver_review_ranks(
                places,
                naver_query,
            )
        )
        places = self._filter_places_by_admin_region(region_filter, places)
        if region == "national" and category == "전체" and not has_custom_center:
            featured_places = [
                {
                    "id": f"featured_{index}",
                    "name": name,
                    "category": place_category,
                    "source_category": source_category,
                    "address": address,
                    "lat": lat_value,
                    "lon": lon_value,
                    "photo_source": "",
                    "data_source": "recodate_editorial",
                    "locked": False,
                    "replaceable": True,
                }
                for index, (
                    name,
                    place_category,
                    source_category,
                    address,
                    lat_value,
                    lon_value,
                ) in enumerate(NATIONAL_FEATURED_PLACES, start=1)
            ]
            places = self._dedupe_places([*featured_places, *places])
        _BROWSE_PLACE_CACHE[cache_key] = {"fetched_at": now, "places": places}
        page_places = places[offset : offset + count]
        return {
            "category": category,
            "region": region,
            "offset": offset,
            "count": count,
            "next_offset": offset + len(page_places),
            "has_more": offset + len(page_places) < len(places),
            "places": page_places,
        }

    def _normalize_browse_category(self, category):
        raw = (category or "").strip()
        if not raw:
            return "관광지"
        normalized = raw.lower().replace("-", "_").replace(" ", "_")
        return BROWSE_CATEGORY_ALIASES.get(normalized) or BROWSE_CATEGORY_ALIASES.get(raw) or raw

    def _browse_role_for_source_category(self, source_category):
        if source_category in {"한식", "중식", "일식", "양식", "패스트푸드", "치킨", "피자", "전문음식점", "음식점"}:
            return "음식점"
        if source_category == "카페":
            return "카페"
        if source_category in {"놀이공원", "테마파크", "스포츠", "산책로", "관광지", "동물원", "해수욕장"}:
            return "액티비티"
        if source_category in {"보드카페", "오락실", "방탈출", "영화관", "볼링장", "체험"}:
            return "액티비티"
        if source_category in {"박물관", "전시관", "공연장", "미술관", "기념관", "문화센터"}:
            return "공연/관람"
        if source_category in {"거리", "공원", "전망대"}:
            return "관광지"
        if source_category in {"술집", "호프", "와인바", "칵테일바", "이자카야"}:
            return "술집"
        return "기타"

    def _sort_browse_places_by_google_reviews(self, google_places, fallback_places):
        seen_names = set()
        result = []
        for place in [*google_places, *fallback_places]:
            normalized_name = normalize_name(place["name"])
            if not normalized_name or normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            result.append(place)
        return sorted(
            result,
            key=lambda place: (
                -int(place.get("google_review_count") or 0),
                -float(place.get("google_rating") or 0),
                place["name"],
            ),
        )

    def _apply_naver_review_ranks(self, places, query):
        if not places:
            return places
        try:
            naver_items = self.naver.search_popular(query, display=5)
        except Exception:
            return places
        if not naver_items:
            return places

        ranked_items = [
            (rank, normalize_name(item.get("title", "")))
            for rank, item in enumerate(naver_items, start=1)
            if normalize_name(item.get("title", ""))
        ]
        if not ranked_items:
            return places

        ranked_places = []
        for place in places:
            normalized_place_name = normalize_name(place.get("name", ""))
            matched_rank = None
            for rank, normalized_naver_name in ranked_items:
                if (
                    normalized_place_name
                    and (
                        normalized_place_name in normalized_naver_name
                        or normalized_naver_name in normalized_place_name
                    )
                ):
                    matched_rank = rank
                    break
            if matched_rank:
                ranked_places.append(
                    {
                        **place,
                        "naver_popular": True,
                        "naver_popularity_rank": matched_rank,
                    }
                )
            else:
                ranked_places.append(place)
        return ranked_places

    def _sort_by_naver_review_rank(self, places):
        return sorted(
            places,
            key=lambda place: (
                -int(place.get("google_review_count") or 0),
                int(place.get("naver_popularity_rank") or 999),
                -self._browse_place_priority(place),
                -float(place.get("google_rating") or 0),
                place.get("name", ""),
            ),
        )

    def _browse_place_priority(self, place):
        name = str(place.get("name") or "").strip()
        category = str(place.get("category") or "").strip()
        source_category = str(place.get("source_category") or "").strip()
        source_text = f"{category} {source_category}".lower()
        score = 0

        if place.get("tour_content_id"):
            score += 18
        if place.get("data_source") == "google":
            score += 12
        if place.get("address"):
            score += 3
        if any("\uac00" <= char <= "\ud7a3" for char in name):
            score += 4
        else:
            score -= 10

        source_weights = {
            "세계유산": 28,
            "테마파크": 26,
            "워터파크": 26,
            "관광명소": 24,
            "성/궁궐": 24,
            "자연명소": 20,
            "전망대": 18,
            "해수욕장": 18,
            "박물관": 17,
            "미술관": 17,
            "시장": 8,
            "공원": 14,
            "산책로": 12,
            "종교시설": 3,
            "쇼핑": 2,
        }
        score += max(
            (weight for keyword, weight in source_weights.items() if keyword.lower() in source_text),
            default=0,
        )

        landmark_keywords = {
            "한옥마을": 22,
            "문화마을": 22,
            "해수욕장": 20,
            "아쿠아리움": 20,
            "테마파크": 20,
            "워터파크": 20,
            "일출봉": 20,
            "첨성대": 20,
            "불국사": 20,
            "한라산": 20,
            "설악산": 20,
            "타워": 18,
            "궁": 17,
            "월드": 16,
            "랜드": 16,
            "성": 14,
            "시장": 8,
            "박물관": 14,
            "미술관": 14,
            "수목원": 14,
            "공원": 12,
            "전망대": 12,
            "동굴": 12,
            "마을": 10,
        }
        score += max(
            (weight for keyword, weight in landmark_keywords.items() if keyword in name),
            default=0,
        )
        return score

    def _filter_browse_category_places(self, category, places):
        if category == "전체":
            return places
        outdoor_words = {"해변", "해수욕장", "바다", "해안", "산책로", "공원", "호수", "항", "방파제", "관광지"}
        indoor_words = {
            "영화관",
            "cgv",
            "볼링",
            "방탈출",
            "오락실",
            "보드카페",
            "룸카페",
            "vr",
            "실내",
            "아쿠아리움",
            "수족관",
            "movie_theater",
            "bowling_alley",
            "aquarium",
        }
        culture_words = {
            "미술관",
            "박물관",
            "뮤지엄",
            "전시",
            "전시장",
            "공연장",
            "문화",
            "기념관",
            "갤러리",
            "gallery",
            "exhibition",
            "museum",
            "art_gallery",
            "cultural_center",
        }
        shopping_words = {
            "\uc1fc\ud551",
            "\uc18c\ub9e4",
            "\uc0c1\uc810",
            "\ubc31\ud654\uc810",
            "\uc544\uc6b8\ub81b",
            "\uc1fc\ud551\ubab0",
            "\ud3b8\uc758\uc810",
            "\uc288\ud37c\ub9c8\ucf13",
            "\uc57d\uad6d",
            "\uc815\uc721\uc810",
            "\uc758\ub958",
            "\ubb38\uad6c",
            "\ud654\uc7a5\ud488",
            "\uaf43\uc9d1",
            "\ub9e4\uc7a5",
            "market",
            "store",
            "shop",
        }

        def text_of(place):
            return " ".join(
                str(place.get(key, "")).lower()
                for key in ["name", "source_category", "upperBizName", "middleBizName", "lowerBizName", "detailBizName"]
            )

        def has_any(text, words):
            return any(word.lower() in text for word in words)

        filtered = []
        for place in places:
            text = text_of(place)
            if category == "실내 액티비티":
                if not has_any(text, indoor_words):
                    continue
            elif category == "야외 액티비티":
                if has_any(text, indoor_words) or has_any(text, culture_words):
                    continue
            elif category in {"문화/전시", "공연/관람"}:
                if not has_any(text, culture_words):
                    continue
            elif category in {"액티비티", "엑티비티"}:
                if has_any(text, culture_words):
                    continue
            if category == "\uad00\uad11\uc9c0" and has_any(text, shopping_words):
                continue
            filtered.append(place)
        return filtered

    def _attach_tour_photos(self, places, limit=18):
        photo_places = places[:limit]
        with ThreadPoolExecutor(max_workers=6) as executor:
            photos = list(executor.map(lambda place: self.photos.find_photo(place["name"]), photo_places))
        return [
            {**place, **((photos[index] if index < len(photos) else None) or {})}
            for index, place in enumerate(places)
        ]

    def _replacement_tmap_categories(self, category, source_category):
        if category == "\uc74c\uc2dd\uc810":
            return ["\ud55c\uc2dd", "\uc911\uc2dd", "\uc77c\uc2dd", "\uc804\ubb38\uc74c\uc2dd\uc810", "\uc74c\uc2dd\uc810"]
        if category == "\uce74\ud398":
            return ["\uce74\ud398"]
        if category == "\uc220\uc9d1":
            return ["\uc220\uc9d1", "\ud638\ud504", "\uc640\uc778\ubc14", "\uce75\ud14c\uc77c\ubc14", "\uc774\uc790\uce74\uc57c"]
        if self._required_place_role(category) == "activity":
            return PLAY_TMAP_CATEGORIES
        if category == "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45":
            return ["\uacf5\uc6d0", "\uac70\ub9ac", "\ud574\uc218\uc695\uc7a5", "\uc2a4\ud30c"]
        if source_category and source_category != "\uc0ac\uc6a9\uc790 \uc9c0\uc815":
            return [source_category]
        return [category]

    def recommend(self, req):
        start = {
            "id": req.start_place.id,
            "name": req.start_place.name,
            "lat": req.start_place.lat,
            "lon": req.start_place.lon,
            "category": "시작",
            "locked": True,
            "replaceable": False,
        }
        transport = req.transport
        course_count = self._resolve_course_count(req.mode, req.course_count)
        radius_km = self._resolve_radius(transport, req.radius_km)
        requested_required_places = list(req.required_places)
        if req.required_place:
            requested_required_places.append(req.required_place)
        required_places = [self._required_place(place) for place in requested_required_places]
        accommodation_place = self._accommodation_place(req.accommodation_place) if req.accommodation_place else None
        overnight = bool(req.overnight or accommodation_place)
        include_bar = bool(req.include_bar)
        food_categories = self._normalize_food_categories(req.food_categories or ["음식"])
        dinner_food_categories = self._normalize_food_categories(req.dinner_food_categories or food_categories)
        preferred_categories = req.preferred_place_categories or []

        region_filter = self._build_admin_region_filter(req.region_key, req.include_nearby_admin_regions)
        weather_plan = self._build_weather_plan(req, start)

        fallback_used = False
        fallback_reason = ""

        foods, cafes, activities, finishes = self._collect_candidate_places(start, food_categories, radius_km)
        foods, cafes, activities, finishes = self._filter_candidate_groups_by_admin_region(
            region_filter, foods, cafes, activities, finishes
        )
        if req.only_open_now:
            foods, cafes, activities, finishes = self._filter_open_candidate_groups(
                foods, cafes, activities, finishes
            )
        if req.exclude_franchise_food:
            foods = self._exclude_franchise_foods(foods)
        cafes, activities, finishes = self._apply_preferred_place_categories(
            cafes, activities, finishes, preferred_categories
        )
        activities, finishes = self._apply_weather_to_groups(
            start, radius_km, region_filter, activities, finishes, weather_plan, preferred_categories
        )
        bars = self._collect_bar_places(start, radius_km) if include_bar else []
        bars = self._filter_places_by_admin_region(region_filter, bars)
        if req.only_open_now:
            bars = self._filter_open_places(bars)
        dinner_foods = foods
        if overnight and dinner_food_categories != food_categories:
            dinner_foods, _, _, _ = self._collect_candidate_places(start, dinner_food_categories, radius_km)
            dinner_foods = self._filter_places_by_admin_region(region_filter, dinner_foods)
            if req.only_open_now:
                dinner_foods = self._filter_open_places(dinner_foods)
            if req.exclude_franchise_food:
                dinner_foods = self._exclude_franchise_foods(dinner_foods)

        # 추천 다양성: 인기 순서를 존중하되 비슷한 순위끼리는 매번 자리를 조금씩 바꿔
        # 같은 조건으로 다시 돌려도 똑같은 장소 조합만 나오지 않게 한다.
        foods = self._shuffle_nearby_ranks(foods)
        cafes = self._shuffle_nearby_ranks(cafes)
        activities = self._shuffle_nearby_ranks(activities)
        finishes = self._shuffle_nearby_ranks(finishes)

        max_candidates = max(24, course_count * 8)
        candidates = self._build_all_course_candidates(start, foods, cafes, activities, finishes, max_candidates)
        candidates = self._apply_optional_stops(candidates, req.include_food, req.include_cafe)
        candidates = self._expand_waypoint_count(candidates, activities, req.waypoint_count, req.include_food)
        candidates = self._expand_course_schedule(candidates, dinner_foods, activities, overnight, req.start_time, req.include_food and req.include_dinner)
        candidates = self._append_bar(candidates, bars, include_bar)
        candidates = self._apply_required_places(candidates, required_places)

        if not candidates:
            fallback_used = True
            fallback_reason = "기본 거리 필터 또는 기본 반경에서 추천 조합이 없어 완화 조건을 적용했습니다."
            fallback_radius_km = self._fallback_radius(transport, radius_km)
            if fallback_radius_km > radius_km:
                foods, cafes, activities, finishes = self._collect_candidate_places(
                    start, food_categories, fallback_radius_km
                )
                foods, cafes, activities, finishes = self._filter_candidate_groups_by_admin_region(
                    region_filter, foods, cafes, activities, finishes
                )
                if req.only_open_now:
                    foods, cafes, activities, finishes = self._filter_open_candidate_groups(
                        foods, cafes, activities, finishes
                    )
                if req.exclude_franchise_food:
                    foods = self._exclude_franchise_foods(foods)
                dinner_foods = foods
                if overnight and dinner_food_categories != food_categories:
                    dinner_foods, _, _, _ = self._collect_candidate_places(
                        start, dinner_food_categories, fallback_radius_km
                    )
                    dinner_foods = self._filter_places_by_admin_region(region_filter, dinner_foods)
                    if req.only_open_now:
                        dinner_foods = self._filter_open_places(dinner_foods)
                    if req.exclude_franchise_food:
                        dinner_foods = self._exclude_franchise_foods(dinner_foods)
                cafes, activities, finishes = self._apply_preferred_place_categories(
                    cafes, activities, finishes, preferred_categories
                )
                activities, finishes = self._apply_weather_to_groups(
                    start, fallback_radius_km, region_filter, activities, finishes, weather_plan, preferred_categories
                )
                radius_km = fallback_radius_km
                foods = self._shuffle_nearby_ranks(foods)
                cafes = self._shuffle_nearby_ranks(cafes)
                activities = self._shuffle_nearby_ranks(activities)
                finishes = self._shuffle_nearby_ranks(finishes)
            candidates = self._build_all_course_candidates(
                start,
                foods,
                cafes,
                activities,
                finishes,
                max_candidates,
                min_start_food_m=10,
                min_food_cafe_m=10,
                min_activity_finish_m=10,
            )
            candidates = self._apply_optional_stops(candidates, req.include_food, req.include_cafe)
            candidates = self._expand_waypoint_count(candidates, activities, req.waypoint_count, req.include_food)
            candidates = self._expand_course_schedule(candidates, dinner_foods, activities, overnight, req.start_time, req.include_food and req.include_dinner)
            candidates = self._append_bar(candidates, bars, include_bar)
            candidates = self._apply_required_places(candidates, required_places)
        candidates = self._append_accommodation(candidates, accommodation_place)
        courses = []

        for candidate in candidates:
            raw_places = [start] + candidate["places"]
            route = self._estimate_route(raw_places, transport)
            budget = self._estimate_course_budget(raw_places, route, transport)

            course = {
                "course_id": f"course_{len(courses) + 1:03d}",
                "title": self._course_title(candidate["places"], transport),
                "transport": transport,
                "score": self._recommendation_score(route, transport, raw_places),
                "places": self._serialize_places(raw_places),
                "route": route,
                "estimated_budget_won": budget["total_won"],
                "estimated_place_budget_won": budget["place_total_won"],
                "estimated_transportation_budget_won": budget["transportation_total_won"],
                "budget_items": budget["items"],
                "budget_has_actual_prices": budget["has_actual_prices"],
                "recommendation_reason": self._make_reason(transport, route, candidate["places"]),
            }
            courses.append(course)

        # 점수 통과 코스를 앞에, 백업 코스를 뒤에 두고 전체를 다양성 선별에 넘긴다.
        # 선별은 앞에서부터 고르므로 통과 코스가 우선되고, 카드 간 장소 중복을
        # 피해야 할 때만 백업 코스까지 내려간다(자르면 겹침 회피 여지가 사라짐).
        recommended_courses = [course for course in courses if course["score"] >= MIN_RECOMMENDATION_SCORE]
        recommended_ids = {id(course) for course in recommended_courses}
        backup_courses = [course for course in courses if id(course) not in recommended_ids]
        recommended_courses.sort(key=self._course_order_key)
        backup_courses.sort(key=self._course_order_key)
        courses = [*recommended_courses, *backup_courses]
        courses = self._select_diverse_courses(courses, course_count)
        for index, course in enumerate(courses, start=1):
            course["course_id"] = f"course_{index:03d}"

        return {
            "input": {
                "start_place": start["name"],
                "transport": transport,
                "mode": req.mode,
                "radius_km": radius_km,
                "course_count": course_count,
                "required_places": [place["name"] for place in required_places],
                "accommodation_place": accommodation_place["name"] if accommodation_place else None,
                "overnight": overnight,
                "start_time": req.start_time,
                "food_categories": food_categories,
                "include_food": req.include_food,
                "include_cafe": req.include_cafe,
                "include_dinner": req.include_dinner,
                "include_bar": include_bar,
                "only_open_now": req.only_open_now,
                "preferred_place_categories": preferred_categories,
                "travel_date": req.travel_date,
                "apply_weather": req.apply_weather,
            },
            "weather": (
                {"applied": True, **weather_plan}
                if weather_plan
                else {"applied": False, "requested": bool(req.apply_weather and req.travel_date)}
            ),
            "candidate_counts": {
                "foods": len(foods),
                "cafes": len(cafes),
                "activities": len(activities),
                "finishes": len(finishes),
                "course_candidates": len(candidates),
                "route_api_calls": 0,
                "fallback_used": fallback_used,
                "fallback_reason": fallback_reason,
            },
            "courses": courses,
        }

    # ------------------- 날씨 기반 코스 보정 -------------------

    INDOOR_ACTIVITY_CATEGORIES = ("실내 액티비티", "문화/전시")
    WATER_PLACE_KEYWORDS = ("해수욕장", "해변", "바다", "호수", "강변", "계곡", "폭포", "워터", "수영장")

    def _parse_start_minutes(self, start_time):
        """'HH:MM' 시작 시간을 분으로 변환한다. 미지정이면 10시(사용자 합의 기본 타임라인)."""
        try:
            hour, minute = str(start_time).split(":")
            return int(hour) * 60 + int(minute)
        except (TypeError, ValueError, AttributeError):
            return 600

    def _build_weather_slot_windows(self, start_minutes, include_food, include_cafe):
        """슬롯별 시간 창(분)을 만든다.

        사용자 합의 타임라인: 오전 액티비티 2h → 점심 1h → 카페 1h → 액티비티 2h → 마무리 1h.
        11:30 이후 시작이면 오전 액티비티는 생략하고 점심부터 시작한다.
        점심/카페를 선택하지 않으면 해당 슬롯 시간만큼 당겨진다.
        """
        cursor = start_minutes
        activity_windows = []
        if start_minutes <= 690:  # 11:30 이전 시작 → 오전 액티비티 포함
            activity_windows.append((cursor, cursor + 120))
            cursor += 120
        if include_food:
            cursor += 60  # 점심(실내)
        if include_cafe:
            cursor += 60  # 카페(실내)
        activity_windows.append((cursor, cursor + 120))
        cursor += 120
        finish_window = (cursor, cursor + 60)
        return activity_windows, finish_window

    def _build_weather_plan(self, req, start):
        """travel_date의 예보를 받아 슬롯별 비/더위 계획을 만든다. 적용 불가면 None."""
        if not req.apply_weather or not req.travel_date:
            return None
        forecast = WeatherClient().get_forecast_for_date(start["lat"], start["lon"], req.travel_date)
        if not forecast:
            return None
        start_minutes = self._parse_start_minutes(req.start_time)
        activity_windows, finish_window = self._build_weather_slot_windows(
            start_minutes, req.include_food, req.include_cafe
        )

        def short_window_rain(window, hourly):
            begin, end = window
            hours = range(begin // 60, min(((end + 59) // 60) + 1, 24))
            return any(hourly.get(hour, {}).get("rain") for hour in hours)

        def short_window_tmax(windows, hourly):
            temps = []
            for begin, end in windows:
                for hour in range(begin // 60, min(((end + 59) // 60) + 1, 24)):
                    tmp = hourly.get(hour, {}).get("tmp")
                    if tmp is not None:
                        temps.append(tmp)
            return max(temps) if temps else None

        if forecast["kind"] == "short":
            hourly = forecast["hourly"]
            activity_rain = any(short_window_rain(window, hourly) for window in activity_windows)
            finish_rain = short_window_rain(finish_window, hourly)
            tmax = short_window_tmax([*activity_windows, finish_window], hourly)
        else:
            def mid_rain(window):
                midpoint = (window[0] + window[1]) / 2
                return forecast["am_rain"] if midpoint < 720 else forecast["pm_rain"]

            activity_rain = any(mid_rain(window) for window in activity_windows)
            finish_rain = mid_rain(finish_window)
            tmax = forecast.get("tmax")

        hot = tmax is not None and tmax >= 30
        summary_parts = []
        if activity_rain or finish_rain:
            if forecast["kind"] == "short":
                summary_parts.append("비 예보 시간대는 실내 위주로 구성")
            else:
                rainy = []
                if forecast.get("am_rain"):
                    rainy.append("오전")
                if forecast.get("pm_rain"):
                    rainy.append("오후")
                summary_parts.append(f"{'·'.join(rainy) or '일부'} 비 예보 · 실내 위주로 구성")
        if hot:
            summary_parts.append(f"최고 {tmax}℃ 더위 · 야외는 주요 명소 위주")
        if not summary_parts:
            summary_parts.append("야외 활동에 무리 없는 날씨")
        return {
            "kind": forecast["kind"],
            "date": req.travel_date,
            "activity_rain": activity_rain,
            "finish_rain": finish_rain,
            "tmax": tmax,
            "hot": hot,
            "summary": " · ".join(summary_parts),
        }

    def _is_indoor_activity_place(self, place):
        return place.get("category") in self.INDOOR_ACTIVITY_CATEGORIES

    def _is_heat_exempt_outdoor(self, place, group_max_reviews):
        """폭염에도 유지할 야외 장소: 물가(바다 등), 리뷰가 압도적인 곳, 네이버 인기 랜드마크."""
        text = " ".join(str(place.get(key, "")) for key in ("name", "category", "source_category"))
        if self._contains_any(text, self.WATER_PLACE_KEYWORDS):
            return True
        reviews = int(place.get("google_review_count") or 0)
        if group_max_reviews and reviews >= max(1000, group_max_reviews * 0.5):
            return True
        rank = place.get("naver_popularity_rank")
        if rank is not None and int(rank) <= 5:
            return True
        return False

    def _collect_indoor_activity_places(self, start, radius_km):
        """비 오는 날을 위한 실내(실내 액티비티/문화·전시) 후보를 별도로 수집한다.

        기본 활동 후보는 리뷰가 많은 야외 명소(궁궐·거리 등)가 상위를 점령해
        실내 후보가 아예 없을 수 있어, 날씨 반영 시에만 전용 검색으로 보강한다.
        """
        indoor = self._search_places(
            start,
            "실내 액티비티",
            ["영화관", "볼링장", "방탈출", "보드카페", "오락실", "아쿠아리움"],
            radius_km,
            count=10,
        )
        indoor += self._search_places(
            start,
            "문화/전시",
            ["박물관", "미술관", "전시장", "공연장"],
            radius_km,
            count=10,
        )
        indoor = self._dedupe_places(indoor)
        indoor = self._prioritize_google_places(
            start,
            radius_km,
            "실내 액티비티",
            ["museum", "art_gallery", "movie_theater", "bowling_alley", "aquarium"],
            indoor,
            limit=12,
        )
        indoor = [self._normalize_activity_category(place) for place in indoor]
        indoor = [place for place in indoor if place.get("category") in self.INDOOR_ACTIVITY_CATEGORIES]
        return self._exclude_start_like_places(start, indoor)

    def _apply_weather_to_groups(self, start, radius_km, region_filter, activities, finishes, plan, preferred_categories):
        """날씨 계획에 따라 액티비티/마무리 후보를 보정한다. 후보가 부족해지면 원본을 유지한다."""
        if not plan:
            return activities, finishes
        prefers_outdoor = any("야외" in str(category) for category in (preferred_categories or []))

        indoor_pool = []
        if plan["activity_rain"] or plan["finish_rain"]:
            indoor_pool = [place for place in activities if self._is_indoor_activity_place(place)]
            if len(indoor_pool) < 4:
                extra = self._collect_indoor_activity_places(start, radius_km)
                extra = self._filter_places_by_admin_region(region_filter, extra)
                known_ids = {place.get("id") for place in indoor_pool}
                indoor_pool += [place for place in extra if place.get("id") not in known_ids]
                indoor_pool = self._dedupe_places(indoor_pool)

        adjusted_activities = list(activities)
        if plan["activity_rain"]:
            if len(indoor_pool) >= 2:
                adjusted_activities = indoor_pool[:10]
        elif plan["hot"] and not prefers_outdoor:
            group_max_reviews = max(
                (int(place.get("google_review_count") or 0) for place in adjusted_activities),
                default=0,
            )
            kept = [
                place
                for place in adjusted_activities
                if self._is_indoor_activity_place(place)
                or self._is_heat_exempt_outdoor(place, group_max_reviews)
            ]
            if len(kept) >= 3:
                adjusted_activities = kept

        adjusted_finishes = list(finishes)
        if plan["finish_rain"]:
            indoor_finishes = [place for place in adjusted_finishes if self._is_indoor_activity_place(place)]
            used_ids = {place.get("id") for place in indoor_finishes}
            replaced = indoor_finishes + [
                place for place in indoor_pool if place.get("id") not in used_ids
            ][:8]
            if len(replaced) >= 2:
                adjusted_finishes = replaced

        return adjusted_activities, adjusted_finishes

    def _is_franchise_place(self, place):
        normalized = normalize_name(place.get("name", ""))
        if not normalized:
            return False
        return any(brand in normalized for brand in load_franchise_brand_names())

    def _exclude_franchise_foods(self, foods):
        """프랜차이즈 음식점을 제외한다. 후보가 3개 미만으로 줄면 원본을 유지한다(안전망)."""
        local_foods = [place for place in foods if not self._is_franchise_place(place)]
        if len(local_foods) >= 3:
            return local_foods
        return foods

    def _filter_open_places(self, places):
        return [place for place in places if place.get("open_now") is True]

    def _filter_open_candidate_groups(self, foods, cafes, activities, finishes):
        return tuple(
            self._filter_open_places(places)
            for places in (foods, cafes, activities, finishes)
        )

    def calculate_selected_route(self, req):
        places = [
            {
                "id": place.id,
                "name": place.name,
                "lat": place.lat,
                "lon": place.lon,
                "category": "",
                "locked": False,
                "replaceable": True,
            }
            for place in req.places
        ]

        try:
            if req.transport == "walk":
                return self._route_walk(places)
            if req.transport == "transit":
                return self._route_transit_mixed(places)
            return self._route_car(places)
        except Exception:
            route = self._estimate_route(places, req.transport)
            route["type"] = f"estimated_{req.transport}_fallback"
            route["path"] = self._places_to_path(places)
            route["external_route_fallback_used"] = True
            return route

    def recalculate_course(self, req):
        places = [place.model_dump() for place in req.places]
        route = self._estimate_route(places, req.transport)
        budget = self._estimate_course_budget(places, route, req.transport)
        candidate_places = places[1:]
        return {
            "course_id": req.course_id,
            "title": self._course_title(candidate_places, req.transport),
            "transport": req.transport,
            "score": self._recommendation_score(route, req.transport, places),
            "places": self._serialize_places(places),
            "route": route,
            "estimated_budget_won": budget["total_won"],
            "estimated_place_budget_won": budget["place_total_won"],
            "estimated_transportation_budget_won": budget["transportation_total_won"],
            "budget_items": budget["items"],
            "budget_has_actual_prices": budget["has_actual_prices"],
            "recommendation_reason": self._make_reason(req.transport, route, candidate_places),
        }

    def preview_course(
        self,
        course_id,
        transport="transit",
        overnight=False,
        include_food=True,
        include_cafe=True,
        include_dinner=True,
        include_bar=False,
    ):
        definitions = {
            "anmok": [
                ("\uac15\ub989\uc5ed", "\uc2dc\uc791"),
                ("\ucd08\ub2f9\uc21c\ub450\ubd80\ub9c8\uc744", "\uc74c\uc2dd\uc810"),
                ("\uc548\ubaa9\ud574\ubcc0", "\ud574\ubcc0 \uc561\ud2f0\ube44\ud2f0"),
                ("\uac15\ub989\ucee4\ud53c\uac70\ub9ac", "\uce74\ud398"),
                ("\uac15\ub989\uc1a1\uc815\ud574\uc218\uc695\uc7a5", "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45"),
            ],
            "culture": [
                ("\uac15\ub989\uc5ed", "\uc2dc\uc791"),
                ("\uc740\ud654\uc2dd\ub2f9", "\uc74c\uc2dd\uc810"),
                ("\uac15\ub989\uc5ed \uce74\ud398", "\uce74\ud398"),
                ("\uac15\ub989\uc62c\ub9bc\ud53d\ubba4\uc9c0\uc5c4", "\ubb38\ud654/\uc804\uc2dc"),
                ("\ub9d0\ub098\ub214\ud130\uacf5\uc6d0", "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45"),
            ],
            "night": [
                ("\uac15\ub989\uc5ed", "\uc2dc\uc791"),
                ("\uac15\ub989\uc62c\ub9bc\ud53d\ubba4\uc9c0\uc5c4", "\ubb38\ud654/\uc804\uc2dc"),
                ("\uc21c\ub450\ubd80\uc7a5\uce7c\uad6d\uc218", "\uc74c\uc2dd\uc810"),
                ("\uacbd\ud3ec\ud574\ubcc0", "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45"),
                ("\uc138\uc778\ud2b8\uc874\uc2a4\ud638\ud154", "\uc219\uc18c"),
            ],
        }
        definition = definitions.get(course_id)
        if not definition:
            raise ValueError("미리보기 코스를 찾지 못했습니다.")
        include_bar = bool(include_bar)
        places = [
            self._search_preview_place(keyword, category, index == 0)
            for index, (keyword, category) in enumerate(definition)
        ]
        places = [
            place
            for place in places
            if (include_food or self._required_place_role(place.get("category", "")) != "food")
            and (include_cafe or self._required_place_role(place.get("category", "")) != "cafe")
        ]
        if overnight and include_dinner:
            dinner_places = self._search_places(
                places[-1],
                "\uc74c\uc2dd\uc810",
                ["\ud55c\uc2dd", "\uc911\uc2dd", "\uc77c\uc2dd", "\uc804\ubb38\uc74c\uc2dd\uc810"],
                radius_km=5,
                count=12,
            )
            dinner = self._nearest_distinct_place(
                places[-1],
                dinner_places,
                {normalize_name(place["name"]) for place in places},
            )
            if dinner:
                places.append(dinner)
        if include_bar:
            bars = self._collect_bar_places(places[-1], radius_km=5)
            bar = self._nearest_distinct_place(
                places[-1],
                bars,
                {normalize_name(place["name"]) for place in places},
            )
            if bar:
                places.append(bar)
        route = self._estimate_route(places, transport)
        budget = self._estimate_course_budget(places, route, transport)
        candidate_places = places[1:]
        return {
            "course_id": f"preview_{course_id}",
            "title": self._course_title(candidate_places, transport),
            "transport": transport,
            "score": self._recommendation_score(route, transport, places),
            "places": self._serialize_places(places),
            "route": route,
            "estimated_budget_won": budget["total_won"],
            "estimated_place_budget_won": budget["place_total_won"],
            "estimated_transportation_budget_won": budget["transportation_total_won"],
            "budget_items": budget["items"],
            "budget_has_actual_prices": budget["has_actual_prices"],
            "recommendation_reason": self._make_reason(transport, route, candidate_places),
        }

    def _search_preview_place(self, keyword, category, locked=False):
        data, _ = self.tmap.search_pois(keyword, count=20)
        pois = extract_pois(data)
        gangneung_center = {"lat": 37.7651616, "lon": 128.9013964}
        gangneung_pois = []
        for poi in pois:
            try:
                distance = haversine_m(
                    gangneung_center["lat"],
                    gangneung_center["lon"],
                    float(poi["frontLat"]),
                    float(poi["frontLon"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
            if distance <= 30000:
                gangneung_pois.append((distance, poi))
        if not gangneung_pois:
            raise ValueError(f"{keyword} 장소를 찾지 못했습니다.")
        normalized_keyword = normalize_name(keyword)
        exact_matches = [
            item
            for item in gangneung_pois
            if normalize_name(item[1].get("name", "")) == normalized_keyword
        ]
        _, poi = (exact_matches or gangneung_pois)[0]
        place = self._poi_to_place(poi, category, keyword)
        place["locked"] = locked or category == "\uc219\uc18c"
        place["replaceable"] = not place["locked"]
        return place

    def _resolve_course_count(self, mode, course_count):
        if mode == "quick":
            return settings.quick_course_count
        if course_count is None:
            return settings.quick_course_count
        return max(1, min(int(course_count), settings.max_course_count))

    def _resolve_radius(self, transport, radius_km):
        if radius_km is None:
            if transport == "walk":
                return settings.default_walk_radius_km
            if transport == "transit":
                return settings.default_transit_radius_km
            return settings.default_car_radius_km
        if transport == "walk":
            max_radius = settings.max_walk_radius_km
        elif transport == "transit":
            max_radius = settings.max_transit_radius_km
        else:
            max_radius = settings.max_car_radius_km
        return max(0.5, min(float(radius_km), max_radius))

    def _normalize_food_categories(self, categories):
        normalized = []
        for category in categories or ["음식"]:
            normalized.extend(FOOD_CATEGORY_ALIASES.get(category, [category]))
        return list(dict.fromkeys(normalized)) or FOOD_CATEGORY_ALIASES["음식"]

    def _fallback_radius(self, transport, radius_km):
        if transport == "walk":
            max_radius = settings.max_walk_radius_km
        elif transport == "transit":
            max_radius = settings.max_transit_radius_km
        else:
            max_radius = settings.max_car_radius_km
        return min(max_radius, max(float(radius_km), float(radius_km) + 1))

    def _collect_candidate_places(self, start, food_categories, radius_km):
        foods = self._search_places(start, "음식점", food_categories, radius_km, count=30)[:12]
        cafes = self._prioritize_local_cafes(
            self._search_places(start, "카페", ["카페"], radius_km, count=30)
        )[:20]
        activities = self._search_places(
            start,
            "야외 액티비티",
            ["해수욕장", "놀이공원", "테마파크", "스포츠", "산책로", "관광지", "동물원"],
            radius_km,
            count=5,
        )
        activities += self._search_places(
            start,
            "실내 액티비티",
            ["보드카페", "오락실", "영화관", "볼링장", "방탈출", "체험"],
            radius_km,
            count=5,
        )
        activities += self._search_places(
            start,
            "문화/전시",
            ["박물관", "전시장", "공연장", "미술관"],
            radius_km,
            count=5,
        )
        activities = self._dedupe_places(activities)[:10]
        if not activities:
            activities = self._search_places(start, "야외 액티비티", ["관광지"], radius_km, count=8)[:8]
        finishes = self._search_places(start, "마무리/산책", ["거리"], radius_km, count=8)
        finishes += self._search_places(start, "마무리/산책", ["공원"], radius_km, count=8)
        finishes += self._search_places(start, "마무리/산책", ["해수욕장"], radius_km, count=8)
        finishes = self._dedupe_places(finishes)[:8]
        foods = self._prioritize_google_places(start, radius_km, "음식점", ["restaurant"], foods, limit=12)
        cafes = self._prioritize_google_places(start, radius_km, "카페", ["cafe"], cafes, limit=20)
        activities = self._prioritize_google_places(
            start,
            radius_km,
            "야외 액티비티",
            ["tourist_attraction", "museum", "art_gallery", "amusement_park", "bowling_alley", "movie_theater", "park"],
            activities,
            limit=10,
        )
        activities = [self._normalize_activity_category(place) for place in activities]
        finishes = self._prioritize_google_places(
            start,
            radius_km,
            "마무리/산책",
            ["park", "tourist_attraction"],
            finishes,
            limit=8,
        )
        foods = self._exclude_start_like_places(start, foods)
        cafes = self._exclude_start_like_places(start, cafes)
        activities = self._exclude_start_like_places(start, activities)
        finishes = self._exclude_start_like_places(start, finishes)
        return foods, cafes, activities, finishes

    def _exclude_start_like_places(self, start, places):
        start_name = normalize_name(start.get("name", ""))
        result = []
        for place in places:
            place_name = normalize_name(place.get("name", ""))
            if start_name and place_name and start_name == place_name:
                continue
            if haversine_m(start["lat"], start["lon"], place["lat"], place["lon"]) < 35:
                continue
            result.append(place)
        return result

    def _admin_region_index(self):
        global _ADMIN_REGION_INDEX
        if _ADMIN_REGION_INDEX is not None:
            return _ADMIN_REGION_INDEX

        paths = [
            Path("/opt/recodate/frontend/assets/korea_admin_regions.json"),
            Path(__file__).resolve().parents[3] / "frontend" / "assets" / "korea_admin_regions.json",
        ]
        data = None
        for path in paths:
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                break

        if not data:
            _ADMIN_REGION_INDEX = {"contexts": {}, "dongs": []}
            return _ADMIN_REGION_INDEX

        contexts = {}
        dongs = []
        for province in data.get("provinces", []):
            province_key = f"sido_{province['key']}"
            province_district_keys = []
            province_dong_keys = []
            city_contexts = {}
            for district in province.get("districts", []):
                district_key = f"sgg_{district['key']}"
                district_dong_keys = []
                for dong in district.get("dongs", []):
                    dong_key = f"emd_{dong['key']}"
                    dong_item = {
                        "key": dong_key,
                        "province_key": province_key,
                        "district_key": district_key,
                        "lat": float(dong["center"]["lat"]),
                        "lon": float(dong["center"]["lon"]),
                    }
                    dongs.append(dong_item)
                    district_dong_keys.append(dong_key)
                    province_dong_keys.append(dong_key)
                province_district_keys.append(district_key)
                contexts[district_key] = {
                    "type": "district",
                    "province_key": province_key,
                    "dong_keys": set(district_dong_keys),
                }
                district_name = str(district.get("name") or "")
                city_end = district_name.rfind("시")
                if district_name.endswith("구") and 0 < city_end < len(district_name) - 1:
                    city_key = f"city_{str(district['key'])[:4]}"
                    city_context = city_contexts.setdefault(
                        city_key,
                        {
                            "type": "city",
                            "province_key": province_key,
                            "district_keys": set(),
                            "dong_keys": set(),
                        },
                    )
                    city_context["district_keys"].add(district_key)
                    city_context["dong_keys"].update(district_dong_keys)
            contexts[province_key] = {
                "type": "province",
                "district_keys": set(province_district_keys),
                "dong_keys": set(province_dong_keys),
            }
            contexts.update(city_contexts)

        for dong in dongs:
            contexts[dong["key"]] = {
                "type": "dong",
                "province_key": dong["province_key"],
                "district_key": dong["district_key"],
                "dong_keys": {dong["key"]},
                "lat": dong["lat"],
                "lon": dong["lon"],
            }

        _ADMIN_REGION_INDEX = {"contexts": contexts, "dongs": dongs}
        return _ADMIN_REGION_INDEX

    def _build_admin_region_filter(self, region_key, include_nearby):
        if not region_key:
            return None
        index = self._admin_region_index()
        region_keys = [
            key.strip()
            for key in str(region_key).split(",")
            if key and key.strip()
        ]
        contexts = [
            index["contexts"].get(key)
            for key in region_keys
            if index["contexts"].get(key)
        ]
        if not contexts:
            return None

        allowed_dongs = set().union(*(set(context.get("dong_keys") or []) for context in contexts))
        if len(contexts) == 1 and contexts[0]["type"] == "dong" and include_nearby:
            context = contexts[0]
            nearby = [
                dong
                for dong in index["dongs"]
                if dong["district_key"] == context["district_key"]
                and haversine_m(context["lat"], context["lon"], dong["lat"], dong["lon"]) <= 3000
            ]
            if len(nearby) < 4:
                nearby = sorted(
                    [dong for dong in index["dongs"] if dong["district_key"] == context["district_key"]],
                    key=lambda dong: haversine_m(context["lat"], context["lon"], dong["lat"], dong["lon"]),
                )[:5]
            allowed_dongs = {dong["key"] for dong in nearby}

        return {"allowed_dongs": allowed_dongs, "enabled": bool(allowed_dongs)}

    def _nearest_admin_dong_key(self, place):
        index = self._admin_region_index()
        if not index["dongs"]:
            return ""
        return min(
            index["dongs"],
            key=lambda dong: haversine_m(place["lat"], place["lon"], dong["lat"], dong["lon"]),
        )["key"]

    def _filter_places_by_admin_region(self, region_filter, places):
        if not region_filter or not region_filter.get("enabled"):
            return places
        allowed_dongs = region_filter["allowed_dongs"]
        return [
            place
            for place in places
            if self._nearest_admin_dong_key(place) in allowed_dongs
        ]

    def _filter_candidate_groups_by_admin_region(self, region_filter, foods, cafes, activities, finishes):
        return (
            self._filter_places_by_admin_region(region_filter, foods),
            self._filter_places_by_admin_region(region_filter, cafes),
            self._filter_places_by_admin_region(region_filter, activities),
            self._filter_places_by_admin_region(region_filter, finishes),
        )

    def _apply_preferred_place_categories(self, cafes, activities, finishes, preferred_categories):
        if not preferred_categories:
            return cafes, activities, finishes
        return (
            self._sort_by_preferred_category(cafes, preferred_categories),
            self._sort_by_preferred_category(activities, preferred_categories),
            self._sort_by_preferred_category(finishes, preferred_categories),
        )

    def _sort_by_preferred_category(self, places, preferred_categories):
        if not places or not preferred_categories:
            return places
        preferences = [str(category).strip() for category in preferred_categories if str(category).strip()]
        if not preferences:
            return places

        def preference_rank(place):
            text = " ".join(
                str(place.get(key, ""))
                for key in ["name", "category", "source_category", "middleBizName", "lowerBizName"]
            )
            role = str(place.get("category", ""))
            for index, preference in enumerate(preferences):
                if preference == role or preference in text:
                    return index
            return len(preferences)

        return [
            place
            for _, place in sorted(
                enumerate(places),
                key=lambda item: (preference_rank(item[1]), item[0]),
            )
        ]

    def _normalize_activity_category(self, place):
        text = " ".join(
            str(place.get(key, ""))
            for key in ["name", "category", "source_category", "middleBizName", "lowerBizName"]
        )
        if self._contains_any(text, ["수족관", "아쿠아리움", "영화관", "볼링", "방탈출", "오락실"]):
            return {**place, "category": "실내 액티비티"}
        if self._contains_any(text, ["아르떼", "박물관", "미술관", "전시", "뮤지엄", "갤러리"]):
            return {**place, "category": "문화/전시"}
        return place

    def _collect_bar_places(self, start, radius_km):
        bars = self._search_places(
            start,
            "술집",
            ["술집", "호프", "와인바", "칵테일바", "이자카야"],
            radius_km,
            count=16,
        )
        return self._prioritize_google_places(start, radius_km, "술집", ["bar", "pub"], bars, limit=12)

    def _apply_optional_stops(self, candidates, include_food=True, include_cafe=True):
        result = []
        for candidate in candidates:
            places = [
                place
                for place in candidate["places"]
                if (include_food or self._required_place_role(place.get("category", "")) != "food")
                and (include_cafe or self._required_place_role(place.get("category", "")) != "cafe")
            ]
            result.append({**candidate, "places": places})
        return self._dedupe_course_candidates(result)

    def _append_bar(self, candidates, bars, include_bar=False):
        if not include_bar or not bars:
            return candidates
        result = []
        for candidate in candidates:
            places = list(candidate["places"])
            used_names = {normalize_name(place["name"]) for place in places}
            bar = self._nearest_distinct_place(places[-1], bars, used_names)
            result.append({**candidate, "places": [*places, bar] if bar else places})
        return self._dedupe_course_candidates(result)

    def _prioritize_google_places(self, start, radius_km, category, included_types, existing_places, limit):
        google_places = self.google.search_nearby(start, radius_km, category, included_types, count=20)
        if not google_places:
            ranked_existing_places = self._apply_naver_review_ranks(existing_places, category)
            return self._sort_by_naver_review_rank(ranked_existing_places)[:limit]
        places = self._dedupe_places([*google_places, *existing_places])
        places = self._apply_naver_review_ranks(places, category)
        return self._sort_by_naver_review_rank(places)[:limit]

    def _build_all_course_candidates(
        self,
        start,
        foods,
        cafes,
        activities,
        finishes,
        max_candidates,
        min_start_food_m=50,
        min_food_cafe_m=50,
        min_activity_finish_m=50,
    ):
        contextual = self._build_contextual_course_candidates(start, foods, activities, finishes)
        regular = self._build_course_candidates(
            start,
            foods,
            cafes,
            activities,
            finishes,
            max_candidates,
            min_start_food_m=min_start_food_m,
            min_food_cafe_m=min_food_cafe_m,
            min_activity_finish_m=min_activity_finish_m,
        )
        if any(place.get("google_review_count") for place in [*foods, *cafes, *activities, *finishes]):
            return self._dedupe_course_candidates([*regular, *contextual])[:max_candidates]
        prioritized_contextual = contextual[:1]
        remaining_contextual = contextual[1:]
        return self._dedupe_course_candidates([*prioritized_contextual, *regular, *remaining_contextual])[:max_candidates]

    def _build_contextual_course_candidates(self, start, foods, activities, finishes):
        candidates = []
        for beach in activities:
            if not self._is_anmok_beach(beach):
                continue
            nearby_cafes = self._prioritize_local_cafes(
                self._search_places(beach, "카페", ["카페"], radius_km=1, count=30)
            )[:16]
            for food, cafe, finish in itertools.product(foods, nearby_cafes, finishes):
                places = [food, beach, cafe, finish]
                if len({place["id"] for place in places}) < 4:
                    continue
                if len({normalize_name(place["name"]) for place in places}) < 4:
                    continue
                candidates.append(
                    {
                        "places": places,
                        "approx_distance_m": self._approximate_course_distance(start, places),
                        "context_label": "안목해변 카페거리 연계",
                    }
                )
        candidates.sort(
            key=lambda item: (
                -sum(int(place.get("google_review_count") or 0) for place in item["places"]),
                item["approx_distance_m"],
            )
        )
        return candidates[:6]

    def _is_anmok_beach(self, place):
        normalized_name = normalize_name(place.get("name", ""))
        return "안목" in normalized_name and ("해변" in normalized_name or "해수욕장" in normalized_name)

    def _dedupe_course_candidates(self, candidates):
        seen = set()
        result = []
        for candidate in candidates:
            key = tuple(place["id"] for place in candidate["places"])
            if key in seen:
                continue
            seen.add(key)
            result.append(candidate)
        return result

    def _required_place(self, place):
        return {
            "id": place.id or place.name,
            "name": place.name,
            "lat": place.lat,
            "lon": place.lon,
            "category": self._classify_required_place(place),
            "source_category": "\uc0ac\uc6a9\uc790 \uc9c0\uc815",
            "park_flag": "",
            "naver_popular": place.naver_popular,
            "naver_popularity_rank": place.naver_popularity_rank,
            "locked": True,
            "replaceable": False,
        }

    def _accommodation_place(self, place):
        return {
            "id": place.id or place.name,
            "name": place.name,
            "lat": place.lat,
            "lon": place.lon,
            "category": "\uc219\uc18c",
            "source_category": "\uc0ac\uc6a9\uc790 \uc9c0\uc815 \uc219\uc18c",
            "park_flag": "",
            "locked": True,
            "replaceable": False,
        }

    def _append_accommodation(self, candidates, accommodation_place):
        if not accommodation_place:
            return candidates
        result = []
        for candidate in candidates:
            places = [
                place
                for place in candidate["places"]
                if normalize_name(place["name"]) != normalize_name(accommodation_place["name"])
            ]
            result.append({**candidate, "places": [*places, accommodation_place]})
        return self._dedupe_course_candidates(result)

    def _expand_waypoint_count(self, candidates, activities, waypoint_count, include_food=True):
        if waypoint_count is None:
            return candidates
        target_count = max(2, min(int(waypoint_count), 7))
        result = []
        for candidate in candidates:
            places = list(candidate["places"])
            if not include_food:
                places = [
                    place
                    for place in places
                    if self._required_place_role(place.get("category", "")) != "food"
                ]
            if len(places) > target_count:
                if include_food and target_count == 2:
                    priority_roles = ["food", "finish"]
                elif include_food and target_count == 3:
                    priority_roles = ["food", "activity", "finish"]
                elif not include_food and target_count == 2:
                    priority_roles = ["activity", "finish"]
                else:
                    priority_roles = ["cafe", "activity", "finish", "food"]
                selected = []
                for role in priority_roles:
                    match = next(
                        (
                            place
                            for place in places
                            if place not in selected
                            and self._required_place_role(place.get("category", "")) == role
                        ),
                        None,
                    )
                    if match:
                        selected.append(match)
                    if len(selected) >= target_count:
                        break
                for place in places:
                    if len(selected) >= target_count:
                        break
                    if place not in selected:
                        selected.append(place)
                places = [place for place in places if place in selected]
            used_names = {normalize_name(place["name"]) for place in places}
            while len(places) < target_count:
                extra = self._nearest_distinct_place(places[-1], activities, used_names)
                if not extra:
                    break
                places.insert(len(places) - 1, extra)
                used_names.add(normalize_name(extra["name"]))
            result.append({**candidate, "places": places})
        return self._dedupe_course_candidates(result)

    def _expand_course_schedule(self, candidates, foods, activities, overnight, start_time, include_food=True):
        early_start = self._is_early_start(start_time)
        if not overnight and not early_start:
            return candidates
        result = []
        for candidate in candidates:
            places = list(candidate["places"])
            used_names = {normalize_name(place["name"]) for place in places}
            if early_start:
                morning_place = self._nearest_distinct_place(places[0], activities, used_names)
                if morning_place:
                    places.insert(0, morning_place)
                    used_names.add(normalize_name(morning_place["name"]))
                extra_activity = self._nearest_distinct_place(places[-1], activities, used_names)
                if extra_activity:
                    places.insert(len(places) - 1, extra_activity)
                    used_names.add(normalize_name(extra_activity["name"]))
            if overnight and include_food:
                dinner = self._nearest_distinct_place(places[-1], foods, used_names)
                if dinner:
                    places.insert(len(places) - 1, dinner)
            result.append({**candidate, "places": places})
        return self._dedupe_course_candidates(result)

    def _nearest_distinct_place(self, reference, places, used_names):
        available = [
            place
            for place in places
            if normalize_name(place["name"]) not in used_names
        ]
        if not available:
            return None
        return min(
            available,
            key=lambda place: haversine_m(
                reference["lat"],
                reference["lon"],
                place["lat"],
                place["lon"],
            ),
        )

    def _is_early_start(self, start_time):
        if not start_time:
            return False
        try:
            hour, minute = start_time.split(":", 1)
            return int(hour) * 60 + int(minute) <= 11 * 60
        except (AttributeError, TypeError, ValueError):
            return False

    def _classify_required_place(self, place):
        text = " ".join(
            [
                place.name,
                place.upperBizName,
                place.middleBizName,
                place.lowerBizName,
                place.detailBizName,
            ]
        )
        if self._contains_any(text, ["\uce74\ud398", "\ucee4\ud53c", "\ubca0\uc774\ucee4\ub9ac", "\ub514\uc800\ud2b8"]):
            return "\uce74\ud398"
        if self._contains_any(text, ["\uc220\uc9d1", "\ud638\ud504", "\ud3ec\ucc28", "\uc640\uc778\ubc14", "\uce75\ud14c\uc77c", "\uc774\uc790\uce74\uc57c"]):
            return "\uc220\uc9d1"
        if self._contains_any(
            text,
            [
                "\ub9c8\ud2b8",
                "\ud3b8\uc758\uc810",
                "\uc288\ud37c",
                "\ub300\ud615\ud560\uc778\uc810",
                "\uc1fc\ud551\ubab0",
                "\ubc31\ud654\uc810",
                "\uc544\uc6c3\ub81b",
                "\uc2a4\ud1a0\uc5b4",
                "\uc774\ub9c8\ud2b8",
                "\ud648\ud50c\ub7ec\uc2a4",
                "\ub86f\ub370\ub9c8\ud2b8",
            ],
        ):
            return "\uc7a0\uae50 \uacbd\uc720"
        if self._contains_any(text, ["\uc74c\uc2dd", "\uc2dd\ub2f9", "\ud55c\uc2dd", "\uc911\uc2dd", "\uc77c\uc2dd", "\uc591\uc2dd", "\ubd84\uc2dd"]):
            return "\uc74c\uc2dd\uc810"
        if self._contains_any(text, ["\uacf5\uc6d0", "\uac70\ub9ac", "\uc0b0\ucc45", "\uc2dc\uc7a5"]):
            return "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45"
        if self._contains_any(text, ["\ud574\ubcc0", "\ud574\uc218\uc695\uc7a5", "\ub180\uc774\uacf5\uc6d0", "\ud14c\ub9c8\ud30c\ud06c", "\uc2a4\ud3ec\uce20", "\uc0b0\ucc45\ub85c", "\ub3d9\ubb3c\uc6d0"]):
            return "\uc57c\uc678 \uc561\ud2f0\ube44\ud2f0"
        if self._contains_any(text, ["\ubcf4\ub4dc\uce74\ud398", "\uc624\ub77d\uc2e4", "\uc601\ud654\uad00", "\ubcfc\ub9c1\uc7a5", "\ubc29\ud0c8\ucd9c", "\uccb4\ud5d8", "\uc218\uc871\uad00", "\uc544\ucfe0\uc544\ub9ac\uc6c0"]):
            return "\uc2e4\ub0b4 \uc561\ud2f0\ube44\ud2f0"
        if self._contains_any(text, ["\ubc15\ubb3c\uad00", "\ubbf8\uc220\uad00", "\uc804\uc2dc", "\uacf5\uc5f0\uc7a5", "\uadf9\uc7a5", "\uc544\ub974\ub5bc"]):
            return "\ubb38\ud654/\uc804\uc2dc"
        return "\uc57c\uc678 \uc561\ud2f0\ube44\ud2f0"

    def _contains_any(self, text, keywords):
        return any(keyword in text for keyword in keywords)

    def _apply_required_places(self, candidates, required_places):
        if not required_places:
            return candidates
        result = []
        for candidate in candidates:
            places = list(candidate["places"])
            for required_place in required_places:
                places = self._apply_required_place_to_places(places, required_place, candidate)
            if len({normalize_name(place["name"]) for place in places}) != len(places):
                continue
            result.append({**candidate, "places": places})
        return self._dedupe_course_candidates(result)

    def _apply_required_place_to_places(self, places, required_place, candidate):
        if any(
            normalize_name(place["name"]) == normalize_name(required_place["name"])
            for place in places
        ):
            return places
        if required_place["category"] == "\uc7a0\uae50 \uacbd\uc720":
            insert_at = self._required_stopover_slot(places, required_place)
            places.insert(insert_at, required_place)
            return places

        role = self._required_place_role(required_place["category"])
        matching_slots = [
            index
            for index, place in enumerate(places)
            if self._required_place_role(place.get("category", "")) == role
        ]
        replace_slot = next(
            (
                index
                for index in matching_slots
                if places[index].get("replaceable", True) and not places[index].get("locked", False)
            ),
            None,
        )
        if replace_slot is not None:
            places[replace_slot] = required_place
            return places
        if matching_slots:
            places.insert(matching_slots[-1] + 1, required_place)
            return places

        target_slot = self._required_place_slot(required_place["category"], candidate)
        if target_slot < len(places) and places[target_slot].get("replaceable", True):
            places[target_slot] = required_place
        else:
            places.insert(min(target_slot, len(places)), required_place)
        return places

    def _required_place_role(self, category):
        if category == "\uc74c\uc2dd\uc810":
            return "food"
        if category == "\uce74\ud398":
            return "cafe"
        if category == "\uc220\uc9d1":
            return "bar"
        if category == "\uc7a0\uae50 \uacbd\uc720":
            return "stopover"
        if category == "\ub9c8\ubb34\ub9ac/\uc0b0\ucc45":
            return "finish"
        if category in PLAY_CATEGORY_NAMES or "\uc561\ud2f0\ube44\ud2f0" in category:
            return "activity"
        return "finish"

    def _required_stopover_slot(self, places, required_place):
        best_slot = 1
        best_extra_distance_m = None
        for slot in range(1, len(places)):
            previous = places[slot - 1]
            next_place = places[slot] if slot < len(places) else None
            extra_distance_m = haversine_m(
                previous["lat"],
                previous["lon"],
                required_place["lat"],
                required_place["lon"],
            )
            if next_place:
                extra_distance_m += haversine_m(
                    required_place["lat"],
                    required_place["lon"],
                    next_place["lat"],
                    next_place["lon"],
                )
                extra_distance_m -= haversine_m(
                    previous["lat"],
                    previous["lon"],
                    next_place["lat"],
                    next_place["lon"],
                )
            if best_extra_distance_m is None or extra_distance_m < best_extra_distance_m:
                best_slot = slot
                best_extra_distance_m = extra_distance_m
        return best_slot

    def _required_place_slot(self, category, candidate):
        contextual = bool(candidate.get("context_label"))
        if category == "\uc74c\uc2dd\uc810":
            return 0
        if category == "\uce74\ud398":
            return 2 if contextual else 1
        if category in PLAY_CATEGORY_NAMES or "\uc561\ud2f0\ube44\ud2f0" in category:
            return 1 if contextual else 2
        if category == "\uc220\uc9d1":
            return len(candidate.get("places", []))
        return 3

    def _search_places(self, center, recodate_category, tmap_categories, radius_km, count=15, strict_category=False):
        business_places = (
            self.business_places.search(
                center,
                recodate_category,
                radius_km,
                limit=max(count * 2, count),
                strict_category=strict_category,
            )
            if recodate_category in BUSINESS_PRIMARY_CATEGORIES | BUSINESS_SECONDARY_CATEGORIES
            else []
        )
        offline_places = search_offline_places(
            center,
            recodate_category,
            tmap_categories,
            radius_km,
            max(count * 2, count),
            strict_category,
        )
        if recodate_category in BUSINESS_PRIMARY_CATEGORIES:
            all_places = self._dedupe_places([*business_places, *offline_places])
        elif recodate_category in BUSINESS_SECONDARY_CATEGORIES:
            all_places = self._dedupe_places([*offline_places, *business_places])
        else:
            all_places = self._dedupe_places(offline_places)
        if len(all_places) < count:
            for tmap_category in tmap_categories:
                try:
                    data, _ = self.tmap.search_around(center, tmap_category, radius_km, count=count)
                except Exception:
                    continue
                for poi in extract_pois(data):
                    try:
                        place = self._poi_to_place(poi, recodate_category, tmap_category)
                    except (TypeError, ValueError):
                        continue
                    if self._is_valid_place(place):
                        all_places.append(place)
        places = self._dedupe_places(all_places)
        if places:
            return places
        offline_fallback = search_offline_places(center, recodate_category, tmap_categories, radius_km, count, strict_category)
        business_fallback = (
            self.business_places.search(
                center,
                recodate_category,
                radius_km,
                limit=count,
                strict_category=strict_category,
            )
            if recodate_category in BUSINESS_PRIMARY_CATEGORIES | BUSINESS_SECONDARY_CATEGORIES
            else []
        )
        if recodate_category in BUSINESS_PRIMARY_CATEGORIES:
            return self._dedupe_places([*business_fallback, *offline_fallback])
        if recodate_category in BUSINESS_SECONDARY_CATEGORIES:
            return self._dedupe_places([*offline_fallback, *business_fallback])
        return self._dedupe_places(offline_fallback)

    def _poi_to_place(self, poi, recodate_category, source_category):
        name = poi.get("name", "")
        return {
            "id": poi.get("id") or poi.get("pkey") or f"{normalize_name(name)}_{poi.get('frontLat')}_{poi.get('frontLon')}",
            "name": name,
            "category": recodate_category,
            "source_category": source_category,
            "upperBizName": poi.get("upperBizName", ""),
            "middleBizName": poi.get("middleBizName", ""),
            "lowerBizName": poi.get("lowerBizName", ""),
            "detailBizName": poi.get("detailBizName", ""),
            "address": " ".join(
                part
                for part in [
                    poi.get("upperAddrName", ""),
                    poi.get("middleAddrName", ""),
                    poi.get("lowerAddrName", ""),
                    poi.get("detailAddrName", ""),
                ]
                if part
            ),
            "lat": float(poi.get("frontLat")),
            "lon": float(poi.get("frontLon")),
            "radius_km": float(poi.get("radius") or 0),
            "park_flag": str(poi.get("parkFlag", "")),
            "locked": False,
            "replaceable": True,
        }

    def _is_valid_place(self, place):
        return (
            bool(place["name"])
            and not any(keyword in place["name"] for keyword in EXCLUDE_NAME_KEYWORDS)
        )

    def _is_in_gangneung_prototype_bounds(self, place):
        lat = float(place.get("lat", 0))
        lon = float(place.get("lon", 0))
        return (
            GANGNEUNG_PROTOTYPE_BOUNDS["min_lat"] <= lat <= GANGNEUNG_PROTOTYPE_BOUNDS["max_lat"]
            and GANGNEUNG_PROTOTYPE_BOUNDS["min_lon"] <= lon <= GANGNEUNG_PROTOTYPE_BOUNDS["max_lon"]
        )

    def _dedupe_places(self, places):
        seen = set()
        result = []
        for place in places:
            key = (normalize_name(place["name"]), round(place["lat"], 5), round(place["lon"], 5))
            if key in seen:
                continue
            seen.add(key)
            result.append(place)
        return result

    def _build_course_candidates(
        self,
        start,
        foods,
        cafes,
        activities,
        finishes,
        max_candidates,
        min_start_food_m=50,
        min_food_cafe_m=50,
        min_activity_finish_m=50,
    ):
        candidates = []
        for food, cafe, activity, finish in itertools.product(foods, cafes, activities, finishes):
            ids = {food["id"], cafe["id"], activity["id"], finish["id"]}
            names = {
                normalize_name(food["name"]),
                normalize_name(cafe["name"]),
                normalize_name(activity["name"]),
                normalize_name(finish["name"]),
            }
            if len(ids) < 4 or len(names) < 4:
                continue
            if haversine_m(start["lat"], start["lon"], food["lat"], food["lon"]) < min_start_food_m:
                continue
            if haversine_m(food["lat"], food["lon"], cafe["lat"], cafe["lon"]) < min_food_cafe_m:
                continue
            if haversine_m(activity["lat"], activity["lon"], finish["lat"], finish["lon"]) < min_activity_finish_m:
                continue
            places = [food, cafe, activity, finish]
            candidates.append(
                {
                    "places": places,
                    "approx_distance_m": self._approximate_course_distance(start, places),
                }
            )

        candidates.sort(key=lambda item: item["approx_distance_m"])
        return self._diversify_by_activity(candidates, max_candidates)

    def _diversify_by_activity(self, candidates, max_candidates):
        grouped = {}
        for candidate in candidates:
            activity = next(
                (place for place in candidate["places"] if "액티비티" in place.get("category", "") or place.get("category") == "문화/전시"),
                candidate["places"][-1],
            )
            activity_id = activity["id"]
            grouped.setdefault(activity_id, []).append(candidate)

        diversified = []
        groups = list(grouped.values())
        while groups and len(diversified) < max_candidates:
            next_groups = []
            for group in groups:
                if group and len(diversified) < max_candidates:
                    diversified.append(group.pop(0))
                if group:
                    next_groups.append(group)
            groups = next_groups
        return diversified

    def _approximate_course_distance(self, start, places):
        course_places = [start] + list(places)
        return sum(
            haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
            for a, b in zip(course_places, course_places[1:])
        )

    def _estimate_route(self, places, transport):
        legs = []
        total_distance_m = 0
        total_time_sec = 0

        for start, end in zip(places, places[1:]):
            straight_distance_m = haversine_m(start["lat"], start["lon"], end["lat"], end["lon"])

            if transport == "walk":
                estimated_distance_m = int(straight_distance_m * 1.3)
                estimated_time_sec = int((estimated_distance_m / 4000) * 3600)
                leg_mode = "walk"
            elif transport == "transit":
                if straight_distance_m <= settings.transit_walk_threshold_m:
                    estimated_distance_m = int(straight_distance_m * 1.3)
                    estimated_time_sec = int((estimated_distance_m / 4000) * 3600)
                    leg_mode = "walk"
                else:
                    estimated_distance_m = int(straight_distance_m * 1.35)
                    estimated_time_sec = int((estimated_distance_m / 18000) * 3600) + 8 * 60
                    leg_mode = "transit"
            else:
                estimated_distance_m = int(straight_distance_m * 1.5)
                estimated_time_sec = int((estimated_distance_m / 25000) * 3600)
                leg_mode = "car"

            total_distance_m += estimated_distance_m
            total_time_sec += estimated_time_sec
            legs.append(
                {
                    "from": start["name"],
                    "to": end["name"],
                    "distance_m": estimated_distance_m,
                    "time_sec": estimated_time_sec,
                    "mode": leg_mode,
                    "estimated": True,
                }
            )

        return {
            "type": f"estimated_{transport}",
            "legs": legs,
            "total_distance_m": total_distance_m,
            "total_time_sec": total_time_sec,
            "api_call_count": 0,
            "path": self._places_to_path(places),
            **self._transportation_budget(legs, transport),
        }

    def _route_walk(self, places):
        legs = []
        path = []
        api_call_count = 0
        for start, end in zip(places, places[1:]):
            if haversine_m(start["lat"], start["lon"], end["lat"], end["lon"]) < 5:
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": 0,
                        "time_sec": 0,
                        "mode": "walk",
                        "estimated": False,
                    }
                )
                continue
            data, _ = self.tmap.route_pedestrian(start, end)
            api_call_count += 1
            summary = summarize_route_features(data)
            path = self._append_path(path, self._extract_route_path(data))
            legs.append(
                {
                    "from": start["name"],
                    "to": end["name"],
                    "distance_m": summary["total_distance_m"],
                    "time_sec": summary["total_time_sec"],
                    "mode": "walk",
                    "estimated": False,
                }
            )
        return {
            "type": "walk_segmented",
            "legs": legs,
            "total_distance_m": sum(leg["distance_m"] for leg in legs),
            "total_time_sec": sum(leg["time_sec"] for leg in legs),
            "api_call_count": api_call_count,
            "path": path or self._places_to_path(places),
            **self._transportation_budget(legs, "walk"),
        }

    def _route_transit_mixed(self, places):
        legs = []
        path = []
        api_call_count = 0
        transit_fallback_used = False

        for start, end in zip(places, places[1:]):
            straight_distance_m = haversine_m(start["lat"], start["lon"], end["lat"], end["lon"])
            if straight_distance_m < 5:
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": 0,
                        "time_sec": 0,
                        "mode": "walk",
                        "estimated": False,
                    }
                )
                continue

            if straight_distance_m <= settings.transit_walk_threshold_m:
                data, _ = self.tmap.route_pedestrian(start, end)
                api_call_count += 1
                summary = summarize_route_features(data)
                path = self._append_path(path, self._extract_route_path(data))
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": summary["total_distance_m"],
                        "time_sec": summary["total_time_sec"],
                        "mode": "walk",
                        "estimated": False,
                    }
                )
                continue

            region_label = self._infer_region_label([start, end])
            try:
                transit_route = self.odsay.find_route(start, end)
                path = self._append_path(path, transit_route["path"])
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": transit_route["total_distance_m"],
                        "time_sec": transit_route["total_time_sec"],
                        "mode": "transit",
                        "estimated": False,
                        "region_label": region_label,
                        "payment_won": transit_route.get("payment_won", 0),
                        "source": transit_route.get("source", "odsay"),
                        "instructions": transit_route["instructions"],
                    }
                )
                continue
            except Exception:
                pass

            try:
                transit_route = self._route_tmap_transit(start, end)
                api_call_count += 1
                path = self._append_path(path, transit_route["path"])
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": transit_route["total_distance_m"],
                        "time_sec": transit_route["total_time_sec"],
                        "mode": "transit",
                        "estimated": False,
                        "region_label": region_label,
                        "payment_won": transit_route.get("payment_won", 0),
                        "source": transit_route.get("source", "tmap_transit"),
                        "instructions": transit_route["instructions"],
                    }
                )
                continue
            except Exception:
                pass

            try:
                bus_route = self.buses.find_route(
                    start,
                    end,
                    max_walk_m=settings.transit_bus_stop_walk_limit_m,
                )
                if not bus_route:
                    bus_route = self._estimate_public_transit_leg(start, end, straight_distance_m)
                path = self._append_path(path, bus_route["path"])
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": bus_route["total_distance_m"],
                        "time_sec": bus_route["total_time_sec"],
                        "mode": "transit",
                        "estimated": bool(bus_route.get("estimated")),
                        "region_label": region_label,
                        "instructions": bus_route["instructions"],
                    }
                )
            except (RuntimeError, KeyError, TypeError, ValueError, sqlite3.Error):
                transit_fallback_used = True
                public_route = self._estimate_public_transit_leg(start, end, straight_distance_m)
                path = self._append_path(path, self._places_to_path([start, end]))
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": public_route["total_distance_m"],
                        "time_sec": public_route["total_time_sec"],
                        "mode": "transit",
                        "estimated": True,
                        "region_label": region_label,
                        "taxi_fare_estimate_won": None,
                        "taxi_recommended": False,
                        "taxi_required": False,
                        "taxi_reason": "",
                        "instructions": public_route["instructions"],
                    }
                )

        taxi_option_total_won = sum(
            leg.get("taxi_fare_estimate_won") or 0 for leg in legs if leg.get("taxi_required")
        )
        taxi_return_estimate_won = None
        taxi_round_trip_estimate_won = None
        taxi_round_trip_recommended = False
        if taxi_option_total_won:
            return_distance_m = haversine_m(
                places[-1]["lat"], places[-1]["lon"], places[0]["lat"], places[0]["lon"]
            ) * 1.35
            taxi_return_estimate_won = self._estimate_taxi_fare(return_distance_m, [places[-1], places[0]])
            taxi_round_trip_estimate_won = taxi_option_total_won + taxi_return_estimate_won
            taxi_round_trip_recommended = (
                taxi_round_trip_estimate_won <= settings.taxi_round_trip_recommendation_limit_won
            )

        return {
            "type": "transit_mixed",
            "legs": legs,
            "total_distance_m": sum(leg["distance_m"] for leg in legs),
            "total_time_sec": sum(leg["time_sec"] for leg in legs),
            "api_call_count": api_call_count,
            "path": path or self._places_to_path(places),
            "transit_fallback_used": transit_fallback_used,
            "taxi_option_total_won": taxi_option_total_won,
            "taxi_return_estimate_won": taxi_return_estimate_won,
            "taxi_round_trip_estimate_won": taxi_round_trip_estimate_won,
            "taxi_round_trip_recommended": taxi_round_trip_recommended,
            **self._transportation_budget(legs, "transit"),
        }

    def _route_tmap_transit(self, start, end):
        data, _ = self.tmap.route_transit(start, end)
        itineraries = data.get("metaData", {}).get("plan", {}).get("itineraries") or []
        if not itineraries:
            raise RuntimeError("TMAP 대중교통 경로가 없습니다.")

        itinerary = min(itineraries, key=lambda item: int(item.get("totalTime") or 999999))
        fare = (
            itinerary.get("fare", {})
            .get("regular", {})
            .get("totalFare", 0)
        )
        instructions = []
        path = []
        total_distance_m = 0

        for leg in itinerary.get("legs") or []:
            mode = str(leg.get("mode") or "").upper()
            distance_m = int(float(leg.get("distance") or 0))
            time_sec = int(float(leg.get("sectionTime") or 0))
            total_distance_m += distance_m

            if mode == "WALK":
                steps = self._tmap_walk_steps(leg)
                leg_path = []
                for step in steps:
                    leg_path = self._append_path(leg_path, step.get("path", []))
                if not leg_path:
                    leg_path = self._tmap_leg_endpoint_path(leg)
                path = self._append_path(path, leg_path)
                instructions.append(
                    {
                        "mode": "walk",
                        "from": self._tmap_node_name(leg.get("start"), "출발지"),
                        "to": self._tmap_node_name(leg.get("end"), "도착지"),
                        "distance_m": distance_m,
                        "time_sec": time_sec,
                        "description": f"도보 {distance_m:,}m 이동",
                        "steps": [
                            {
                                "description": step["description"],
                                "distance_m": step["distance_m"],
                                "street_name": step.get("street_name", ""),
                            }
                            for step in steps[:8]
                        ],
                    }
                )
                continue

            if mode in {"BUS", "SUBWAY"}:
                transit_mode = "subway" if mode == "SUBWAY" else "bus"
                mode_label = "지하철" if transit_mode == "subway" else "버스"
                route_label = self._tmap_route_label(leg)
                start_name = self._tmap_node_name(leg.get("start"), "출발 정류장")
                end_name = self._tmap_node_name(leg.get("end"), "도착 정류장")
                stations = ((leg.get("passStopList") or {}).get("stations") or [])
                station_count = max(0, len(stations) - 1)
                station_suffix = f" ({station_count}개 정거장)" if station_count else ""
                leg_path = self._parse_linestring((leg.get("passShape") or {}).get("linestring"))
                if not leg_path:
                    leg_path = self._tmap_station_path(stations) or self._tmap_leg_endpoint_path(leg)
                path = self._append_path(path, leg_path)
                instructions.append(
                    {
                        "mode": transit_mode,
                        "route": route_label,
                        "from": start_name,
                        "to": end_name,
                        "boarding_station": start_name,
                        "alighting_station": end_name,
                        "distance_m": distance_m,
                        "time_sec": time_sec,
                        "station_count": station_count,
                        "fare_won": int(fare or 0),
                        "route_color": leg.get("routeColor", ""),
                        "description": f"{start_name}에서 {route_label or mode_label} {mode_label} 탑승 → {end_name} 하차{station_suffix}",
                    }
                )

        if not path:
            raise RuntimeError("TMAP 대중교통 경로 좌표가 없습니다.")

        return {
            "source": "tmap_transit",
            "path": path,
            "total_distance_m": int(itinerary.get("totalDistance") or total_distance_m),
            "total_time_sec": int(itinerary.get("totalTime") or 0),
            "payment_won": int(fare or 0),
            "estimated": False,
            "instructions": instructions,
        }

    def _tmap_walk_steps(self, leg):
        steps = []
        for step in leg.get("steps") or []:
            points = self._parse_linestring(step.get("linestring"))
            description = step.get("description") or "도보 이동"
            steps.append(
                {
                    "description": description,
                    "distance_m": int(float(step.get("distance") or 0)),
                    "street_name": step.get("streetName", ""),
                    "path": points,
                }
            )
        return steps

    def _tmap_route_label(self, leg):
        route = str(leg.get("route") or "").strip()
        if route:
            return route
        lanes = leg.get("Lane") or leg.get("lane") or []
        if isinstance(lanes, dict):
            lanes = [lanes]
        labels = [str(lane.get("route") or "").strip() for lane in lanes if isinstance(lane, dict)]
        labels = [label for label in labels if label]
        return ", ".join(labels[:3])

    def _tmap_node_name(self, node, fallback):
        if isinstance(node, dict):
            return str(node.get("name") or fallback)
        return fallback

    def _tmap_leg_endpoint_path(self, leg):
        points = []
        for key in ("start", "end"):
            node = leg.get(key) or {}
            try:
                points.append({"lat": float(node["lat"]), "lon": float(node["lon"])})
            except (KeyError, TypeError, ValueError):
                continue
        return points

    def _tmap_station_path(self, stations):
        points = []
        for station in stations or []:
            try:
                points.append({"lat": float(station["lat"]), "lon": float(station["lon"])})
            except (KeyError, TypeError, ValueError):
                continue
        return points

    def _estimate_gangneung_taxi_fare(self, distance_m):
        return self._estimate_taxi_fare(distance_m, "강릉")

    def _estimate_taxi_fare(self, distance_m, region_or_places=None):
        region_label = (
            region_or_places
            if isinstance(region_or_places, str)
            else self._infer_region_label(region_or_places or [])
        )
        profile = self._taxi_fare_profile(region_label)
        distance_m = max(0, float(distance_m))
        fare_won = profile["base_won"]
        if distance_m <= profile["base_m"]:
            return fare_won

        fare_won += math.ceil((distance_m - profile["base_m"]) / profile["unit_m"]) * profile["unit_won"]
        return int(fare_won)

    def _taxi_fare_profile(self, region_label):
        for keyword, profile in TAXI_FARE_PROFILES.items():
            if keyword in (region_label or ""):
                return profile
        return DEFAULT_TAXI_FARE_PROFILE

    def _infer_region_label(self, places):
        text = " ".join(
            str(place.get(key, ""))
            for place in places or []
            for key in ("name", "address", "region", "area_label")
            if isinstance(place, dict)
        )
        for keyword in REGION_KEYWORDS:
            if keyword in text:
                return keyword

        points = [
            (float(place["lat"]), float(place["lon"]))
            for place in places or []
            if isinstance(place, dict) and place.get("lat") is not None and place.get("lon") is not None
        ]
        if not points:
            return ""
        lat = sum(point[0] for point in points) / len(points)
        lon = sum(point[1] for point in points) / len(points)
        if 37.40 <= lat <= 37.72 and 126.75 <= lon <= 127.20:
            return "서울"
        if 37.00 <= lat <= 37.90 and 126.35 <= lon <= 127.85:
            return "경기"
        if 37.35 <= lat <= 37.65 and 126.55 <= lon <= 126.85:
            return "인천"
        if 35.00 <= lat <= 35.40 and 128.75 <= lon <= 129.35:
            return "부산"
        if 35.75 <= lat <= 36.05 and 128.35 <= lon <= 128.80:
            return "대구"
        if 35.05 <= lat <= 35.30 and 126.70 <= lon <= 127.05:
            return "광주"
        if 36.20 <= lat <= 36.55 and 127.20 <= lon <= 127.60:
            return "대전"
        if 35.35 <= lat <= 35.75 and 129.00 <= lon <= 129.55:
            return "울산"
        if 33.10 <= lat <= 33.60 and 126.10 <= lon <= 126.95:
            return "제주"
        if 37.54 <= lat <= 37.96 and 128.68 <= lon <= 129.12:
            return "강릉"
        return ""

    def _region_has_subway(self, region_label):
        return any(keyword in (region_label or "") for keyword in SUBWAY_REGION_KEYWORDS)

    def _transit_card_fare(self, region_label):
        for keyword, fare_won in TRANSIT_CARD_FARES.items():
            if keyword in (region_label or ""):
                return fare_won
        return DEFAULT_TRANSIT_CARD_FARE_WON

    def _estimate_public_transit_leg(self, start, end, straight_distance_m):
        region_label = self._infer_region_label([start, end])
        estimated_distance_m = int(straight_distance_m * 1.35)
        uses_subway = self._region_has_subway(region_label) and straight_distance_m >= 2500
        main_mode = "subway" if uses_subway else "bus"
        main_label = "지하철" if uses_subway else "버스"
        speed_kmh = 28 if uses_subway else 18
        wait_sec = 9 * 60 if uses_subway else 7 * 60
        estimated_time_sec = int((estimated_distance_m / (speed_kmh * 1000)) * 3600) + wait_sec
        fare_won = self._transit_card_fare(region_label)
        instructions = [
            {
                "mode": "walk",
                "from": start["name"],
                "to": f"{main_label} 승차 위치 확인 필요",
                "description": f"{start['name']}에서 {main_label} 승차 위치까지 이동",
            },
            {
                "mode": main_mode,
                "from": f"{main_label} 승차 위치 확인 필요",
                "to": f"{end['name']} 인근 하차 위치 확인 필요",
                "description": f"{main_label}로 {end['name']} 방향 이동",
                "fare_won": fare_won,
                "estimated": True,
            },
            {
                "mode": "walk",
                "from": f"{end['name']} 인근 하차 위치 확인 필요",
                "to": end["name"],
                "description": f"하차 후 {end['name']}까지 이동",
            },
        ]
        return {
            "path": self._places_to_path([start, end]),
            "total_distance_m": estimated_distance_m,
            "total_time_sec": estimated_time_sec,
            "estimated": True,
            "instructions": instructions,
        }

    def _estimate_course_budget(self, places, route, transport):
        items = []
        for place in places:
            stored_price = self.prices.find_price(place.get("name", ""))
            if stored_price:
                price_won = stored_price["price_won"]
                price_type = stored_price["price_type"]
                source_url = stored_price["source_url"]
                price_label = stored_price["price_label"]
            else:
                price_won = ESTIMATED_BUDGET_WON_BY_CATEGORY.get(place.get("category", ""), 0)
                price_type = "estimated"
                source_url = ""
                price_label = "카테고리 평균 예상값"
            items.append(
                {
                    "place_name": place.get("name", ""),
                    "category": place.get("category", ""),
                    "price_won": price_won,
                    "price_type": price_type,
                    "price_label": price_label,
                    "source_url": source_url,
                }
            )
        place_total_won = sum(item["price_won"] for item in items)
        transportation_total_won = self._transportation_budget(route.get("legs", []), transport)[
            "transportation_budget_won"
        ]
        total_won = place_total_won + transportation_total_won
        return {
            "total_won": int(round(total_won / 1000) * 1000),
            "place_total_won": int(round(place_total_won / 1000) * 1000),
            "transportation_total_won": transportation_total_won,
            "items": items,
            "has_actual_prices": any(item["price_type"] == "actual" for item in items),
        }

    def _transportation_budget(self, legs, transport):
        if transport == "transit":
            transit_leg_count = sum(
                1
                for leg in legs
                if leg.get("mode") in {"transit", "bus", "subway"}
                or any(
                    step.get("mode") in {"transit", "bus", "subway"}
                    for step in leg.get("instructions", [])
                    if isinstance(step, dict)
                )
            )
            taxi_total_won = sum(
                leg.get("taxi_fare_estimate_won") or 0 for leg in legs if leg.get("taxi_required")
            )
            transit_total_won = 0
            for leg in legs:
                if leg.get("payment_won"):
                    transit_total_won += int(leg.get("payment_won") or 0)
                    continue
                if leg.get("mode") in {"transit", "bus", "subway"}:
                    region_label = leg.get("region_label") or self._infer_region_label(
                        [{"name": leg.get("from", "")}, {"name": leg.get("to", "")}]
                    )
                    transit_total_won += self._transit_card_fare(region_label)
            return {
                "transportation_budget_won": transit_total_won + taxi_total_won,
                "transportation_budget_label": (
                    f"버스/지하철 교통카드 약 {int(transit_total_won / max(transit_leg_count, 1)):,}원"
                    if transit_leg_count
                    else "대중교통 이동"
                ),
            }
        if transport == "car":
            distance_m = sum(leg.get("distance_m", 0) for leg in legs)
            operating_cost_won = int(
                round((distance_m / 1000) * settings.car_operating_cost_won_per_km / 100) * 100
            )
            return {
                "transportation_budget_won": operating_cost_won,
                "transportation_budget_label": "자차 연료비 근사값",
            }
        return {
            "transportation_budget_won": 0,
            "transportation_budget_label": "도보 이동",
        }

    def _route_car(self, places):
        legs = []
        path = []
        api_call_count = 0

        for start, end in zip(places, places[1:]):
            if haversine_m(start["lat"], start["lon"], end["lat"], end["lon"]) < 5:
                legs.append(
                    {
                        "from": start["name"],
                        "to": end["name"],
                        "distance_m": 0,
                        "time_sec": 0,
                        "mode": "car",
                        "estimated": False,
                    }
                )
                continue

            data, _ = self.tmap.route_car(start, end)
            api_call_count += 1
            summary = summarize_route_features(data)
            path = self._append_path(path, self._extract_route_path(data))
            legs.append(
                {
                    "from": start["name"],
                    "to": end["name"],
                    "distance_m": summary["total_distance_m"],
                    "time_sec": summary["total_time_sec"],
                    "mode": "car",
                    "estimated": False,
                }
            )

        return {
            "type": "car_segmented",
            "legs": legs,
            "total_distance_m": sum(leg["distance_m"] for leg in legs),
            "total_time_sec": sum(leg["time_sec"] for leg in legs),
            "api_call_count": api_call_count,
            "path": path or self._places_to_path(places),
            **self._transportation_budget(legs, "car"),
        }

    def _extract_route_path(self, data):
        path = []
        for feature in data.get("features", []):
            geometry = feature.get("geometry", {})
            coordinates = geometry.get("coordinates", [])
            geometry_type = geometry.get("type")

            if geometry_type == "LineString":
                path = self._append_path(path, self._coordinates_to_points(coordinates))
            elif geometry_type == "MultiLineString":
                for line in coordinates:
                    path = self._append_path(path, self._coordinates_to_points(line))

        return path

    def _parse_linestring(self, linestring):
        points = []
        for pair in (linestring or "").split():
            try:
                lon, lat = pair.split(",", 1)
                points.append({"lat": float(lat), "lon": float(lon)})
            except (TypeError, ValueError):
                continue
        return points

    def _coordinates_to_points(self, coordinates):
        points = []
        for coordinate in coordinates:
            if not isinstance(coordinate, list | tuple) or len(coordinate) < 2:
                continue
            lon, lat = coordinate[0], coordinate[1]
            points.append({"lat": float(lat), "lon": float(lon)})
        return points

    def _append_path(self, base_path, next_path):
        if not next_path:
            return base_path
        if not base_path:
            return list(next_path)
        merged = list(base_path)
        for point in next_path:
            last = merged[-1]
            if abs(last["lat"] - point["lat"]) < 0.0000001 and abs(last["lon"] - point["lon"]) < 0.0000001:
                continue
            merged.append(point)
        return merged

    def _places_to_path(self, places):
        return [{"lat": place["lat"], "lon": place["lon"]} for place in places]

    def _score_course(self, route, transport, places):
        total_minutes = route["total_time_sec"] / 60
        score = 90 - total_minutes * 0.45

        if transport == "walk":
            if total_minutes <= 45:
                score += 4
            if total_minutes > 90:
                score -= 12
            for leg in route.get("legs", []):
                if leg["time_sec"] > 30 * 60:
                    score -= 8
        elif transport == "transit":
            if total_minutes <= 45:
                score += 4
            transit_legs = sum(1 for leg in route.get("legs", []) if leg.get("mode") == "transit")
            score -= max(0, transit_legs - 2) * 2
        else:
            if total_minutes <= 30:
                score += 2
            parking_count = sum(1 for place in places if str(place.get("park_flag")) == "1")
            score += min(parking_count * 0.5, 3)

        return round(score, 2)

    def _recommendation_score(self, route, transport, places):
        score = self._score_course(route, transport, places) + self._local_cafe_bonus(places)
        score += min(
            sum(math.log10(1 + int(place.get("google_review_count") or 0)) for place in places) * 1.5,
            12,
        )
        return round(max(0, min(score, 100)), 2)

    def _local_cafe_bonus(self, places):
        cafe = next((place for place in places if place.get("category") == "\uce74\ud398"), None)
        if not cafe:
            return 0
        normalized_name = normalize_name(cafe["name"])
        if any(normalize_name(keyword) in normalized_name for keyword in COMMON_CAFE_NAME_KEYWORDS):
            return 0
        return 6

    def _prioritize_local_cafes(self, places):
        local_cafes = []
        common_cafes = []
        for place in places:
            normalized_name = normalize_name(place["name"])
            target = (
                common_cafes
                if any(normalize_name(keyword) in normalized_name for keyword in COMMON_CAFE_NAME_KEYWORDS)
                else local_cafes
            )
            target.append(place)
        return local_cafes + common_cafes

    def _interleave_places_by_source(self, places, source_categories):
        groups = {
            source_category: [
                place for place in places if place.get("source_category") == source_category
            ]
            for source_category in source_categories
        }
        interleaved = []
        while any(groups.values()):
            for source_category in source_categories:
                if groups[source_category]:
                    interleaved.append(groups[source_category].pop(0))
        return self._dedupe_places(interleaved)

    def _sort_places_by_distance(self, center, places):
        sorted_places = []
        for place in places:
            distance_m = round(
                haversine_m(center["lat"], center["lon"], place["lat"], place["lon"])
            )
            sorted_places.append({**place, "distance_m": distance_m})
        return sorted(sorted_places, key=lambda place: place["distance_m"])

    def _shuffle_nearby_ranks(self, places, spread=2.5):
        """인기 순서를 존중하되 비슷한 순위(±2위 안팎)끼리는 매번 자리를 조금씩 바꾼다.
        리뷰 수를 반영하되 절대적이지 않게 — 같은 조건으로 다시 추천받아도 조합이 달라진다."""
        return [
            place
            for _, place in sorted(
                enumerate(places), key=lambda pair: pair[0] + random.uniform(0, spread)
            )
        ]

    def _course_order_key(self, course):
        """코스 정렬 기준(인기순위·리뷰합·점수)에 작은 무작위를 섞어
        근사치 코스끼리는 실행마다 순서가 바뀔 수 있게 한다."""
        best_rank = min(
            (int(place.get("naver_popularity_rank") or 999) for place in course["places"]), default=999
        )
        review_sum = sum(int(place.get("google_review_count") or 0) for place in course["places"])
        return (
            best_rank + random.uniform(0, 1.2),
            -(review_sum * random.uniform(0.85, 1.15)),
            -(course["score"] + random.uniform(-1.5, 1.5)),
        )

    def _select_diverse_courses(self, courses, course_count):
        """카드 간 장소 중복을 최소화해 고른다. 먼저 앞 카드들과 장소가 하나도 겹치지
        않는 코스로 채우고, 후보가 모자라면(장소가 한정된 지역·좁힌 조건) 허용 겹침
        수를 1개씩 늘려 가며 채운다 — 코스 개수는 기존과 동일하게 보장된다."""

        def course_place_names(course):
            return {
                normalize_name(place["name"])
                for place in course["places"]
                if place.get("category") != "시작"
            }

        selected = []
        selected_ids = set()
        used_names = set()
        max_overlap = max((len(course_place_names(course)) for course in courses), default=0)
        for allowed_overlap in range(0, max_overlap + 1):
            for course in courses:
                if id(course) in selected_ids:
                    continue
                names = course_place_names(course)
                if len(names & used_names) > allowed_overlap:
                    continue
                selected.append(course)
                selected_ids.add(id(course))
                used_names |= names
                if len(selected) >= course_count:
                    return selected
        return selected

    def _course_activity_name(self, course):
        activity = next(
            (
                place
                for place in course["places"]
                if "\uc561\ud2f0\ube44\ud2f0" in place.get("category", "") or place.get("category") == "\ubb38\ud654/\uc804\uc2dc"
            ),
            course["places"][-1],
        )
        return normalize_name(activity["name"])

    def _course_cafe_name(self, course):
        cafe = next(
            (place for place in course["places"] if place.get("category") == "\uce74\ud398"),
            None,
        )
        return normalize_name(cafe["name"]) if cafe else ""

    def _course_area_name(self, course):
        if any("\uc548\ubaa9" in normalize_name(place["name"]) for place in course["places"]):
            return "\uc548\ubaa9"
        return normalize_name(course["places"][-1]["name"])

    def _serialize_places(self, places):
        return [
            {
                "order": order,
                "id": place["id"],
                "name": place["name"],
                "category": place["category"],
                "lat": place["lat"],
                "lon": place["lon"],
                "locked": bool(place.get("locked", False)),
                "replaceable": bool(place.get("replaceable", False)),
                "source_category": place.get("source_category", ""),
                "park_flag": place.get("park_flag", ""),
                "naver_popular": bool(place.get("naver_popular", False)),
                "naver_popularity_rank": place.get("naver_popularity_rank"),
                "google_rating": place.get("google_rating"),
                "google_review_count": place.get("google_review_count"),
                "google_maps_uri": place.get("google_maps_uri", ""),
                "opening_hours": place.get("opening_hours") or [],
                "open_now": place.get("open_now"),
            }
            for order, place in enumerate(places, start=1)
        ]

    def _course_title(self, places, transport):
        labels = {"walk": "도보", "transit": "대중교통", "car": "자차"}
        label = labels[transport]
        return f"{label} 추천 코스 - {places[-1]['name']}까지"

    def _make_reason(self, transport, route, places):
        minutes = round(route["total_time_sec"] / 60)
        distance_km = round(route["total_distance_m"] / 1000, 2)
        names = " → ".join(place["name"] for place in places)
        labels = {"walk": "걸어서", "transit": "도보와 대중교통으로", "car": "차로"}
        label = labels[transport]
        return f"{names}를 {label} 연결한 코스입니다. 총 이동은 약 {distance_km}km, {minutes}분입니다."
