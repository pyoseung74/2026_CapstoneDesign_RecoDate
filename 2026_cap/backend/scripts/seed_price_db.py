import sqlite3
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "recodate_prices.db"
UPDATED_AT = "2026-05-31"
GANGNEUNG_PACKAGE_SOURCE = "https://www.gn.go.kr/museum/contents.do?key=892"
OJUKHEON_HANBOK_SOURCE = "https://www.gn.go.kr/museum/contents.do?key=3131"

PRICE_ROWS = [
    ("오죽헌·시립박물관", "문화/전시", 3000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, ["오죽헌시립박물관", "오죽헌"]),
    ("대관령박물관", "문화/전시", 1000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, []),
    ("강릉자수박물관", "문화/전시", 6000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, []),
    ("아라나비 체험", "해변 액티비티", 20000, "actual", "성인 개인 체험료", GANGNEUNG_PACKAGE_SOURCE, ["아라나비"]),
    ("하슬라아트월드", "문화/전시", 17000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, []),
    ("정동진시간박물관", "문화/전시", 9000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, []),
    ("커피커퍼 커피박물관", "문화/전시", 5000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, ["커피커퍼박물관"]),
    ("자연아 놀자", "실내 액티비티", 12000, "actual", "성인 개인 체험료", GANGNEUNG_PACKAGE_SOURCE, ["자연아놀자"]),
    ("경포아쿠아리움", "실내 액티비티", 20000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, []),
    ("환희컵박물관·장길환미술관", "문화/전시", 10000, "actual", "성인 개인 관람료", GANGNEUNG_PACKAGE_SOURCE, ["환희컵박물관", "장길환미술관"]),
    ("런닝맨·뮤즈 강릉점", "실내 액티비티", 22000, "actual", "성인 개인 이용료", GANGNEUNG_PACKAGE_SOURCE, ["런닝맨강릉점", "뮤즈강릉점"]),
    ("오죽헌 한복 체험", "문화/전시", 10000, "actual", "2시간 체험료", OJUKHEON_HANBOK_SOURCE, ["오죽헌한복체험"]),
]


def normalize_name(name):
    return (name or "").replace(" ", "").replace("[중식]", "").lower()


def seed_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.executescript(
            """
            DROP TABLE IF EXISTS place_price_aliases;
            DROP TABLE IF EXISTS place_prices;

            CREATE TABLE place_prices (
                id INTEGER PRIMARY KEY,
                place_name TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL,
                price_won INTEGER NOT NULL,
                price_type TEXT NOT NULL CHECK (price_type IN ('actual', 'estimated', 'free')),
                price_label TEXT NOT NULL,
                source_url TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE place_price_aliases (
                id INTEGER PRIMARY KEY,
                place_price_id INTEGER NOT NULL REFERENCES place_prices(id),
                alias TEXT NOT NULL,
                normalized_alias TEXT NOT NULL UNIQUE
            );
            """
        )

        for place_name, category, price_won, price_type, price_label, source_url, aliases in PRICE_ROWS:
            cursor = connection.execute(
                """
                INSERT INTO place_prices (
                    place_name, category, price_won, price_type, price_label, source_url, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (place_name, category, price_won, price_type, price_label, source_url, UPDATED_AT),
            )
            place_price_id = cursor.lastrowid
            for alias in [place_name, *aliases]:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO place_price_aliases (place_price_id, alias, normalized_alias)
                    VALUES (?, ?, ?)
                    """,
                    (place_price_id, alias, normalize_name(alias)),
                )

    print(f"seeded={len(PRICE_ROWS)} database={DATABASE_PATH}")


if __name__ == "__main__":
    seed_database()
