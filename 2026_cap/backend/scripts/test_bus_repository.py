import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

from app.services.bus_repository import BusRepository
from scripts.seed_bus_db import create_schema


def insert_stop(connection, node_id, node_name, lat, lon):
    connection.execute(
        """
        INSERT INTO bus_stops (node_id, node_name, node_no, lat, lon, source)
        VALUES (?, ?, '', ?, ?, 'test')
        """,
        (node_id, node_name, lat, lon),
    )


def insert_route(connection, route_id, route_no, stops):
    connection.execute(
        """
        INSERT INTO bus_routes (route_id, route_no, route_type)
        VALUES (?, ?, '시내버스')
        """,
        (route_id, route_no),
    )
    for order, node_id in enumerate(stops, start=1):
        connection.execute(
            """
            INSERT INTO route_stops (route_id, node_id, node_ord, updown_code)
            VALUES (?, ?, ?, '0')
            """,
            (route_id, node_id, order),
        )


def main():
    temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    database_path = Path(temp_file.name)
    temp_file.close()
    try:
        with closing(sqlite3.connect(database_path)) as connection:
            create_schema(connection)
            insert_stop(connection, "A", "출발정류장", 37.7600, 128.9000)
            insert_stop(connection, "B", "중간정류장", 37.7650, 128.9050)
            insert_stop(connection, "C", "환승정류장", 37.7700, 128.9100)
            insert_stop(connection, "D", "도착정류장", 37.7750, 128.9150)
            insert_route(connection, "R100", "100", ["A", "B", "C"])
            insert_route(connection, "R200", "200", ["C", "D"])
            connection.commit()

        repository = BusRepository(database_path)
        direct = repository.find_route(
            {"name": "출발지", "lat": 37.7600, "lon": 128.9000},
            {"name": "중간 목적지", "lat": 37.7650, "lon": 128.9050},
        )
        transfer = repository.find_route(
            {"name": "출발지", "lat": 37.7600, "lon": 128.9000},
            {"name": "도착지", "lat": 37.7750, "lon": 128.9150},
        )
        assert [item["mode"] for item in direct["instructions"]] == ["bus"]
        assert [item["mode"] for item in transfer["instructions"]] == ["bus", "transfer", "bus"]
        assert "100번 버스" in direct["instructions"][0]["description"]
        assert "200번 버스" in transfer["instructions"][-1]["description"]
        print("direct_route=ok")
        print("one_transfer_route=ok")
    finally:
        database_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
