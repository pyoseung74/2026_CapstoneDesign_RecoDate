import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import osmium
except ModuleNotFoundError as exc:
    raise SystemExit(
        "osmium 패키지가 필요합니다. backend 가상환경에서 `python -m pip install osmium` 후 다시 실행하세요."
    ) from exc

from app.services.osm_place_repository import OsmPlaceRepository


SOURCE_CATEGORY_MAP = {
    "restaurant": ("음식점", "음식점"),
    "fast_food": ("음식점", "패스트푸드"),
    "food_court": ("음식점", "푸드코트"),
    "cafe": ("카페", "카페"),
    "bar": ("술집", "바"),
    "pub": ("술집", "펍"),
    "biergarten": ("술집", "비어가든"),
    "ice_cream": ("카페", "디저트"),
    "cinema": ("공연/관람", "영화관"),
    "theatre": ("공연/관람", "공연장"),
    "arts_centre": ("공연/관람", "문화센터"),
    "community_centre": ("공연/관람", "문화센터"),
    "place_of_worship": ("관광지", "종교시설"),
    "library": ("공연/관람", "도서관"),
    "marketplace": ("쇼핑", "시장"),
    "college": ("관광지", "캠퍼스"),
    "university": ("관광지", "캠퍼스"),
}

TOURISM_CATEGORY_MAP = {
    "attraction": ("관광지", "관광명소"),
    "viewpoint": ("관광지", "전망대"),
    "theme_park": ("액티비티", "테마파크"),
    "museum": ("공연/관람", "박물관"),
    "gallery": ("공연/관람", "미술관"),
    "zoo": ("액티비티", "동물원"),
    "aquarium": ("액티비티", "수족관"),
    "hotel": ("숙박", "호텔"),
    "motel": ("숙박", "모텔"),
    "guest_house": ("숙박", "게스트하우스"),
    "hostel": ("숙박", "호스텔"),
    "camp_site": ("숙박", "캠핑장"),
}

LEISURE_CATEGORY_MAP = {
    "park": ("관광지", "공원"),
    "garden": ("관광지", "정원"),
    "nature_reserve": ("관광지", "자연보호구역"),
    "water_park": ("액티비티", "워터파크"),
    "sports_centre": ("액티비티", "스포츠센터"),
    "stadium": ("액티비티", "경기장"),
    "swimming_pool": ("액티비티", "수영장"),
    "bowling_alley": ("액티비티", "볼링장"),
    "escape_game": ("액티비티", "방탈출"),
    "fitness_centre": ("액티비티", "피트니스"),
    "amusement_arcade": ("액티비티", "오락실"),
}

HISTORIC_SOURCE_MAP = {
    "castle": "성/궁궐",
    "monument": "기념물",
    "memorial": "기념관",
    "ruins": "유적",
    "archaeological_site": "유적",
}


def tag_value(tags, *keys):
    for key in keys:
        value = tags.get(key)
        if value:
            return str(value).strip()
    return ""


def tags_to_dict(tags):
    return {tag.k: tag.v for tag in tags}


def classify(tags):
    amenity = tags.get("amenity")
    tourism = tags.get("tourism")
    leisure = tags.get("leisure")
    historic = tags.get("historic")
    shop = tags.get("shop")
    natural = tags.get("natural")

    if amenity in SOURCE_CATEGORY_MAP:
        return SOURCE_CATEGORY_MAP[amenity]
    if tourism in TOURISM_CATEGORY_MAP:
        return TOURISM_CATEGORY_MAP[tourism]
    if leisure in LEISURE_CATEGORY_MAP:
        return LEISURE_CATEGORY_MAP[leisure]
    if historic:
        return "관광지", HISTORIC_SOURCE_MAP.get(historic, "역사명소")
    if shop in {"bakery", "confectionery", "tea", "coffee"}:
        return "카페", "디저트"
    if shop in {"mall", "department_store"}:
        return "쇼핑", "쇼핑"
    if natural in {"beach", "peak", "spring", "wood"}:
        return "관광지", "자연명소"
    return None


def clean_name(tags):
    name = tag_value(tags, "name:ko", "name", "brand:ko", "brand", "operator")
    if not name or len(name) < 2:
        return ""
    lowered = name.lower()
    if lowered in {"yes", "no", "unknown", "building"}:
        return ""
    return name


def address_from_tags(tags):
    parts = [
        tag_value(tags, "addr:province"),
        tag_value(tags, "addr:city"),
        tag_value(tags, "addr:district", "addr:suburb"),
        tag_value(tags, "addr:street"),
        tag_value(tags, "addr:housenumber"),
    ]
    return " ".join(part for part in parts if part)


