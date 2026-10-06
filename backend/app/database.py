from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("ROUTE53_DB_PATH", Path(__file__).resolve().parent.parent / "route53.db"))


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def db():
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
