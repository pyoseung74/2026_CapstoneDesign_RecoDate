from app.services.osm_place_repository import OsmPlaceRepository


def search_offline_places(center, recodate_category, source_categories, radius_km, count, strict_category=False):
    """Search the local RecoDate place database.

    The function name is kept because recommendation_service already calls it in
    many places. The implementation now reads the OSM-backed SQLite table instead
    of the old hand-written prototype list.
    """
    return OsmPlaceRepository().search(
        center,
        recodate_category,
        radius_km,
        limit=count,
        source_categories=source_categories,
        strict_category=strict_category,
    )


def search_offline_keyword(keyword, count):
    return OsmPlaceRepository().search_keyword(keyword, limit=count)
