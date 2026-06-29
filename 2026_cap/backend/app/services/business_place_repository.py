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


class BusinessPlaceRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)
        self._initialize()

    def clear(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            connection.execute("DELETE FROM business_places")
            connection.commit()

    def replace_all(self, places, imported_at=""):
        self.clear()
        self.insert_many(places, imported_at=imported_at)

    def insert_many(self, places, imported_at=""):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        rows = [
            {
                **place,
                "imported_at": imported_at or place.get("imported_at", ""),
                "raw_json": place.get("raw_json") or "{}",
            }
            for place in places
        ]
        if not rows:
            return
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            connection.executemany(
                """
                INSERT OR REPLACE INTO business_places(
                    id, name, branch_name, category, source_category,
                    business_lcls_cd, business_lcls_nm,
                    business_mcls_cd, business_mcls_nm,
                    business_scls_cd, business_scls_nm,
                    sido_code, sido_name, sigungu_code, sigungu_name,
                    admin_dong_code, admin_dong_name, legal_dong_code, legal_dong_name,
                    address, road_address, lat, lon, standard_ym, raw_json, imported_at
                )
                VALUES (
                    :id, :name, :branch_name, :category, :source_category,
                    :business_lcls_cd, :business_lcls_nm,
                    :business_mcls_cd, :business_mcls_nm,
                    :business_scls_cd, :business_scls_nm,
                    :sido_code, :sido_name, :sigungu_code, :sigungu_name,
                    :admin_dong_code, :admin_dong_name, :legal_dong_code, :legal_dong_name,
                    :address, :road_address, :lat, :lon, :standard_ym, :raw_json, :imported_at
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
                    FROM business_places
                    WHERE {" AND ".join(where)}
                    LIMIT ?
                """
                params.append(max(int(limit) * 3, 120))
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
        keyword = (keyword or "").strip()
        normalized = self._normalize(keyword)
        if not normalized:
            return []
        prefix_end = f"{keyword}\uffff"
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT *
                FROM business_places
                WHERE name >= ? AND name < ?
                ORDER BY
                    CASE WHEN name = ? THEN 0 ELSE 1 END,
                    name
                LIMIT ?
                """,
                (keyword, prefix_end, keyword, max(int(limit) * 3, 30)),
            ).fetchall()
        places = []
        seen = set()
        for row in rows:
            place = self._row_to_place(row)
            key = self._normalize(place["name"])
            if not key.startswith(normalized) and normalized not in key:
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
            return int(connection.execute("SELECT COUNT(*) FROM business_places").fetchone()[0])

    def count_by_category(self):
        with closing(sqlite3.connect(self.database_path)) as connection:
            self._initialize_connection(connection)
            return {
                row[0]: row[1]
                for row in connection.execute(
                    "SELECT category, COUNT(*) FROM business_places GROUP BY category ORDER BY category"
                ).fetchall()
            }

    def _row_to_place(self, row):
        source_category = row["source_category"] or row["business_scls_nm"] or row["business_mcls_nm"]
        return {
            "id": f"business_{row['id']}",
            "name": row["name"],
            "category": row["category"],
            "source_category": source_category,
            "address": row["road_address"] or row["address"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "tel": "",
            "website": "",
            "photo_source": "소상공인시장진흥공단 상가업소정보",
            "data_source": "business",
            "business_standard_ym": row["standard_ym"],
            "business_lcls_nm": row["business_lcls_nm"],
            "business_mcls_nm": row["business_mcls_nm"],
            "business_scls_nm": row["business_scls_nm"],
            "sido_name": row["sido_name"],
            "sigungu_name": row["sigungu_name"],
            "admin_dong_name": row["admin_dong_name"],
            "legal_dong_name": row["legal_dong_name"],
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
                else {"액티비티", "야외 액티비티", "실내 액티비티", "공연/관람", "문화/전시"}
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
        if place.get("business_scls_nm"):
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
            CREATE TABLE IF NOT EXISTS business_places (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                branch_name TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                source_category TEXT NOT NULL DEFAULT '',
                business_lcls_cd TEXT NOT NULL DEFAULT '',
                business_lcls_nm TEXT NOT NULL DEFAULT '',
                business_mcls_cd TEXT NOT NULL DEFAULT '',
                business_mcls_nm TEXT NOT NULL DEFAULT '',
                business_scls_cd TEXT NOT NULL DEFAULT '',
                business_scls_nm TEXT NOT NULL DEFAULT '',
                sido_code TEXT NOT NULL DEFAULT '',
                sido_name TEXT NOT NULL DEFAULT '',
                sigungu_code TEXT NOT NULL DEFAULT '',
                sigungu_name TEXT NOT NULL DEFAULT '',
                admin_dong_code TEXT NOT NULL DEFAULT '',
                admin_dong_name TEXT NOT NULL DEFAULT '',
                legal_dong_code TEXT NOT NULL DEFAULT '',
                legal_dong_name TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                road_address TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                standard_ym TEXT NOT NULL DEFAULT '',
                raw_json TEXT NOT NULL DEFAULT '{}',
                imported_at TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_business_places_category ON business_places(category)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_business_places_lat_lon ON business_places(lat, lon)")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_business_places_category_lat_lon ON business_places(category, lat, lon)"
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_business_places_name ON business_places(name)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_business_places_region ON business_places(sido_name, sigungu_name)")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_business_places_source_category ON business_places(source_category)"
        )
