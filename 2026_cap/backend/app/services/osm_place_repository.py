import json
import sqlite3
from contextlib import closing
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "recodate_places.db"


def _distance_m(center, place):
    radius = 6371000
    lat1, lat2 = radians(float(center["lat"])), radians(float(place["lat"]))
    d_lat = lat2 - lat1
    d_lon = radians(float(place["lon"]) - float(center["lon"]))
    value = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    return radius * 2 * atan2(sqrt(value), sqrt(1 - value))


def _bbox(center, radius_km):
    lat = float(center["lat"])
    lon = float(center["lon"])
    delta_lat = float(radius_km) / 111.0
    delta_lon = float(radius_km) / max(111.0 * cos(radians(lat)), 0.01)
    return lat - delta_lat, lat + delta_lat, lon - delta_lon, lon + delta_lon


class OsmPlaceRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)
        self._initialize()

    def replace_all(self, places, source_file="", imported_at=""):
        self.clear()
        self.insert_many(places, source_file=source_file, imported_at=imported_at)

    def clear(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            connection.execute("DELETE FROM osm_places")
            connection.commit()

    def insert_many(self, places, source_file="", imported_at=""):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        rows = [
            {
                **place,
                "source_file": source_file,
                "imported_at": imported_at,
                "tags_json": json.dumps(place.get("tags", {}), ensure_ascii=False),
            }
            for place in places
        ]
        if not rows:
            return
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            connection.executemany(
                """
                INSERT OR REPLACE INTO osm_places(
                    id, osm_type, osm_id, name, category, source_category,
                    address, lat, lon, tel, website, opening_hours,
                    tags_json, source_file, imported_at
                )
                VALUES (
                    :id, :osm_type, :osm_id, :name, :category, :source_category,
                    :address, :lat, :lon, :tel, :website, :opening_hours,
                    :tags_json, :source_file, :imported_at
                )
                """,
                rows,
            )
            connection.commit()

    def search(self, centers, category, radius_km, limit=2000, source_categories=None, strict_category=False):
        if isinstance(centers, dict):
            centers = [centers]
        centers = [center for center in centers or [] if center.get("lat") is not None and center.get("lon") is not None]
        if not centers:
            return []

        categories = self._category_candidates(category, strict_category)
        source_categories = {item for item in (source_categories or []) if item}
        rows = []
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            for center in centers:
                min_lat, max_lat, min_lon, max_lon = _bbox(center, radius_km)
                params = [min_lat, max_lat, min_lon, max_lon]
                where = ["lat BETWEEN ? AND ?", "lon BETWEEN ? AND ?"]
                if categories:
                    placeholders = ",".join("?" for _ in categories)
                    where.append(f"category IN ({placeholders})")
                    params.extend(sorted(categories))
                if source_categories:
                    placeholders = ",".join("?" for _ in source_categories)
                    where.append(f"source_category IN ({placeholders})")
                    params.extend(sorted(source_categories))
                query = f"""
                    SELECT *
                    FROM osm_places
                    WHERE {" AND ".join(where)}
                    LIMIT ?
                """
                params.append(max(int(limit) * 3, 100))
                rows.extend(connection.execute(query, params).fetchall())

        by_id = {}
        for row in rows:
            place = self._row_to_place(row)
            distance = min((_distance_m(center, place) for center in centers), default=float("inf"))
            if distance > float(radius_km) * 1000:
                continue
            place["distance_m"] = round(distance)
            current = by_id.get(place["id"])
            if current is None or place["distance_m"] < current["distance_m"]:
                by_id[place["id"]] = place

        places = list(by_id.values())
        places.sort(key=lambda place: (place["distance_m"], self._quality_rank(place), place["name"]))
        return places[: int(limit)]

    def search_keyword(self, keyword, limit=20):
        normalized = self._normalize(keyword)
        if not normalized:
            return []
        like = f"%{keyword.strip()}%"
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT *
                FROM osm_places
                WHERE name LIKE ?
                ORDER BY
                    CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END,
                    name
                LIMIT ?
                """,
                (like, keyword.strip(), f"{keyword.strip()}%", max(int(limit) * 4, 40)),
            ).fetchall()
        places = []
        seen = set()
        for row in rows:
            place = self._row_to_place(row)
            key = self._normalize(place["name"])
            if normalized not in key and key not in normalized:
                continue
            if place["id"] in seen:
                continue
            seen.add(place["id"])
            places.append(place)
            if len(places) >= int(limit):
                break
        return places

    def count(self):
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            return int(connection.execute("SELECT COUNT(*) FROM osm_places").fetchone()[0])

    def count_by_category(self):
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            return {
                row[0]: row[1]
                for row in connection.execute(
                    "SELECT category, COUNT(*) FROM osm_places GROUP BY category ORDER BY category"
                ).fetchall()
            }

    def _row_to_place(self, row):
        return {
            "id": f"osm_{row['id']}",
            "name": row["name"],
            "category": row["category"],
            "source_category": row["source_category"],
            "address": row["address"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "tel": row["tel"],
            "website": row["website"],
            "opening_hours": [row["opening_hours"]] if row["opening_hours"] else [],
            "photo_source": "OpenStreetMap",
            "data_source": "osm",
            "locked": False,
            "replaceable": True,
        }

    def _category_candidates(self, category, strict_category):
        category = (category or "").strip()
        if not category or category == "전체":
            return set()
        if category in {"액티비티", "엑티비티", "야외 액티비티", "실내 액티비티"}:
            return (
                {"액티비티", "야외 액티비티", "실내 액티비티"}
                if strict_category
                else {"액티비티", "야외 액티비티", "실내 액티비티", "공연/관람", "문화/전시", "관광지"}
            )
        if category in {"공연/관람", "문화/전시"}:
            return {"공연/관람", "문화/전시"}
        if category in {"관광지", "마무리/산책"}:
            return {"관광지", "마무리/산책"}
        if category in {"숙박", "숙소"}:
            return {"숙박", "숙소"}
        if category in {"쇼핑", "상점", "소매"}:
            return {"쇼핑"}
        if category in {"기타", "other"}:
            return {"기타"}
        return {category}

    def _quality_rank(self, place):
        score = 0
        if place.get("address"):
            score -= 2
        if place.get("tel"):
            score -= 1
        if place.get("website"):
            score -= 1
        return score

    def _normalize(self, value):
        return "".join(str(value or "").lower().split())

    def _initialize(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            connection.commit()

    def _initialize_connection(self, connection):
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS osm_places (
                id TEXT PRIMARY KEY,
                osm_type TEXT NOT NULL,
                osm_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                source_category TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                tel TEXT NOT NULL DEFAULT '',
                website TEXT NOT NULL DEFAULT '',
                opening_hours TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '{}',
                source_file TEXT NOT NULL DEFAULT '',
                imported_at TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_osm_places_category ON osm_places(category)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_osm_places_lat_lon ON osm_places(lat, lon)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_osm_places_name ON osm_places(name)")
