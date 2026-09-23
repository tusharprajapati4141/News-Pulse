"""
News Pulse - Part 1: RSS ingestion & topic grouping.

Run standalone:      python scraper.py
Triggered by Node:   node calls this as a subprocess (see backend/routes/ingest.js)

Approach used: Option A - keyword / word-overlap clustering (see README for why).
"""

import re
import sys
import time
import sqlite3
import hashlib
from datetime import datetime, timezone

import feedparser
import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from db import get_connection, init_db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FEEDS = {
    "BBC News": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

REQUEST_TIMEOUT = 10
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; NewsPulseBot/1.0; +https://example.com/bot)"
}

# Overlap threshold: two articles are "the same topic" if they share this
# many meaningful (non-stopword) words in their headline+summary.
OVERLAP_THRESHOLD = 3

STOPWORDS = set("""
a an the is are was were be been being to of in on for and or but with
at by from up about into over after under again further then once here
there when where why how all any both each few more most other some
such no nor not only own same so than too very s t can will just don
should now this that these those it its it's as if
""".split())


# ---------------------------------------------------------------------------
# 1a. Ingestion & normalization
# ---------------------------------------------------------------------------

def normalize_date(raw_date):
    """RSS feeds use wildly inconsistent date formats. Normalize to ISO 8601 UTC.
    Falls back to 'now' if the date is missing or unparseable -- better to have
    an article show up at the end of the timeline than to crash the run."""
    if not raw_date:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = dateparser.parse(raw_date)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError):
        return datetime.now(timezone.utc).isoformat()


def extract_summary(entry):
    """Different feeds put the summary in different fields."""
    if hasattr(entry, "content") and entry.content:
        return BeautifulSoup(entry.content[0].value, "html.parser").get_text(strip=True)
    if hasattr(entry, "summary"):
        return BeautifulSoup(entry.summary, "html.parser").get_text(strip=True)
    if hasattr(entry, "description"):
        return BeautifulSoup(entry.description, "html.parser").get_text(strip=True)
    return ""


def fetch_full_body(url):
    """Fetch the article page and pull out the main body text.
    Plain BeautifulSoup heuristic: grab all <p> tags inside the largest
    <article>/<main> block, or fall back to all <p> tags on the page.
    Returns "" (never raises) if the page fails to load or parse -- a single
    dead link should not kill the whole run."""
    try:
        resp = requests.get(url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        container = soup.find("article") or soup.find("main") or soup
        paragraphs = container.find_all("p")
        text = " ".join(p.get_text(strip=True) for p in paragraphs)
        return text[:5000]  # cap body length, we don't need the whole page
    except Exception as exc:  # noqa: BLE001 - intentionally broad, must not crash the run
        print(f"  [warn] could not fetch full body for {url}: {exc}")
        return ""


def ingest_feed(source_name, feed_url, conn):
    print(f"Fetching {source_name} ...")
    parsed = feedparser.parse(feed_url)
    new_count = 0

    for entry in parsed.entries:
        url = getattr(entry, "link", None)
        if not url:
            continue

        headline = getattr(entry, "title", "(no title)")
        summary = extract_summary(entry)
        raw_date = getattr(entry, "published", None) or getattr(entry, "updated", None)
        published_at = normalize_date(raw_date)

        # Dedup check BEFORE the expensive full-text fetch, so re-runs are cheap.
        exists = conn.execute(
            "SELECT id FROM articles WHERE url = ?", (url,)
        ).fetchone()
        if exists:
            continue

        body = fetch_full_body(url)

        conn.execute(
            """INSERT INTO articles (url, source, headline, summary, body, published_at, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (url, source_name, headline, summary, body, published_at,
             datetime.now(timezone.utc).isoformat()),
        )
        new_count += 1
        time.sleep(0.3)  # be polite to news servers

    conn.commit()
    print(f"  -> {new_count} new articles from {source_name}")
    return new_count


# ---------------------------------------------------------------------------
# 1b. Topic grouping (keyword / word-overlap)
# ---------------------------------------------------------------------------

def significant_words(text):
    words = re.findall(r"[a-zA-Z']+", (text or "").lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def cluster_articles(conn):
    """Simple greedy word-overlap clustering, re-run over ALL unclustered
    articles each time. This intentionally re-evaluates clustering rather
    than incrementally patching it, since new articles can bridge two
    previously-separate stories."""
    rows = conn.execute(
        "SELECT id, headline, summary FROM articles WHERE cluster_id IS NULL"
    ).fetchall()

    if not rows:
        print("No unclustered articles.")
        return

    article_words = {row[0]: significant_words(f"{row[1]} {row[2]}") for row in rows}
    ids = list(article_words.keys())

    # Union-find style grouping via simple adjacency + BFS.
    visited = set()
    groups = []
    for aid in ids:
        if aid in visited:
            continue
        group = [aid]
        visited.add(aid)
        queue = [aid]
        while queue:
            current = queue.pop()
            for other in ids:
                if other in visited:
                    continue
                overlap = article_words[current] & article_words[other]
                if len(overlap) >= OVERLAP_THRESHOLD:
                    visited.add(other)
                    group.append(other)
                    queue.append(other)
        groups.append(group)

    for group in groups:
        # Label = most common significant words across the group's articles.
        word_counts = {}
        for aid in group:
            for w in article_words[aid]:
                word_counts[w] = word_counts.get(w, 0) + 1
        top_words = sorted(word_counts, key=word_counts.get, reverse=True)[:4]
        label = " / ".join(top_words) if top_words else "General"

        cur = conn.execute(
            "INSERT INTO clusters (label, keywords, created_at) VALUES (?, ?, ?)",
            (label.title(), ", ".join(top_words), datetime.now(timezone.utc).isoformat()),
        )
        cluster_id = cur.lastrowid
        conn.executemany(
            "UPDATE articles SET cluster_id = ? WHERE id = ?",
            [(cluster_id, aid) for aid in group],
        )

    conn.commit()
    print(f"Created/updated {len(groups)} clusters from {len(ids)} articles.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def run():
    init_db()
    conn = get_connection()
    total_new = 0
    for name, url in FEEDS.items():
        try:
            total_new += ingest_feed(name, url, conn)
        except Exception as exc:  # noqa: BLE001 - one bad feed shouldn't stop the others
            print(f"  [warn] feed '{name}' failed entirely: {exc}")

    cluster_articles(conn)
    conn.close()
    print(f"Done. {total_new} new articles ingested this run.")


if __name__ == "__main__":
    run()
    sys.exit(0)