def place_from_tags(osm_type, osm_id, lat, lon, tags):
    name = clean_name(tags)
    if not name:
        return None
    classified = classify(tags)
    if not classified:
        return None
    category, source_category = classified
    return {
        "id": f"{osm_type}_{osm_id}",
        "osm_type": osm_type,
        "osm_id": int(osm_id),
        "name": name,
        "category": category,
        "source_category": source_category,
        "address": address_from_tags(tags),
        "lat": float(lat),
        "lon": float(lon),
        "tel": tag_value(tags, "contact:phone", "phone"),
        "website": tag_value(tags, "contact:website", "website"),
        "opening_hours": tag_value(tags, "opening_hours"),
        "tags": {
            key: str(value)
            for key, value in tags.items()
            if key
            in {
                "amenity",
                "tourism",
                "leisure",
                "historic",
                "shop",
                "natural",
                "cuisine",
                "addr:province",
                "addr:city",
                "addr:district",
                "addr:street",
                "opening_hours",
            }
        },
    }


class OsmPlaceHandler(osmium.SimpleHandler):
    def __init__(self, repository, source_file, imported_at, include_ways=False, batch_size=1000):
        super().__init__()
        self.repository = repository
        self.source_file = source_file
        self.imported_at = imported_at
        self.include_ways = include_ways
        self.places = []
        self.batch_size = batch_size
        self.saved_count = 0
        self.raw_count = 0
        self.node_count = 0
        self.way_count = 0
        self.skipped_ways_without_location = 0

    def node(self, node):
        self.node_count += 1
        if not node.location.valid():
            return
        place = place_from_tags("node", node.id, node.location.lat, node.location.lon, tags_to_dict(node.tags))
        if place:
            self.add_place(place)

    def way(self, way):
        self.way_count += 1
        if not self.include_ways:
            return
        tags = tags_to_dict(way.tags)
        if not clean_name(tags) or not classify(tags):
            return
        coords = []
        try:
            for node in way.nodes:
                if node.location.valid():
                    coords.append((node.location.lat, node.location.lon))
        except Exception:
            self.skipped_ways_without_location += 1
            return
        if not coords:
            self.skipped_ways_without_location += 1
            return
        lat = sum(item[0] for item in coords) / len(coords)
        lon = sum(item[1] for item in coords) / len(coords)
        place = place_from_tags("way", way.id, lat, lon, tags)
        if place:
            self.add_place(place)

    def add_place(self, place):
        self.raw_count += 1
        self.places.append(place)
        if len(self.places) >= self.batch_size:
            self.flush()

    def flush(self):
        if not self.places:
            return
        self.repository.insert_many(
            dedupe_places(self.places),
            source_file=self.source_file,
            imported_at=self.imported_at,
        )
        self.saved_count += len(self.places)
        if self.saved_count % (self.batch_size * 10) == 0:
            print(
                f"progress saved_raw={self.saved_count} nodes_seen={self.node_count} ways_seen={self.way_count}",
                flush=True,
            )
        self.places = []


def dedupe_places(places):
    seen = set()
    result = []
    for place in places:
        key = ("".join(place["name"].lower().split()), round(place["lat"], 5), round(place["lon"], 5))
        if key in seen:
            continue
        seen.add(key)
        result.append(place)
    return result


def main():
    parser = argparse.ArgumentParser(description="Import Geofabrik South Korea OSM PBF into RecoDate SQLite.")
    parser.add_argument(
        "pbf",
        nargs="?",
        default=str(PROJECT_ROOT / "south-korea-260614.osm.pbf"),
        help="Path to South Korea .osm.pbf file",
    )
    parser.add_argument("--database", default="", help="Optional SQLite database path")
    parser.add_argument(
        "--include-ways",
        action="store_true",
        help="Also import way/building POIs by calculating a simple centroid. Slower, but more complete.",
    )
    args = parser.parse_args()

    pbf_path = Path(args.pbf)
    if not pbf_path.exists():
        raise SystemExit(f"PBF 파일을 찾을 수 없습니다: {pbf_path}")

    imported_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    repository = OsmPlaceRepository(args.database or None) if args.database else OsmPlaceRepository()
    repository.clear()
    handler = OsmPlaceHandler(
        repository,
        source_file=pbf_path.name,
        imported_at=imported_at,
        include_ways=args.include_ways,
    )
    print(f"reading={pbf_path} include_ways={args.include_ways}", flush=True)
    handler.apply_file(str(pbf_path), locations=args.include_ways, idx="flex_mem")
    handler.flush()
    print(f"raw={handler.raw_count} skipped_ways={handler.skipped_ways_without_location}")
    print(f"database={repository.database_path}")
    print(f"count={repository.count()}")
    print(f"by_category={repository.count_by_category()}")


if __name__ == "__main__":
    main()
