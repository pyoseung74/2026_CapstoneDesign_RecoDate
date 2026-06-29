import json
from urllib import parse, request
from urllib.error import HTTPError, URLError

from app.config import settings


class OdsayClient:
    endpoint = "https://api.odsay.com/v1/api/searchPubTransPathT"
    lane_endpoint = "https://api.odsay.com/v1/api/loadLane"

    def __init__(self):
        self.api_key = settings.odsay_api_key
        self.referer = settings.odsay_referer

    def find_route(self, start, end):
        if not self.api_key:
            raise RuntimeError("ODSAY_API_KEY가 설정되어 있지 않습니다.")

        params = {
            "SX": start["lon"],
            "SY": start["lat"],
            "EX": end["lon"],
            "EY": end["lat"],
            "OPT": 0,
            "SearchType": 0,
            "SearchPathType": 0,
            "apiKey": self.api_key,
        }
        data = self._get(params)
        if data.get("error"):
            error = data["error"][0] if isinstance(data["error"], list) else data["error"]
            raise RuntimeError(f"ODsay API 오류: {error.get('message') or error.get('code')}")

        paths = data.get("result", {}).get("path") or []
        if not paths:
            raise RuntimeError("ODsay 대중교통 경로가 없습니다.")

        best = min(paths, key=lambda path: int(path.get("info", {}).get("totalTime") or 9999))
        lane_path = self._load_lane_path(best.get("info", {}).get("mapObj"))
        return self._build_route(start, end, best, lane_path)

    def _get(self, params, endpoint=None):
        query = parse.urlencode(params)
        headers = {"Accept": "application/json"}
        if self.referer:
            headers["Referer"] = self.referer
        req = request.Request(f"{endpoint or self.endpoint}?{query}", headers=headers, method="GET")
        try:
            with request.urlopen(req, timeout=12) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            raise RuntimeError(f"ODsay API 호출 실패: HTTP {exc.code}") from exc
        except URLError as exc:
            raise RuntimeError(f"ODsay API 연결 실패: {exc.reason}") from exc

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            preview = raw[:160].replace("\n", " ")
            raise RuntimeError(f"ODsay API가 JSON이 아닌 응답을 반환했습니다: {preview}") from exc

    def _load_lane_path(self, map_obj):
        if not map_obj:
            return []
        map_object = str(map_obj)
        if not map_object.startswith("0:0@"):
            map_object = f"0:0@{map_object}"
        params = {
            "mapObject": map_object,
            "apiKey": self.api_key,
            "output": "json",
        }
        data = self._get(params, endpoint=self.lane_endpoint)
        if data.get("error"):
            error = data["error"][0] if isinstance(data["error"], list) else data["error"]
            raise RuntimeError(f"ODsay 노선 그래픽 API 오류: {error.get('message') or error.get('code')}")
        return self._extract_lane_points(data)

    def _extract_lane_points(self, data):
        points = []
        lanes = data.get("result", {}).get("lane") or []
        if isinstance(lanes, dict):
            lanes = [lanes]
        for lane in lanes:
            sections = lane.get("section") or []
            if isinstance(sections, dict):
                sections = [sections]
            for section in sections:
                graph_positions = section.get("graphPos") or []
                if isinstance(graph_positions, dict):
                    graph_positions = [graph_positions]
                for item in graph_positions:
                    point = self._coord_from_mapping(item, ("y", "x"))
                    if point:
                        points.append(point)
        return points

    def _build_route(self, start, end, path, lane_path=None):
        info = path.get("info", {})
        instructions = []
        route_path = [{"lat": start["lat"], "lon": start["lon"]}]
        section_path = []

        for section in path.get("subPath") or []:
            traffic_type = int(section.get("trafficType") or 0)
            distance_m = int(float(section.get("distance") or 0))
            time_sec = int(float(section.get("sectionTime") or 0) * 60)
            section_path = self._append_path(section_path, self._section_points(section))

            if traffic_type == 3:
                if distance_m:
                    start_name = section.get("startName") or ""
                    end_name = section.get("endName") or ""
                    description = (
                        f"{start_name}에서 {end_name}까지 도보 이동"
                        if start_name and end_name
                        else f"도보 {distance_m:,}m 이동"
                    )
                    instructions.append(
                        {
                            "mode": "walk",
                            "from": start_name,
                            "to": end_name,
                            "distance_m": distance_m,
                            "time_sec": time_sec,
                            "description": description,
                        }
                    )
                continue

            mode = "subway" if traffic_type == 1 else "bus"
            mode_label = "지하철" if mode == "subway" else "버스"
            route_label = self._lane_label(section.get("lane"))
            start_name = section.get("startName") or "출발 정류장"
            end_name = section.get("endName") or "도착 정류장"
            station_count = int(section.get("stationCount") or 0)
            route_name = f"{route_label} {mode_label}".strip() if route_label else mode_label
            station_suffix = f" ({station_count}개 정거장)" if station_count else ""
            instructions.append(
                {
                    "mode": mode,
                    "route": route_label,
                    "from": start_name,
                    "to": end_name,
                    "boarding_station": start_name,
                    "alighting_station": end_name,
                    "distance_m": distance_m,
                    "time_sec": time_sec,
                    "station_count": station_count,
                    "fare_won": int(info.get("payment") or 0),
                    "description": f"{start_name}에서 {route_name} 탑승 → {end_name} 하차{station_suffix}",
                }
            )

        if lane_path:
            route_path = self._append_path(route_path, lane_path)
        else:
            route_path = self._append_path(route_path, section_path)
        route_path = self._append_path(route_path, [{"lat": end["lat"], "lon": end["lon"]}])
        return {
            "source": "odsay",
            "path": route_path,
            "total_distance_m": int(float(info.get("totalDistance") or info.get("trafficDistance") or 0)),
            "total_time_sec": int(float(info.get("totalTime") or 0) * 60),
            "payment_won": int(info.get("payment") or 0),
            "estimated": False,
            "instructions": instructions,
        }

    def _section_points(self, section):
        points = []
        start_point = self._coord_from_mapping(section, ("startY", "startX"))
        end_point = self._coord_from_mapping(section, ("endY", "endX"))
        if start_point:
            points.append(start_point)

        for stop in self._iter_section_stops(section):
            point = self._coord_from_stop(stop)
            if point:
                points.append(point)

        if end_point:
            points.append(end_point)
        return points

    def _iter_section_stops(self, section):
        containers = []
        pass_stop_list = section.get("passStopList")
        if isinstance(pass_stop_list, dict):
            containers.extend(
                [
                    pass_stop_list.get("stations"),
                    pass_stop_list.get("station"),
                    pass_stop_list.get("busStations"),
                    pass_stop_list.get("busStation"),
                ]
            )
        elif isinstance(pass_stop_list, list):
            containers.append(pass_stop_list)

        containers.extend([section.get("stationList"), section.get("stations"), section.get("passStations")])

        for container in containers:
            if isinstance(container, dict):
                nested = container.get("stations") or container.get("station") or container.get("items")
                if isinstance(nested, list):
                    for item in nested:
                        yield item
                else:
                    yield container
            elif isinstance(container, list):
                for item in container:
                    yield item

    def _coord_from_stop(self, stop):
        if not isinstance(stop, dict):
            return None
        for lat_key, lon_key in (
            ("y", "x"),
            ("lat", "lon"),
            ("stationY", "stationX"),
            ("arsY", "arsX"),
        ):
            point = self._coord_from_mapping(stop, (lat_key, lon_key))
            if point:
                return point
        return None

    def _coord_from_mapping(self, item, keys):
        lat_key, lon_key = keys
        try:
            lat = float(item[lat_key])
            lon = float(item[lon_key])
        except (KeyError, TypeError, ValueError):
            return None
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        return {"lat": lat, "lon": lon}

    def _append_path(self, current, additions):
        merged = list(current)
        for point in additions or []:
            if not point:
                continue
            if merged and abs(merged[-1]["lat"] - point["lat"]) < 0.000001 and abs(merged[-1]["lon"] - point["lon"]) < 0.000001:
                continue
            merged.append(point)
        return merged

    def _lane_label(self, lane):
        if isinstance(lane, str):
            return lane.strip()
        if isinstance(lane, dict):
            return self._lane_item_label(lane)
        if isinstance(lane, list):
            labels = [self._lane_item_label(item) for item in lane]
            labels = [label for label in labels if label]
            return ", ".join(labels[:3])
        return ""

    def _lane_item_label(self, item):
        if not isinstance(item, dict):
            return str(item).strip() if item else ""
        for key in ("busNo", "name", "subwayName", "laneName", "route", "busID"):
            value = item.get(key)
            if value:
                return str(value).strip()
        return ""
