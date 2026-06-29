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


class TourPlaceRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)
        self._initialize()

    def replace_all(self, places):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("DELETE FROM tour_places")
            connection.executemany(
                """
                INSERT INTO tour_places(
                    content_id, content_type_id, name, category, source_category,
                    address, lat, lon, tel, first_image, first_image_small,
                    cat1, cat2, cat3, modified_time
                )
                VALUES (
                    :content_id, :content_type_id, :name, :category, :source_category,
                    :address, :lat, :lon, :tel, :first_image, :first_image_small,
                    :cat1, :cat2, :cat3, :modified_time
                )
                """,
                places,
            )
            connection.commit()

    def search(self, centers, category, radius_km, limit=2000):
        categories = self._category_candidates(category)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            if not categories:
                rows = connection.execute(
                    "SELECT * FROM tour_places ORDER BY name LIMIT ?",
                    (int(limit),),
                ).fetchall()
            else:
                placeholders = ",".join("?" for _ in categories)
                rows = connection.execute(
                    f"SELECT * FROM tour_places WHERE category IN ({placeholders}) ORDER BY name LIMIT ?",
                    (*sorted(categories), int(limit)),
                ).fetchall()

        places = []
        for row in rows:
            place = {
                "id": f"tour_{row['content_id']}",
                "name": row["name"],
                "category": row["category"],
                "source_category": row["source_category"],
                "address": row["address"],
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "tel": row["tel"],
                "photo_url": row["first_image"] or row["first_image_small"],
                "photo_source": "한국관광공사 TourAPI",
                "tour_content_id": row["content_id"],
                "locked": False,
                "replaceable": True,
            }
            distance = min((_distance_m(center, place) for center in centers), default=float("inf"))
            if distance <= float(radius_km) * 1000:
                place["distance_m"] = round(distance)
                places.append(place)
        places.sort(key=lambda place: (place["distance_m"], place["name"]))
        return places

    def count(self):
        with closing(sqlite3.connect(self.database_path)) as connection:
            return int(connection.execute("SELECT COUNT(*) FROM tour_places").fetchone()[0])

    def _category_candidates(self, category):
        category = (category or "").strip()
        if not category or category == "전체":
            return set()
        if category in {"액티비티", "엑티비티", "야외 액티비티", "실내 액티비티"}:
            return {"액티비티", "야외 액티비티", "실내 액티비티"}
        if category in {"공연/관람", "문화/전시"}:
            return {"공연/관람", "문화/전시"}
        if category in {"관광지", "마무리/산책"}:
            return {"관광지", "마무리/산책"}
        if category in {"숙박", "숙소"}:
            return {"숙박", "숙소"}
        return {category}

    def _initialize(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS tour_places (
                    content_id TEXT PRIMARY KEY,
                    content_type_id TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    source_category TEXT NOT NULL DEFAULT '',
                    address TEXT NOT NULL DEFAULT '',
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    tel TEXT NOT NULL DEFAULT '',
                    first_image TEXT NOT NULL DEFAULT '',
                    first_image_small TEXT NOT NULL DEFAULT '',
                    cat1 TEXT NOT NULL DEFAULT '',
                    cat2 TEXT NOT NULL DEFAULT '',
                    cat3 TEXT NOT NULL DEFAULT '',
                    modified_time TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.execute("CREATE INDEX IF NOT EXISTS idx_tour_places_category ON tour_places(category)")
            connection.commit()
