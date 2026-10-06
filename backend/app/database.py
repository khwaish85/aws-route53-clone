from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DB_PATH = Path(os.getenv("ROUTE53_DB_PATH", Path(__file__).resolve().parent.parent / "route53.db"))


class LibsqlRow:
    """Provide the mapping and positional access used by sqlite3.Row."""

    def __init__(self, columns: list[str], values: tuple[Any, ...]):
        self._columns = columns
        self._values = values
        self._mapping = dict(zip(columns, values, strict=True))

    def __getitem__(self, key: str | int) -> Any:
        return self._values[key] if isinstance(key, int) else self._mapping[key]

    def keys(self):
        return self._mapping.keys()


class LibsqlCursor:
    def __init__(self, cursor: Any):
        self._cursor = cursor

    def _row(self, values: tuple[Any, ...] | None) -> LibsqlRow | None:
        if values is None:
            return None
        columns = [column[0] for column in self._cursor.description or []]
        return LibsqlRow(columns, values)

    def fetchone(self) -> LibsqlRow | None:
        return self._row(self._cursor.fetchone())

    def fetchall(self) -> list[LibsqlRow]:
        return [row for values in self._cursor.fetchall() if (row := self._row(values)) is not None]


class LibsqlConnection:
    """Adapt libSQL's DB-API connection to the sqlite3 calls used by the app."""

    def __init__(self, connection: Any):
        self._connection = connection

    def execute(self, sql: str, parameters: Any = ()) -> LibsqlCursor:
        return LibsqlCursor(self._connection.execute(sql, parameters))

    def executemany(self, sql: str, parameters: Any) -> LibsqlCursor:
        return LibsqlCursor(self._connection.executemany(sql, parameters))

    def executescript(self, sql: str) -> LibsqlCursor:
        return LibsqlCursor(self._connection.executescript(sql))

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def connect() -> sqlite3.Connection | LibsqlConnection:
    turso_url = os.getenv("TURSO_DATABASE_URL", "").strip()
    if turso_url:
        turso_token = os.getenv("TURSO_AUTH_TOKEN", "").strip()
        if not turso_token and turso_url.startswith(("libsql://", "https://")):
            raise RuntimeError("TURSO_AUTH_TOKEN is required for a remote Turso database")
        import libsql

        connection = LibsqlConnection(libsql.connect(database=turso_url, auth_token=turso_token))
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def db() -> Iterator[sqlite3.Connection | LibsqlConnection]:
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                display_name TEXT NOT NULL,
                account_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS hosted_zones (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                zone_type TEXT NOT NULL CHECK(zone_type IN ('public', 'private')),
                vpc_region TEXT,
                vpc_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                zone_id TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
                name TEXT NOT NULL COLLATE NOCASE,
                type TEXT NOT NULL,
                value TEXT NOT NULL,
                ttl INTEGER NOT NULL DEFAULT 300 CHECK(ttl >= 0),
                routing_policy TEXT NOT NULL DEFAULT 'Simple',
                evaluate_target_health INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(zone_id, name, type)
            );
            CREATE INDEX IF NOT EXISTS idx_hosted_zones_name ON hosted_zones(name);
            CREATE INDEX IF NOT EXISTS idx_records_zone_name ON records(zone_id, name);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO users (id, email, password, display_name, account_id) VALUES (1, ?, ?, ?, ?)",
            ("khwaish.yadav@route53.local", "password", "Khwaish Yadav", "4587-2106-9342"),
        )
        connection.execute(
            """UPDATE users SET email = ?, display_name = ?, account_id = ?
               WHERE id = 1 AND email = 'admin@route53.local'""",
            ("khwaish.yadav@route53.local", "Khwaish Yadav", "4587-2106-9342"),
        )
        connection.execute("PRAGMA optimize")
