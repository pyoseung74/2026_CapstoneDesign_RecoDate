# ============================================================
# 기상청 공공데이터 날씨 클라이언트
# - 단기예보(getVilageFcst): 오늘~3일 뒤, 격자(nx, ny) 기반 시간별 강수/기온
# - 중기예보(getMidLandFcst/getMidTa): 4~7일 뒤, 지역코드(regId) 기반 오전/오후 강수 + 최고기온
# 추천 서비스가 여행 날짜의 비/더위를 코스 구성(실내·야외)에 반영할 때 사용한다.
# ============================================================

import json
import math
import time
from datetime import datetime, timedelta, timezone
from urllib import parse, request

from ..config import settings

KST = timezone(timedelta(hours=9))
WEATHER_CACHE_TTL_SECONDS = 1800
_WEATHER_CACHE = {}

SHORT_FCST_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
MID_LAND_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst"
MID_TEMP_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa"

# 중기예보 지역코드: 시/도 단위 매핑 (사용자 합의: 가볍게 하드코딩)
# land = 중기육상예보(날씨 상태), temp = 중기기온예보(대표 도시)
MID_REGION_CODES = {
    "11": {"land": "11B00000", "temp": "11B10101"},  # 서울
    "26": {"land": "11H20000", "temp": "11H20201"},  # 부산
    "27": {"land": "11H10000", "temp": "11H10701"},  # 대구
    "28": {"land": "11B00000", "temp": "11B20201"},  # 인천
    "29": {"land": "11F20000", "temp": "11F20501"},  # 광주
    "30": {"land": "11C20000", "temp": "11C20401"},  # 대전
    "31": {"land": "11H20000", "temp": "11H20101"},  # 울산
    "36": {"land": "11C20000", "temp": "11C20404"},  # 세종
    "41": {"land": "11B00000", "temp": "11B20601"},  # 경기(수원)
    "51": {"land": "11D10000", "temp": "11D10301"},  # 강원 영서(춘천) — 영동은 아래에서 보정
    "43": {"land": "11C10000", "temp": "11C10301"},  # 충북(청주)
    "44": {"land": "11C20000", "temp": "11C20301"},  # 충남(천안)
    "52": {"land": "11F10000", "temp": "11F10201"},  # 전북(전주)
    "46": {"land": "11F20000", "temp": "11F20401"},  # 전남(목포)
    "47": {"land": "11H10000", "temp": "11H10501"},  # 경북(안동)
    "48": {"land": "11H20000", "temp": "11H20301"},  # 경남(창원)
    "50": {"land": "11G00000", "temp": "11G00201"},  # 제주
}
GANGWON_YEONGDONG = {"land": "11D20000", "temp": "11D20501"}  # 강원 영동(강릉)

# 시/도 중심 좌표 — 시작 좌표에서 가장 가까운 시/도를 찾을 때 사용
PROVINCE_CENTERS = {
    "11": (37.5650, 126.9749),
    "26": (35.1798, 129.0750),
    "27": (35.8714, 128.6014),
    "28": (37.4563, 126.7052),
    "29": (35.1601, 126.8514),
    "30": (36.3504, 127.3845),
    "31": (35.5384, 129.3114),
    "36": (36.4800, 127.2890),
    "41": (37.2752, 127.0095),
    "51": (37.8228, 128.1555),
    "43": (36.6357, 127.4913),
    "44": (36.6588, 126.6728),
    "52": (35.8202, 127.1088),
    "46": (34.8161, 126.4629),
    "47": (36.5760, 128.5056),
    "48": (35.2383, 128.6924),
    "50": (33.4890, 126.4983),
}


