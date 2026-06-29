import json
import math
import re
import time
from urllib import parse
from urllib import request

from app.config import settings


GOOGLE_CACHE_TTL_SECONDS = 300
GOOGLE_PLACE_DETAIL_CACHE_TTL_SECONDS = 300
_GOOGLE_NEARBY_CACHE = {}
_GOOGLE_PHOTO_SEARCH_CACHE = {}


NON_KOREAN_ASIAN_OR_ARABIC_PATTERN = re.compile(
    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0600-\u06ff]"
)


def clean_google_place_name(name):
    name = " ".join(str(name or "").split())
    if not name or not re.search(r"[가-힣]", name):
        return name

    name = NON_KOREAN_ASIAN_OR_ARABIC_PATTERN.sub(" ", name)
    tokens = name.split()
    result = []
    korean_seen = False
    for token in tokens:
        has_korean = bool(re.search(r"[가-힣]", token))
        is_ascii_translation = bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9&'._-]*", token))
        if korean_seen and is_ascii_translation:
            break
        result.append(token)
        korean_seen = korean_seen or has_korean
    return " ".join(result).strip(" -·|/") or " ".join(tokens)


class GooglePlacesClient:
    base_url = "https://places.googleapis.com/v1/places:searchNearby"
    text_search_url = "https://places.googleapis.com/v1/places:searchText"

    def __init__(self):
        self.api_key = settings.google_places_api_key

    def search_nearby(self, center, radius_km, category, included_types, count=20):
        if not self.api_key:
            return []
        cache_key = (
            round(float(center["lat"]), 4),
            round(float(center["lon"]), 4),
            round(float(radius_km), 1),
            category,
            tuple(included_types),
            int(count),
        )
        cached = _GOOGLE_NEARBY_CACHE.get(cache_key)
        now = time.time()
        if cached and now - cached["fetched_at"] < GOOGLE_CACHE_TTL_SECONDS:
            return cached["places"]

        body = json.dumps(
            {
                "includedTypes": included_types,
                "maxResultCount": max(1, min(int(count), 20)),
                "rankPreference": "POPULARITY",
                "languageCode": "ko",
                "regionCode": "KR",
                "locationRestriction": {
                    "circle": {
                        "center": {
                            "latitude": float(center["lat"]),
                            "longitude": float(center["lon"]),
                        },
                        "radius": min(float(radius_km) * 1000, 50000),
                    }
                },
            }
        ).encode("utf-8")
        req = request.Request(
            self.base_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.location,places.primaryType,"
                    "places.rating,places.userRatingCount,places.googleMapsUri,places.photos,"
                    "places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,"
                    "places.regularOpeningHours,places.currentOpeningHours"
                ),
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=3) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return []

        places = [
            {
                "id": f"google_{place['id']}",
                "name": clean_google_place_name(place.get("displayName", {}).get("text", "")),
                "category": self._recodate_category(category, place.get("primaryType", "")),
                "source_category": place.get("primaryType", "Google Places"),
                "lat": float(place.get("location", {}).get("latitude")),
                "lon": float(place.get("location", {}).get("longitude")),
                "park_flag": "",
                "locked": False,
                "replaceable": True,
                "google_place_id": place["id"],
                "google_rating": place.get("rating"),
                "google_review_count": int(place.get("userRatingCount") or 0),
                "google_maps_uri": place.get("googleMapsUri", ""),
                "address": place.get("formattedAddress", ""),
                "phone": place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or "",
                "opening_hours": (
                    place.get("currentOpeningHours", {}).get("weekdayDescriptions")
                    or place.get("regularOpeningHours", {}).get("weekdayDescriptions")
                    or []
                ),
                "open_now": place.get("currentOpeningHours", {}).get("openNow"),
                **self._photo_metadata(place),
            }
            for place in data.get("places", [])
            if place.get("id")
            and place.get("displayName", {}).get("text")
            and place.get("location", {}).get("latitude") is not None
            and place.get("location", {}).get("longitude") is not None
        ]
        _GOOGLE_NEARBY_CACHE[cache_key] = {"fetched_at": now, "places": places}
        return places

    def search_text_places(self, keyword, count=5):
        if not self.api_key or not keyword:
            return []
        body = json.dumps(
            {
                "textQuery": str(keyword),
                "languageCode": "ko",
                "regionCode": "KR",
            }
        ).encode("utf-8")
        req = request.Request(
            self.text_search_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.location,places.primaryType,"
                    "places.formattedAddress,places.googleMapsUri,places.photos,"
                    "places.rating,places.userRatingCount"
                ),
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return []
        places = []
        for place in data.get("places", [])[: max(1, min(int(count), 20))]:
            location = place.get("location") or {}
            if location.get("latitude") is None or location.get("longitude") is None:
                continue
            places.append(
                {
                    "id": f"google_{place.get('id', '')}",
                    "name": clean_google_place_name(place.get("displayName", {}).get("text", "")),
                    "category": "장소",
                    "source_category": place.get("primaryType", "Google Places"),
                    "lat": float(location.get("latitude")),
                    "lon": float(location.get("longitude")),
                    "address": place.get("formattedAddress", ""),
                    "google_place_id": place.get("id", ""),
                    "google_maps_uri": place.get("googleMapsUri", ""),
                    "google_rating": place.get("rating"),
                    "google_review_count": int(place.get("userRatingCount") or 0),
                    **self._photo_metadata(place),
                }
            )
        return [place for place in places if place.get("name")]

    def get_photo(self, photo_name, max_width_px=720, max_height_px=480):
        if not self.api_key or not photo_name.startswith("places/") or "/photos/" not in photo_name:
            raise ValueError("유효하지 않은 Google Places 사진 요청입니다.")
        query = parse.urlencode(
            {
                "key": self.api_key,
                "maxWidthPx": max_width_px,
                "maxHeightPx": max_height_px,
            }
        )
        req = request.Request(f"https://places.googleapis.com/v1/{photo_name}/media?{query}", method="GET")
        with request.urlopen(req, timeout=15) as response:
            return response.read(), response.headers.get("Content-Type", "image/jpeg")

    def search_photo_by_name(self, place_name, lat, lon, include_details=False):
        if not self.api_key or not place_name:
            return None
        cache_key = (place_name.strip().lower(), round(float(lat), 4), round(float(lon), 4), bool(include_details))
        cached = _GOOGLE_PHOTO_SEARCH_CACHE.get(cache_key)
        now = time.time()
        if cached and now - cached["fetched_at"] < GOOGLE_PLACE_DETAIL_CACHE_TTL_SECONDS:
            return cached["photo"]
        body = json.dumps(
            {
                "textQuery": str(place_name),
                "languageCode": "ko",
                "regionCode": "KR",
                "locationBias": {
                    "circle": {
                        "center": {"latitude": float(lat), "longitude": float(lon)},
                        "radius": 2000,
                    }
                },
            }
        ).encode("utf-8")
        req = request.Request(
            self.text_search_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.location,places.googleMapsUri,places.photos,"
                    "places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,"
                    "places.websiteUri,places.rating,places.userRatingCount,"
                    "places.regularOpeningHours,places.currentOpeningHours"
                ),
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return None
        places = data.get("places") or []
        if not places:
            _GOOGLE_PHOTO_SEARCH_CACHE[cache_key] = {"fetched_at": now, "photo": None}
            return None
        place = places[0]
        photo = self._photo_metadata(place)
        result = {
            **photo,
            "google_place_id": place.get("id", ""),
            "google_maps_uri": place.get("googleMapsUri", ""),
            "address": place.get("formattedAddress", ""),
            "phone": place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or "",
            "website_uri": place.get("websiteUri", ""),
            "google_rating": place.get("rating"),
            "google_review_count": int(place.get("userRatingCount") or 0),
            "opening_hours": (
                place.get("currentOpeningHours", {}).get("weekdayDescriptions")
                or place.get("regularOpeningHours", {}).get("weekdayDescriptions")
                or []
            ),
            "open_now": place.get("currentOpeningHours", {}).get("openNow"),
        }
        if include_details:
            result["nearby_subway_station"] = self.find_nearest_subway_station(lat, lon)
        _GOOGLE_PHOTO_SEARCH_CACHE[cache_key] = {"fetched_at": now, "photo": result}
        return result

    def find_nearest_subway_station(self, lat, lon):
        if not self.api_key:
            return None
        body = json.dumps(
            {
                "includedTypes": ["subway_station"],
                "maxResultCount": 3,
                "rankPreference": "DISTANCE",
                "languageCode": "ko",
                "regionCode": "KR",
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": float(lat), "longitude": float(lon)},
                        "radius": 3000,
                    }
                },
            }
        ).encode("utf-8")
        req = request.Request(
            self.base_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.googleMapsUri",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return None
        stations = []
        for place in data.get("places", []):
            station_name = clean_google_place_name(place.get("displayName", {}).get("text", ""))
            if "역" not in station_name and "Station" not in station_name:
                continue
            location = place.get("location") or {}
            station_lat = location.get("latitude")
            station_lon = location.get("longitude")
            if station_lat is None or station_lon is None:
                continue
            stations.append(
                {
                    "name": station_name,
                    "lat": float(station_lat),
                    "lon": float(station_lon),
                    "google_maps_uri": place.get("googleMapsUri", ""),
                    "distance_m": int(round(self._distance_m(float(lat), float(lon), float(station_lat), float(station_lon)))),
                }
            )
        stations = [station for station in stations if station["name"]]
        if not stations:
            stations = self._search_nearby_station_by_text(lat, lon)
        return min(stations, key=lambda station: station["distance_m"]) if stations else None

    def _search_nearby_station_by_text(self, lat, lon):
        body = json.dumps(
            {
                "textQuery": "지하철역",
                "languageCode": "ko",
                "regionCode": "KR",
                "locationBias": {
                    "circle": {
                        "center": {"latitude": float(lat), "longitude": float(lon)},
                        "radius": 3000,
                    }
                },
            }
        ).encode("utf-8")
        req = request.Request(
            self.text_search_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": "places.displayName,places.location,places.googleMapsUri",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return []
        stations = []
        for place in data.get("places", []):
            station_name = clean_google_place_name(place.get("displayName", {}).get("text", ""))
            if "역" not in station_name and "Station" not in station_name:
                continue
            location = place.get("location") or {}
            station_lat = location.get("latitude")
            station_lon = location.get("longitude")
            if station_lat is None or station_lon is None:
                continue
            stations.append(
                {
                    "name": station_name,
                    "lat": float(station_lat),
                    "lon": float(station_lon),
                    "google_maps_uri": place.get("googleMapsUri", ""),
                    "distance_m": int(round(self._distance_m(float(lat), float(lon), float(station_lat), float(station_lon)))),
                }
            )
        return stations

    def _photo_metadata(self, place):
        photos = place.get("photos") or []
        if not photos:
            return {}
        photo = photos[0]
        attributions = photo.get("authorAttributions") or []
        attribution = attributions[0] if attributions else {}
        return {
            "google_photo_name": photo.get("name", ""),
            "google_photo_attribution_name": attribution.get("displayName", ""),
            "google_photo_attribution_uri": attribution.get("uri", ""),
            "google_photos": [
                {
                    "name": item.get("name", ""),
                    "attribution_name": ((item.get("authorAttributions") or [{}])[0] or {}).get("displayName", ""),
                    "attribution_uri": ((item.get("authorAttributions") or [{}])[0] or {}).get("uri", ""),
                }
                for item in photos[:6]
                if item.get("name")
            ],
        }

    def _distance_m(self, lat1, lon1, lat2, lon2):
        radius = 6371000
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = (
            math.sin(delta_phi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        )
        return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _recodate_category(self, category, primary_type):
        if category not in {"야외 액티비티", "액티비티", "엑티비티"}:
            return category
        if primary_type in {"museum", "art_gallery", "cultural_center"}:
            return "공연/관람"
        if primary_type in {"bowling_alley", "movie_theater"}:
            return "액티비티"
        return "액티비티"
