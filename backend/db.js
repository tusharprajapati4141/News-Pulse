const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || "../data/news_pulse.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Mirrors scraper/db.py exactly - both sides must agree on this schema.
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT,
    body TEXT,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    cluster_id INTEGER,
    FOREIGN KEY (cluster_id) REFERENCES clusters(id)
  );

  CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    keywords TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ingest_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    message TEXT
  );
`);

module.exports = db;
