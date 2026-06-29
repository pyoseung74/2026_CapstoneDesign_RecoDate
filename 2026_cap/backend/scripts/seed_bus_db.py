import argparse
import csv
import sqlite3
from pathlib import Path

from app.config import settings
from app.services.gangneung_bis_client import GangneungBisClient
from app.services.tago_client import TagoClient


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "gangneung_bus.db"


def create_schema(connection):
    connection.executescript(
        """
        DROP TABLE IF EXISTS route_stops;
        DROP TABLE IF EXISTS bus_routes;
        DROP TABLE IF EXISTS bus_stops;

        CREATE TABLE bus_stops (
            node_id TEXT PRIMARY KEY,
            node_name TEXT NOT NULL,
            node_no TEXT,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            source TEXT NOT NULL
        );

        CREATE TABLE bus_routes (
            route_id TEXT PRIMARY KEY,
            route_no TEXT NOT NULL,
            route_type TEXT,
            start_node_name TEXT,
            end_node_name TEXT
        );

        CREATE TABLE route_stops (
            route_id TEXT NOT NULL REFERENCES bus_routes(route_id),
            node_id TEXT NOT NULL REFERENCES bus_stops(node_id),
            node_ord INTEGER NOT NULL,
            updown_code TEXT,
            PRIMARY KEY (route_id, node_ord)
        );

        CREATE INDEX idx_bus_stops_location ON bus_stops(lat, lon);
        CREATE INDEX idx_route_stops_node ON route_stops(node_id);
        """
    )


def import_csv_stops(connection, csv_path):
    if not csv_path:
        return 0
    inserted = 0
    with Path(csv_path).open(encoding="cp949", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            if row.get("도시코드") != settings.tago_city_code:
                continue
            connection.execute(
                """
                INSERT OR REPLACE INTO bus_stops (node_id, node_name, node_no, lat, lon, source)
                VALUES (?, ?, ?, ?, ?, 'csv')
                """,
                (
                    row["정류장번호"],
                    row["정류장명"],
                    row.get("모바일단축번호", ""),
                    float(row["위도"]),
                    float(row["경도"]),
                ),
            )
            inserted += 1
    return inserted


def import_tago_routes(connection):
    client = TagoClient()
    routes = client.get_route_list()
    for route in routes:
        route_id = route["routeid"]
        connection.execute(
            """
            INSERT OR REPLACE INTO bus_routes (
                route_id, route_no, route_type, start_node_name, end_node_name
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                route_id,
                route.get("routeno", ""),
                route.get("routetp", ""),
                route.get("startnodenm", ""),
                route.get("endnodenm", ""),
            ),
        )
        for stop in client.get_route_stops(route_id):
            connection.execute(
                """
                INSERT OR REPLACE INTO bus_stops (node_id, node_name, node_no, lat, lon, source)
                VALUES (?, ?, ?, ?, ?, 'tago')
                """,
                (
                    stop["nodeid"],
                    stop.get("nodenm", ""),
                    stop.get("nodeno", ""),
                    float(stop["gpslati"]),
                    float(stop["gpslong"]),
                ),
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO route_stops (route_id, node_id, node_ord, updown_code)
                VALUES (?, ?, ?, ?)
                """,
                (route_id, stop["nodeid"], int(stop["nodeord"]), stop.get("updowncd", "")),
            )
        connection.commit()
    return len(routes)


def import_gangneung_bis_routes(connection):
    client = GangneungBisClient()
    routes = client.get_route_list()
    inserted_routes = 0
    for route in routes:
        stops = client.get_route_stops(route["route_id"])
        if not stops:
            continue
        connection.execute(
            """
            INSERT OR REPLACE INTO bus_routes (
                route_id, route_no, route_type, start_node_name, end_node_name
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                route["route_id"],
                route["route_no"],
                "gangneung_bis",
                stops[0].get("stationNm", ""),
                stops[-1].get("stationNm", ""),
            ),
        )
        for stop in stops:
            connection.execute(
                """
                INSERT OR REPLACE INTO bus_stops (node_id, node_name, node_no, lat, lon, source)
                VALUES (?, ?, ?, ?, ?, 'gangneung_bis')
                """,
                (
                    stop["stationId2"],
                    stop.get("stationNm", ""),
                    stop.get("stationId2", ""),
                    float(stop["vertexY"]),
                    float(stop["vertexX"]),
                ),
            )
            node_ord = int(stop["stationOrder"])
            turn_seq = int(stop.get("turnSeq") or 0)
            connection.execute(
                """
                INSERT OR REPLACE INTO route_stops (route_id, node_id, node_ord, updown_code)
                VALUES (?, ?, ?, ?)
                """,
                (
                    route["route_id"],
                    stop["stationId2"],
                    node_ord,
                    "up" if not turn_seq or node_ord <= turn_seq else "down",
                ),
            )
        connection.commit()
        inserted_routes += 1
    return inserted_routes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="전국 버스정류장 위치정보 CSV 경로")
    parser.add_argument("--csv-only", action="store_true", help="CSV 정류장만 넣고 TAGO API는 호출하지 않음")
    parser.add_argument("--gangneung-bis", action="store_true")
    args = parser.parse_args()

    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH) as connection:
        create_schema(connection)
        csv_count = import_csv_stops(connection, args.csv)
        if args.gangneung_bis:
            route_count = import_gangneung_bis_routes(connection)
        else:
            route_count = 0 if args.csv_only else import_tago_routes(connection)
        stop_count = connection.execute("SELECT COUNT(*) FROM bus_stops").fetchone()[0]
        route_stop_count = connection.execute("SELECT COUNT(*) FROM route_stops").fetchone()[0]
        connection.commit()

    print(f"stops={stop_count} csv_stops={csv_count} routes={route_count} route_stops={route_stop_count}")
    print(f"database={DATABASE_PATH}")


if __name__ == "__main__":
    main()
