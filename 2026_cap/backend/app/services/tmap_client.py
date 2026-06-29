# ============================================================
# 이 파일은 TMAP API 호출을 담당하는 클라이언트이다.
# POI 통합검색, 주변 카테고리 검색, 보행자 길찾기,
# 자동차 구간별 길찾기, StaticMap 이미지 요청을 공통 방식으로 처리한다.
# ============================================================

import json
from json import JSONDecodeError
import time
from numbers import Number
from urllib import parse, request
from urllib.error import HTTPError

from app.config import settings


class TmapClient:
    base_url = "https://apis.openapi.sk.com"

    def __init__(self):
        if not settings.tmap_app_key:
            raise RuntimeError("TMAP_APP_KEY가 설정되어 있지 않습니다.")
        self.app_key = settings.tmap_app_key

    def get(self, path, params, timeout=20):
        query = parse.urlencode(params)
        url = f"{self.base_url}{path}?{query}"
        req = request.Request(
            url,
            headers={
                "Accept": "application/json",
                "appKey": self.app_key,
            },
            method="GET",
        )
        return self._send(req, timeout=timeout)

    def post(self, path, body, params=None):
        query = parse.urlencode(params or {})
        url = f"{self.base_url}{path}?{query}" if query else f"{self.base_url}{path}"
        encoded_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=encoded_body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "appKey": self.app_key,
            },
            method="POST",
        )
        return self._send(req)

    def _send(self, req, timeout=20):
        start = time.perf_counter()
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        try:
            return json.loads(raw), elapsed_ms
        except JSONDecodeError as exc:
            preview = raw[:120].replace("\n", " ")
            raise RuntimeError(f"TMAP API가 JSON이 아닌 응답을 반환했습니다: {preview}") from exc

    def _send_bytes(self, req):
        start = time.perf_counter()
        with request.urlopen(req, timeout=20) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "image/png")
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        return raw, content_type, elapsed_ms

    def search_pois(self, keyword, count=10, page=1):
        data, elapsed_ms = self.get(
            "/tmap/pois",
            {
                "version": "1",
                "searchKeyword": keyword,
                "searchType": "all",
                "page": str(page),
                "count": str(count),
                "resCoordType": "WGS84GEO",
                "reqCoordType": "WGS84GEO",
                "multiPoint": "N",
                "searchtypCd": "A",
                "poiGroupYn": "N",
            },
            timeout=5,
        )
        return data, elapsed_ms

    def search_around(self, center, category, radius_km, count=15, page=1):
        radius_value = self._format_number(radius_km)
        data, elapsed_ms = self.get(
            "/tmap/pois/search/around",
            {
                "version": "1",
                "centerLon": str(center["lon"]),
                "centerLat": str(center["lat"]),
                "categories": category,
                "page": str(page),
                "count": str(count),
                "radius": radius_value,
                "reqCoordType": "WGS84GEO",
                "resCoordType": "WGS84GEO",
                "multiPoint": "N",
                "sort": "distance",
            },
        )
        return data, elapsed_ms

    def _format_number(self, value):
        if isinstance(value, Number) and float(value).is_integer():
            return str(int(value))
        return str(value)

    def route_pedestrian(self, start, end):
        data, elapsed_ms = self.post(
            "/tmap/routes/pedestrian",
            {
                "startX": str(start["lon"]),
                "startY": str(start["lat"]),
                "endX": str(end["lon"]),
                "endY": str(end["lat"]),
                "startName": start["name"],
                "endName": end["name"],
                "reqCoordType": "WGS84GEO",
                "resCoordType": "WGS84GEO",
            },
            {"version": "1"},
        )
        return data, elapsed_ms

    def route_car(self, start, end):
        data, elapsed_ms = self.post(
            "/tmap/routes",
            {
                "startX": str(start["lon"]),
                "startY": str(start["lat"]),
                "endX": str(end["lon"]),
                "endY": str(end["lat"]),
                "reqCoordType": "WGS84GEO",
                "resCoordType": "WGS84GEO",
                "searchOption": "0",
                "carType": "4",
            },
            {"version": "1"},
        )
        return data, elapsed_ms

    def route_transit(self, start, end):
        data, elapsed_ms = self.post(
            "/transit/routes",
            {
                "startX": str(start["lon"]),
                "startY": str(start["lat"]),
                "endX": str(end["lon"]),
                "endY": str(end["lat"]),
                "lang": 0,
                "format": "json",
                "count": 1,
            },
        )
        return data, elapsed_ms

    def static_map_image(self, lat, lon, zoom=15, width=512, height=512):
        query = parse.urlencode(
            {
                "version": "1",
                "coordType": "WGS84GEO",
                "width": str(width),
                "height": str(height),
                "zoom": str(zoom),
                "format": "PNG",
                "longitude": str(lon),
                "latitude": str(lat),
                "appKey": self.app_key,
            }
        )
        req = request.Request(
            f"{self.base_url}/tmap/staticMap?{query}",
            headers={"Accept": "image/png"},
            method="GET",
        )
        return self._send_bytes(req)


def extract_pois(data):
    pois = data.get("searchPoiInfo", {}).get("pois", {}).get("poi", [])
    if isinstance(pois, dict):
        return [pois]
    return pois or []


def summarize_route_features(data):
    features = data.get("features", [])
    total_distance = None
    total_time = None

    root_properties = data.get("properties") or {}
    if "totalDistance" in root_properties:
        total_distance = int(root_properties.get("totalDistance") or 0)
    if "totalTime" in root_properties:
        total_time = int(root_properties.get("totalTime") or 0)

    for feature in features:
        properties = feature.get("properties", {})
        if total_distance is None and properties.get("totalDistance") is not None:
            total_distance = int(properties.get("totalDistance") or 0)
        if total_time is None and properties.get("totalTime") is not None:
            total_time = int(properties.get("totalTime") or 0)

    if total_distance is None:
        total_distance = sum(int((f.get("properties") or {}).get("distance") or 0) for f in features)
    if total_time is None:
        total_time = sum(int((f.get("properties") or {}).get("time") or 0) for f in features)

    return {
        "total_distance_m": total_distance,
        "total_time_sec": total_time,
        "feature_count": len(features),
    }
