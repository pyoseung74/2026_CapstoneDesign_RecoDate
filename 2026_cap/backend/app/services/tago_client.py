import json
from urllib import parse, request
from urllib.error import HTTPError

from app.config import settings


class TagoClient:
    def __init__(self):
        self.service_key = settings.tago_service_key
        if not self.service_key:
            raise RuntimeError("TAGO_SERVICE_KEY가 설정되어 있지 않습니다.")

    def get_route_list(self, city_code=settings.tago_city_code):
        return self._get_all(
            settings.tago_route_endpoint,
            "getRouteNoList",
            {"cityCode": city_code},
        )

    def get_route_stops(self, route_id, city_code=settings.tago_city_code):
        return self._get_all(
            settings.tago_route_endpoint,
            "getRouteAcctoThrghSttnList",
            {"cityCode": city_code, "routeId": route_id},
        )

    def get_nearby_stops(self, lat, lon):
        return self._get_all(
            settings.tago_station_endpoint,
            "getCrdntPrxmtSttnList",
            {"gpsLati": lat, "gpsLong": lon},
            num_rows=100,
        )

    def get_arrivals(self, node_id, city_code=settings.tago_city_code):
        return self._get_all(
            settings.tago_arrival_endpoint,
            "getSttnAcctoArvlPrearngeInfoList",
            {"cityCode": city_code, "nodeId": node_id},
            num_rows=100,
        )

    def _get_all(self, endpoint, operation, params, num_rows=999):
        page_no = 1
        rows = []
        while True:
            data = self._get(
                endpoint,
                operation,
                {
                    **params,
                    "numOfRows": num_rows,
                    "pageNo": page_no,
                    "_type": "json",
                },
            )
            body = data.get("response", {}).get("body", {})
            items = body.get("items") or {}
            item = items.get("item") if isinstance(items, dict) else []
            if isinstance(item, dict):
                item = [item]
            rows.extend(item or [])

            total_count = int(body.get("totalCount") or 0)
            if len(rows) >= total_count or not item:
                break
            page_no += 1
        return rows

    def _get(self, endpoint, operation, params):
        query = parse.urlencode({"serviceKey": self.service_key, **params})
        req = request.Request(
            f"{endpoint.rstrip('/')}/{operation}?{query}",
            headers={"Accept": "application/json"},
            method="GET",
        )
        try:
            with request.urlopen(req, timeout=15) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            raise RuntimeError(f"TAGO API 호출 실패: HTTP {exc.code}") from exc

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            preview = raw[:160].replace("\n", " ")
            raise RuntimeError(f"TAGO API가 JSON이 아닌 응답을 반환했습니다: {preview}") from exc

        header = data.get("response", {}).get("header", {})
        if str(header.get("resultCode", "")) != "00":
            raise RuntimeError(f"TAGO API 오류: {header.get('resultMsg') or header.get('resultCode')}")
        return data
