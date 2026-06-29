import html
import json
import re
import time
from urllib import parse, request

from app.config import settings


TAG_PATTERN = re.compile(r"<[^>]+>")
NAVER_LOCAL_CACHE_TTL_SECONDS = 3600
_NAVER_LOCAL_CACHE = {}


class NaverLocalClient:
    base_url = "https://openapi.naver.com/v1/search/local.json"
    image_url = "https://openapi.naver.com/v1/search/image"

    def __init__(self):
        self.client_id = settings.naver_local_client_id
        self.client_secret = settings.naver_local_client_secret

    @property
    def enabled(self):
        return bool(self.client_id and self.client_secret)

    def search_popular(self, query, display=5):
        if not self.enabled:
            return []
        cache_key = (query, int(display))
        cached = _NAVER_LOCAL_CACHE.get(cache_key)
        now = time.time()
        if cached and now - cached["fetched_at"] < NAVER_LOCAL_CACHE_TTL_SECONDS:
            return cached["items"]
        params = parse.urlencode(
            {
                "query": query,
                "display": max(1, min(int(display), 5)),
                "start": 1,
                "sort": "comment",
            }
        )
        req = request.Request(
            f"{self.base_url}?{params}",
            headers={
                "Accept": "application/json",
                "X-Naver-Client-Id": self.client_id,
                "X-Naver-Client-Secret": self.client_secret,
            },
            method="GET",
        )
        with request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
        items = [
            {
                **item,
                "title": html.unescape(TAG_PATTERN.sub("", item.get("title", ""))),
            }
            for item in data.get("items", [])
        ]
        _NAVER_LOCAL_CACHE[cache_key] = {"fetched_at": now, "items": items}
        return items

    def search_image(self, query, display=1):
        if not self.enabled:
            return {}
        cache_key = ("image", query, int(display))
        cached = _NAVER_LOCAL_CACHE.get(cache_key)
        now = time.time()
        if cached and now - cached["fetched_at"] < NAVER_LOCAL_CACHE_TTL_SECONDS:
            return self._image_result(cached["items"])
        params = parse.urlencode(
            {
                "query": query,
                "display": max(1, min(int(display), 10)),
                "start": 1,
                "sort": "sim",
                "filter": "medium",
            }
        )
        req = request.Request(
            f"{self.image_url}?{params}",
            headers={
                "Accept": "application/json",
                "X-Naver-Client-Id": self.client_id,
                "X-Naver-Client-Secret": self.client_secret,
            },
            method="GET",
        )
        try:
            with request.urlopen(req, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return {}
        items = [
            {
                "naver_image_thumbnail": item.get("thumbnail", ""),
                "naver_image_link": item.get("link", ""),
                "naver_image_title": html.unescape(TAG_PATTERN.sub("", item.get("title", ""))),
                "photo_source": "네이버 이미지 검색",
            }
            for item in data.get("items", [])
            if item.get("thumbnail")
        ]
        _NAVER_LOCAL_CACHE[cache_key] = {"fetched_at": now, "items": items}
        return self._image_result(items)

    def _image_result(self, items):
        if not items:
            return {}
        return {
            **items[0],
            "naver_images": items[:6],
        }
