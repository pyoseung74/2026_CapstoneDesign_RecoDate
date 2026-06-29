import json
from urllib import parse, request
from urllib.error import HTTPError

from app.config import settings


class TourContentClient:
    base_url = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2"

    def __init__(self):
        self.service_key = settings.tour_content_service_key

    def fetch_gangneung_places(self, rows_per_page=100):
        if not self.service_key:
            raise RuntimeError("TOUR_CONTENT_SERVICE_KEY가 설정되어 있지 않습니다.")

        places = []
        page = 1
        total_count = None
        while total_count is None or len(places) < total_count:
            data = self._request_page(page, rows_per_page)
            body = data.get("response", {}).get("body", {})
            total_count = int(body.get("totalCount") or 0)
            items_container = body.get("items") or {}
            items = items_container.get("item", []) if isinstance(items_container, dict) else []
            if isinstance(items, dict):
                items = [items]
            if not items:
                break
            places.extend(self._normalize_item(item) for item in items if self._valid_item(item))
            page += 1
        return places

    def _request_page(self, page, rows_per_page):
        query = parse.urlencode(
            {
                "serviceKey": self.service_key,
                "MobileOS": "ETC",
                "MobileApp": "RecoDate",
                "_type": "json",
                "pageNo": str(page),
                "numOfRows": str(rows_per_page),
                "areaCode": "32",
                "sigunguCode": "1",
                "arrange": "A",
            }
        )
        try:
            with request.urlopen(f"{self.base_url}?{query}", timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code == 403:
                raise RuntimeError("국문 관광정보 서비스 API 권한이 아직 게이트웨이에 반영되지 않았습니다.") from exc
            raise

    def _valid_item(self, item):
        return (
            isinstance(item, dict)
            and item.get("contentid")
            and item.get("title")
            and item.get("mapx") not in (None, "")
            and item.get("mapy") not in (None, "")
        )

    def _normalize_item(self, item):
        content_type_id = str(item.get("contenttypeid") or "")
        name = str(item.get("title") or "").strip()
        category, source_category = self._classify(content_type_id, name, item)
        return {
            "content_id": str(item.get("contentid") or ""),
            "content_type_id": content_type_id,
            "name": name,
            "category": category,
            "source_category": source_category,
            "address": " ".join(part for part in [item.get("addr1", ""), item.get("addr2", "")] if part).strip(),
            "lat": float(item["mapy"]),
            "lon": float(item["mapx"]),
            "tel": str(item.get("tel") or ""),
            "first_image": str(item.get("firstimage") or ""),
            "first_image_small": str(item.get("firstimage2") or ""),
            "cat1": str(item.get("cat1") or ""),
            "cat2": str(item.get("cat2") or ""),
            "cat3": str(item.get("cat3") or ""),
            "modified_time": str(item.get("modifiedtime") or ""),
        }

    def _classify(self, content_type_id, name, item):
        text = " ".join(
            [
                name,
                str(item.get("cat1") or ""),
                str(item.get("cat2") or ""),
                str(item.get("cat3") or ""),
            ]
        ).lower()
        if content_type_id == "39":
            if any(word in text for word in ["카페", "커피", "디저트", "베이커리"]):
                return "카페", "카페"
            return "음식점", "음식점"
        if content_type_id == "14":
            return "문화/전시", "문화시설"
        if content_type_id == "28":
            if any(word in text for word in ["실내", "체험관", "아쿠아리움", "볼링", "영화"]):
                return "실내 액티비티", "체험"
            return "야외 액티비티", "레포츠"
        if content_type_id in {"12", "15", "38"}:
            if any(word in text for word in ["공원", "산책", "거리", "해변", "해수욕장", "호수"]):
                return "마무리/산책", "관광지"
            return "야외 액티비티", "관광지"
        if content_type_id == "32":
            return "숙소", "숙박"
        return "야외 액티비티", "관광지"
