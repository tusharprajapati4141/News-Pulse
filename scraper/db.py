"""
Shared SQLite helper for News Pulse.

The Node backend reads from the SAME sqlite file (see backend/db.js), so the
schema defined here is the single source of truth for both sides.
"""

import os
import sqlite3

# The DB lives at the repo root so both the Python pipeline and the Node
# backend can point at it with a simple relative path / env var.
DB_PATH = os.environ.get("NEWS_PULSE_DB", os.path.join(
    os.path.dirname(__file__), "..", "data", "news_pulse.db"
))


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        headline TEXT NOT NULL,
        summary TEXT,
        body TEXT,
        published_at TEXT,           -- ISO 8601, normalized
        fetched_at TEXT NOT NULL,
        cluster_id INTEGER,
        FOREIGN KEY (cluster_id) REFERENCES clusters(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        keywords TEXT,                -- comma separated top keywords
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS ingest_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,         -- pending | running | done | failed
        started_at TEXT,
        finished_at TEXT,
        message TEXT
    )
    """)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB at {DB_PATH}")
