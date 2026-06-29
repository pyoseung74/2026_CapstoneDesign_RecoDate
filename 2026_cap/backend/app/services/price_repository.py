import sqlite3
from contextlib import closing
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "recodate_prices.db"


def normalize_price_name(name):
    return (name or "").replace(" ", "").replace("[중식]", "").lower()


class PriceRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)

    def find_price(self, place_name):
        if not self.database_path.exists():
            return None

        normalized_name = normalize_price_name(place_name)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                """
                SELECT p.place_name, p.category, p.price_won, p.price_type,
                       p.price_label, p.source_url, p.updated_at
                FROM place_price_aliases AS a
                JOIN place_prices AS p ON p.id = a.place_price_id
                WHERE a.normalized_alias = ?
                LIMIT 1
                """,
                (normalized_name,),
            ).fetchone()

        return dict(row) if row else None
