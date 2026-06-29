import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class GangneungBisClient:
    BASE_URL = "https://bis.gn.go.kr"
    INACTIVE_ROUTE_LABELS = ("운행 중단", "운행 폐지")

    def _get_text(self, path, params=None):
        query = f"?{urlencode(params)}" if params else ""
        request = Request(
            f"{self.BASE_URL}{path}{query}",
            headers={"User-Agent": "RecoDate-MVP/1.0"},
        )
        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8")

    def _get_json(self, path, params=None):
        return json.loads(self._get_text(path, params))

    def get_route_list(self):
        html = self._get_text("/search")
        routes = []
        seen_route_ids = set()
        for route_id, route_no in re.findall(r"loadRoute\((\d+), '([^']+)'\)", html):
            if any(label in route_no for label in self.INACTIVE_ROUTE_LABELS):
                continue
            if route_id in seen_route_ids:
                continue
            seen_route_ids.add(route_id)
            routes.append({"route_id": route_id, "route_no": route_no})
        return routes

    def get_route_stops(self, route_id):
        data = self._get_json("/gangneung/search/route/map", {"routeId": route_id})
        return data.get("list", [])
