import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.tour_content_client import TourContentClient
from app.services.tour_place_repository import TourPlaceRepository


def main():
    places = TourContentClient().fetch_gangneung_places()
    repository = TourPlaceRepository()
    repository.replace_all(places)
    print(f"synced={repository.count()} database={repository.database_path}")


if __name__ == "__main__":
    main()
