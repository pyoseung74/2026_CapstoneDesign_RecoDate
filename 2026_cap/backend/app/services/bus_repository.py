import math
import sqlite3
from contextlib import closing
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "gangneung_bus.db"


def haversine_m(lat1, lon1, lat2, lon2):
    radius = 6371000
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    d_phi = math.radians(float(lat2) - float(lat1))
    d_lambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class BusRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)

    def find_route(self, start, end, max_walk_m=700, nearest_limit=6):
        if not self.database_path.exists():
            raise RuntimeError("강릉 버스 DB가 아직 생성되지 않았습니다.")

        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            route_count = connection.execute("SELECT COUNT(*) FROM bus_routes").fetchone()[0]
            if not route_count:
                raise RuntimeError("강릉 버스 DB에 노선 데이터가 없습니다.")
            start_stops = self._nearest_stops(connection, start, max_walk_m, nearest_limit)
            end_stops = self._nearest_stops(connection, end, max_walk_m, nearest_limit)
            if not start_stops or not end_stops:
                return None

            direct = self._find_direct(connection, start_stops, end_stops)
            if direct:
                return self._build_result(start, end, direct)

            transfer = self._find_one_transfer(connection, start_stops, end_stops)
            return self._build_result(start, end, transfer) if transfer else None

    def _nearest_stops(self, connection, place, max_walk_m, limit):
        lat = float(place["lat"])
        lon = float(place["lon"])
        lat_margin = max_walk_m / 111000
        lon_margin = max_walk_m / (111000 * max(math.cos(math.radians(lat)), 0.1))
        rows = connection.execute(
            """
            SELECT node_id, node_name, node_no, lat, lon
            FROM bus_stops
            WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            """,
            (lat - lat_margin, lat + lat_margin, lon - lon_margin, lon + lon_margin),
        ).fetchall()
        stops = []
        for row in rows:
            stop = dict(row)
            stop["walk_distance_m"] = int(haversine_m(lat, lon, stop["lat"], stop["lon"]) * 1.25)
            if stop["walk_distance_m"] <= max_walk_m:
                stops.append(stop)
        return sorted(stops, key=lambda stop: stop["walk_distance_m"])[:limit]

    def _find_direct(self, connection, start_stops, end_stops):
        best = None
        for start_stop in start_stops:
            for end_stop in end_stops:
                rows = connection.execute(
                    """
                    SELECT sr.route_id, r.route_no, r.route_type,
                           sr.node_ord AS start_ord, er.node_ord AS end_ord
                    FROM route_stops AS sr
                    JOIN route_stops AS er ON er.route_id = sr.route_id
                    JOIN bus_routes AS r ON r.route_id = sr.route_id
                    WHERE sr.node_id = ? AND er.node_id = ? AND sr.node_ord < er.node_ord
                      AND r.route_no NOT LIKE '%운행 중단%'
                      AND r.route_no NOT LIKE '%운행 폐지%'
                    """,
                    (start_stop["node_id"], end_stop["node_id"]),
                ).fetchall()
                for row in rows:
                    candidate = {
                        "segments": [
                            self._segment(connection, dict(row), start_stop, end_stop)
                        ],
                        "start_stop": start_stop,
                        "end_stop": end_stop,
                        "transfer_count": 0,
                    }
                    best = self._pick_better(best, candidate)
        return best

    def _find_one_transfer(self, connection, start_stops, end_stops):
        best = None
        for start_stop in start_stops:
            for end_stop in end_stops:
                rows = connection.execute(
                    """
                    SELECT a.route_id AS first_route_id, ra.route_no AS first_route_no,
                           ra.route_type AS first_route_type, a.node_ord AS start_ord,
                           ax.node_ord AS first_end_ord, ax.node_id AS transfer_node_id,
                           s.node_name AS transfer_node_name, s.node_no AS transfer_node_no,
                           s.lat AS transfer_lat, s.lon AS transfer_lon,
                           bx.route_id AS second_route_id, rb.route_no AS second_route_no,
                           rb.route_type AS second_route_type, bx.node_ord AS second_start_ord,
                           b.node_ord AS end_ord
                    FROM route_stops AS a
                    JOIN route_stops AS ax ON ax.route_id = a.route_id AND ax.node_ord > a.node_ord
                    JOIN route_stops AS bx ON bx.node_id = ax.node_id
                    JOIN route_stops AS b ON b.route_id = bx.route_id AND b.node_ord > bx.node_ord
                    JOIN bus_routes AS ra ON ra.route_id = a.route_id
                    JOIN bus_routes AS rb ON rb.route_id = b.route_id
                    JOIN bus_stops AS s ON s.node_id = ax.node_id
                    WHERE a.node_id = ? AND b.node_id = ? AND a.route_id != b.route_id
                      AND ra.route_no NOT LIKE '%운행 중단%'
                      AND ra.route_no NOT LIKE '%운행 폐지%'
                      AND rb.route_no NOT LIKE '%운행 중단%'
                      AND rb.route_no NOT LIKE '%운행 폐지%'
                    """,
                    (start_stop["node_id"], end_stop["node_id"]),
                ).fetchall()
                for row in rows:
                    row = dict(row)
                    transfer_stop = {
                        "node_id": row["transfer_node_id"],
                        "node_name": row["transfer_node_name"],
                        "node_no": row["transfer_node_no"],
                        "lat": row["transfer_lat"],
                        "lon": row["transfer_lon"],
                        "walk_distance_m": 0,
                    }
                    first = {
                        "route_id": row["first_route_id"],
                        "route_no": row["first_route_no"],
                        "route_type": row["first_route_type"],
                        "start_ord": row["start_ord"],
                        "end_ord": row["first_end_ord"],
                    }
                    second = {
                        "route_id": row["second_route_id"],
                        "route_no": row["second_route_no"],
                        "route_type": row["second_route_type"],
                        "start_ord": row["second_start_ord"],
                        "end_ord": row["end_ord"],
                    }
                    candidate = {
                        "segments": [
                            self._segment(connection, first, start_stop, transfer_stop),
                            self._segment(connection, second, transfer_stop, end_stop),
                        ],
                        "start_stop": start_stop,
                        "end_stop": end_stop,
                        "transfer_count": 1,
                    }
                    best = self._pick_better(best, candidate)
        return best

    def _segment(self, connection, route, start_stop, end_stop):
        stop_rows = connection.execute(
            """
            SELECT rs.node_id, s.node_name, s.lat, s.lon, rs.node_ord
            FROM route_stops AS rs
            JOIN bus_stops AS s ON s.node_id = rs.node_id
            WHERE rs.route_id = ? AND rs.node_ord BETWEEN ? AND ?
            ORDER BY rs.node_ord
            """,
            (route["route_id"], route["start_ord"], route["end_ord"]),
        ).fetchall()
        stops = [dict(row) for row in stop_rows]
        distance_m = sum(
            haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
            for a, b in zip(stops, stops[1:])
        )
        hop_count = max(1, int(route["end_ord"]) - int(route["start_ord"]))
        return {
            "route_id": route["route_id"],
            "route_no": str(route["route_no"]),
            "route_type": route.get("route_type", ""),
            "from_stop": start_stop,
            "to_stop": end_stop,
            "hop_count": hop_count,
            "distance_m": int(distance_m),
            "time_sec": hop_count * 150,
            "path": [{"lat": stop["lat"], "lon": stop["lon"]} for stop in stops],
        }

    def _pick_better(self, current, candidate):
        candidate_cost = (
            candidate["start_stop"]["walk_distance_m"]
            + candidate["end_stop"]["walk_distance_m"]
            + sum(segment["distance_m"] for segment in candidate["segments"])
            + candidate["transfer_count"] * 1200
        )
        candidate["cost"] = candidate_cost
        if current is None or candidate_cost < current["cost"]:
            return candidate
        return current

    def _build_result(self, start, end, route):
        start_walk_m = route["start_stop"]["walk_distance_m"]
        end_walk_m = route["end_stop"]["walk_distance_m"]
        instructions = []
        if start_walk_m:
            instructions.append(
                self._walk_instruction(start["name"], route["start_stop"]["node_name"], start_walk_m)
            )
        for index, segment in enumerate(route["segments"]):
            instructions.append(
                {
                    "mode": "bus",
                    "route": segment["route_no"],
                    "from": segment["from_stop"]["node_name"],
                    "to": segment["to_stop"]["node_name"],
                    "distance_m": segment["distance_m"],
                    "time_sec": segment["time_sec"],
                    "description": (
                        f"{segment['from_stop']['node_name']} 정류장에서 {segment['route_no']}번 버스 탑승"
                        f" → {segment['to_stop']['node_name']} 정류장에서 하차"
                    ),
                }
            )
            if index < len(route["segments"]) - 1:
                instructions.append(
                    {
                        "mode": "transfer",
                        "description": f"{segment['to_stop']['node_name']} 정류장에서 버스 환승",
                    }
                )
        if end_walk_m:
            instructions.append(
                self._walk_instruction(route["end_stop"]["node_name"], end["name"], end_walk_m)
            )

        path = [{"lat": start["lat"], "lon": start["lon"]}]
        for segment in route["segments"]:
            path.extend(segment["path"])
        path.append({"lat": end["lat"], "lon": end["lon"]})
        total_distance_m = start_walk_m + end_walk_m + sum(segment["distance_m"] for segment in route["segments"])
        total_time_sec = (
            int(start_walk_m / 4000 * 3600)
            + int(end_walk_m / 4000 * 3600)
            + sum(segment["time_sec"] for segment in route["segments"])
            + route["transfer_count"] * 5 * 60
        )
        return {
            "total_distance_m": int(total_distance_m),
            "total_time_sec": int(total_time_sec),
            "instructions": instructions,
            "path": path,
        }

    def _walk_instruction(self, from_name, to_name, distance_m):
        return {
            "mode": "walk",
            "from": from_name,
            "to": to_name,
            "distance_m": int(distance_m),
            "time_sec": int(distance_m / 4000 * 3600),
            "description": f"{from_name}에서 {to_name}까지 도보 이동",
        }