def latlon_to_grid(lat, lon):
    """위경도를 기상청 단기예보 격자 좌표(nx, ny)로 변환한다. (LCC DFS 표준 공식)"""
    RE = 6371.00877
    GRID = 5.0
    SLAT1 = 30.0
    SLAT2 = 60.0
    OLON = 126.0
    OLAT = 38.0
    XO = 43
    YO = 136

    degrad = math.pi / 180.0
    re = RE / GRID
    slat1 = SLAT1 * degrad
    slat2 = SLAT2 * degrad
    olon = OLON * degrad
    olat = OLAT * degrad

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = math.pow(sf, sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / math.pow(ro, sn)

    ra = math.tan(math.pi * 0.25 + float(lat) * degrad * 0.5)
    ra = re * sf / math.pow(ra, sn)
    theta = float(lon) * degrad - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn
    nx = int(ra * math.sin(theta) + XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + YO + 0.5)
    return nx, ny


def resolve_mid_region_codes(lat, lon):
    """좌표에서 가장 가까운 시/도의 중기예보 지역코드를 찾는다. 강원은 경도로 영서/영동을 나눈다."""
    best_key = None
    best_dist = None
    for key, (clat, clon) in PROVINCE_CENTERS.items():
        dist = (float(lat) - clat) ** 2 + (float(lon) - clon) ** 2
        if best_dist is None or dist < best_dist:
            best_dist = dist
            best_key = key
    if best_key == "51" and float(lon) >= 128.4:
        return GANGWON_YEONGDONG
    return MID_REGION_CODES.get(best_key, MID_REGION_CODES["11"])


class WeatherClient:
    def __init__(self):
        self.service_key = settings.kma_service_key

    def _fetch_items(self, url, params):
        if not self.service_key:
            return None
        query = parse.urlencode({"serviceKey": self.service_key, "dataType": "JSON", **params})
        req = request.Request(f"{url}?{query}", method="GET")
        with request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
        body = data.get("response", {}).get("body", {})
        items = body.get("items", {})
        if isinstance(items, dict):
            items = items.get("item", [])
        return items or []

    def _cached(self, key, loader):
        cached = _WEATHER_CACHE.get(key)
        now = time.time()
        if cached and now - cached["fetched_at"] < WEATHER_CACHE_TTL_SECONDS:
            return cached["value"]
        value = loader()
        _WEATHER_CACHE[key] = {"fetched_at": now, "value": value}
        return value

    # ------------------- 단기예보 (오늘 ~ 3일 뒤) -------------------

    def _short_base_datetime(self):
        """가장 최근 단기예보 발표(02/05/08/11/14/17/20/23시, 발표 후 약 1시간 여유)를 고른다."""
        now = datetime.now(KST) - timedelta(hours=1)
        base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
        candidates = [h for h in base_hours if h <= now.hour]
        if candidates:
            base_hour = max(candidates)
            base_date = now.strftime("%Y%m%d")
        else:
            base_hour = 23
            base_date = (now - timedelta(days=1)).strftime("%Y%m%d")
        return base_date, f"{base_hour:02d}00"

    def get_short_forecast(self, lat, lon, target_date):
        """target_date(YYYY-MM-DD)의 시간별 {hour: {rain, pop, tmp}}를 반환한다. 실패/데이터 없음이면 None."""
        nx, ny = latlon_to_grid(lat, lon)
        base_date, base_time = self._short_base_datetime()
        cache_key = ("short", nx, ny, base_date, base_time)

        def load():
            return self._fetch_items(
                SHORT_FCST_URL,
                {
                    "numOfRows": 1000,
                    "pageNo": 1,
                    "base_date": base_date,
                    "base_time": base_time,
                    "nx": nx,
                    "ny": ny,
                },
            )

        try:
            items = self._cached(cache_key, load)
        except Exception:
            return None
        if not items:
            return None
        wanted = str(target_date).replace("-", "")
        hourly = {}
        for item in items:
            if item.get("fcstDate") != wanted:
                continue
            hour = int(str(item.get("fcstTime", "0000"))[:2])
            slot = hourly.setdefault(hour, {"rain": False, "pop": 0, "tmp": None})
            category = item.get("category")
            value = item.get("fcstValue")
            if category == "PTY" and str(value) not in ("0", "", "None"):
                slot["rain"] = True
            elif category == "POP":
                try:
                    slot["pop"] = max(slot["pop"], int(value))
                except (TypeError, ValueError):
                    pass
            elif category == "TMP":
                try:
                    slot["tmp"] = int(float(value))
                except (TypeError, ValueError):
                    pass
        if not hourly:
            return None
        for slot in hourly.values():
            if slot["pop"] >= 70:
                slot["rain"] = True
        return hourly

    # ------------------- 중기예보 (4 ~ 7일 뒤) -------------------

    def _mid_tmfc(self):
        """중기예보 발표시각(06시/18시) 중 가장 최근 것을 고른다."""
        now = datetime.now(KST)
        if now.hour >= 19:
            return now.strftime("%Y%m%d") + "1800"
        if now.hour >= 7:
            return now.strftime("%Y%m%d") + "0600"
        return (now - timedelta(days=1)).strftime("%Y%m%d") + "1800"

    def get_mid_forecast(self, lat, lon, target_date):
        """target_date의 {am_rain, pm_rain, tmax}를 반환한다. 4~7일 뒤 범위 밖이거나 실패면 None."""
        tmfc = self._mid_tmfc()
        tmfc_date = datetime.strptime(tmfc[:8], "%Y%m%d").date()
        target = datetime.strptime(str(target_date), "%Y-%m-%d").date()
        day_index = (target - tmfc_date).days
        if day_index < 4 or day_index > 7:
            return None
        codes = resolve_mid_region_codes(lat, lon)

        def load_land():
            return self._fetch_items(MID_LAND_URL, {"regId": codes["land"], "tmFc": tmfc})

        def load_temp():
            return self._fetch_items(MID_TEMP_URL, {"regId": codes["temp"], "tmFc": tmfc})

        try:
            land_items = self._cached(("midland", codes["land"], tmfc), load_land)
            temp_items = self._cached(("midtemp", codes["temp"], tmfc), load_temp)
        except Exception:
            return None
        if not land_items:
            return None
        land = land_items[0]
        temp = temp_items[0] if temp_items else {}

        def rain_from(prefix):
            text = str(land.get(f"wf{day_index}{prefix}", "") or "")
            try:
                prob = int(land.get(f"rnSt{day_index}{prefix}", 0) or 0)
            except (TypeError, ValueError):
                prob = 0
            return ("비" in text or "소나기" in text or "눈" in text) or prob >= 70

        tmax = None
        try:
            tmax = int(temp.get(f"taMax{day_index}"))
        except (TypeError, ValueError):
            pass
        return {"am_rain": rain_from("Am"), "pm_rain": rain_from("Pm"), "tmax": tmax}

    # ------------------- 통합 조회 -------------------

    def get_forecast_for_date(self, lat, lon, target_date):
        """여행 날짜에 맞는 예보를 고른다.

        반환: {"kind": "short", "hourly": {...}} 또는 {"kind": "mid", ...} 또는 None(예보 불가)
        """
        try:
            target = datetime.strptime(str(target_date), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return None
        today = datetime.now(KST).date()
        offset = (target - today).days
        if offset < 0 or offset > 7:
            return None
        if offset <= 3:
            hourly = self.get_short_forecast(lat, lon, target_date)
            if hourly:
                return {"kind": "short", "hourly": hourly}
            # 단기 범위 끝자락(+3일)에서 데이터가 비면 중기로도 시도한다.
        mid = self.get_mid_forecast(lat, lon, target_date)
        if mid:
            return {"kind": "mid", **mid}
        return None
