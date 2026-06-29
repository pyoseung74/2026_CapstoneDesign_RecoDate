import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib import parse, request

from app.config import settings


DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "recodate_place_photos.db"


def normalize_name(name):
    return "".join(character for character in (name or "").lower() if character.isalnum())


class TourPhotoClient:
    base_url = "https://apis.data.go.kr/B551011/PhotoGalleryService1/gallerySearchList1"

    def __init__(self, database_path=DATABASE_PATH):
        self.service_key = settings.tour_photo_service_key
        self.database_path = Path(database_path)
        self._initialize()

    def find_photo(self, place_name):
        normalized_name = normalize_name(place_name)
        if not normalized_name:
            return None

        cached = self._get_cached(normalized_name)
        if cached is not None:
            return cached or None

        photo = self._search_photo(place_name) if self.service_key else None
        self._save_cached(normalized_name, place_name, photo)
        return photo

    def _search_photo(self, place_name):
        query = parse.urlencode(
            {
                "serviceKey": self.service_key,
                "MobileOS": "ETC",
                "MobileApp": "RecoDate",
                "_type": "json",
                "pageNo": "1",
                "numOfRows": "10",
                "keyword": place_name,
            }
        )
        try:
            with request.urlopen(f"{self.base_url}?{query}", timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception:
            return None

        body = data.get("response", {}).get("body", {})
        items_container = body.get("items") or {}
        items = items_container.get("item", []) if isinstance(items_container, dict) else []
        if isinstance(items, dict):
            items = [items]
        items = [item for item in items if isinstance(item, dict)]

        best_item = self._best_item(place_name, items or [])
        if not best_item or not best_item.get("galWebImageUrl"):
            return None
        return {
            "photo_url": best_item["galWebImageUrl"],
            "photo_title": best_item.get("galTitle", ""),
            "photo_location": best_item.get("galPhotographyLocation", ""),
            "photo_credit": best_item.get("galPhotographer", ""),
            "photo_source": "한국관광공사 포토코리아",
        }

    def _best_item(self, place_name, items):
        normalized_name = normalize_name(place_name)

        def score(item):
            title = normalize_name(item.get("galTitle", ""))
            keywords = normalize_name(item.get("galSearchKeyword", ""))
            location = item.get("galPhotographyLocation", "")
            return (
                100 if title == normalized_name else 0,
                40 if normalized_name and normalized_name in title else 0,
                20 if normalized_name and normalized_name in keywords else 0,
                10 if "강릉" in location else 0,
            )

        return max(items, key=score, default=None)

    def _initialize(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS place_photos (
                    normalized_name TEXT PRIMARY KEY,
                    place_name TEXT NOT NULL,
                    photo_url TEXT NOT NULL DEFAULT '',
                    photo_title TEXT NOT NULL DEFAULT '',
                    photo_location TEXT NOT NULL DEFAULT '',
                    photo_credit TEXT NOT NULL DEFAULT '',
                    photo_source TEXT NOT NULL DEFAULT '',
                    fetched_at TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def _get_cached(self, normalized_name):
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT * FROM place_photos WHERE normalized_name = ?",
                (normalized_name,),
            ).fetchone()
        if not row:
            return None
        if not row["photo_url"]:
            return {}
        return {
            "photo_url": row["photo_url"],
            "photo_title": row["photo_title"],
            "photo_location": row["photo_location"],
            "photo_credit": row["photo_credit"],
            "photo_source": row["photo_source"],
        }

    def _save_cached(self, normalized_name, place_name, photo):
        photo = photo or {}
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """
                INSERT INTO place_photos(
                    normalized_name, place_name, photo_url, photo_title,
                    photo_location, photo_credit, photo_source, fetched_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(normalized_name) DO UPDATE SET
                    place_name = excluded.place_name,
                    photo_url = excluded.photo_url,
                    photo_title = excluded.photo_title,
                    photo_location = excluded.photo_location,
                    photo_credit = excluded.photo_credit,
                    photo_source = excluded.photo_source,
                    fetched_at = excluded.fetched_at
                """,
                (
                    normalized_name,
                    place_name,
                    photo.get("photo_url", ""),
                    photo.get("photo_title", ""),
                    photo.get("photo_location", ""),
                    photo.get("photo_credit", ""),
                    photo.get("photo_source", ""),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            connection.commit()
