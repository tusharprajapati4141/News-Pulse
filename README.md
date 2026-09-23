# News Pulse — Topic-Clustered News Timeline

Full-stack developer internship assessment (Xponentium India). A small system that pulls
live articles from RSS feeds, groups related articles into topic clusters, and shows
those clusters as a visual timeline.

## Architecture

```
scraper/   Python  -> ingests RSS feeds, normalizes them, fetches full article text,
                       clusters articles by topic, writes to a shared SQLite DB
backend/   Node.js -> Express REST API that reads the same SQLite DB and serves
                       clusters / articles / timeline data, and can trigger the
                       scraper as a subprocess
frontend/  Next.js -> timeline visualization, cluster detail view, source filter,
                       "Refresh data" button that triggers + polls ingestion
data/      shared SQLite file (news_pulse.db) both scraper and backend read/write
```

The scraper and backend share one SQLite file instead of the backend calling the Python
process for every read — this keeps the API fast and lets the scraper run on its own
schedule (cron / GitHub Action) independent of the API being up.

## News sources used

- BBC News — `http://feeds.bbci.co.uk/news/rss.xml`
- NPR — `https://feeds.npr.org/1001/rss.xml`
- Al Jazeera — `https://www.aljazeera.com/xml/rss/all.xml`

## Topic-grouping approach

**Keyword / word-overlap grouping (Option A)**, not TF-IDF. Reasoning: with three
general-news feeds the vocabulary overlap between genuinely related articles is high
(shared proper nouns, shared event terms), so a threshold-based overlap check is simple,
explainable, and easy to tune without pulling in scikit-learn.

- Headline + summary are lowercased, split into words, and stopwords are removed.
- Two articles are linked if they share **3 or more** significant words
  (`OVERLAP_THRESHOLD` in `scraper/scraper.py`).
- Linked articles are grouped transitively (a BFS over the "shares 3+ words" graph), so
  A-B-C can end up in one cluster even if A and C share no words directly.
- A cluster's label is its 4 most frequent significant words across all its articles.
- Threshold of 3 was chosen empirically: 2 words merged unrelated stories that happened
  to share common nouns like "government" or "police"; 4 was too strict and left many
  clearly-related articles unclustered.

**Known limitation:** the transitive grouping (A-B-C via shared pairs) can occasionally
chain together two distinct-but-related stories into one oversized cluster (e.g. two
different court cases both using "trial", "judge", "court"). A stricter version would
require pairwise overlap *within* the final group, not just chained pairs — noted as a
follow-up rather than implemented, to keep the clustering step simple and explainable.

## Running locally (VS Code)

Open the `news-pulse` folder in VS Code, then open **3 separate integrated terminals**
(Terminal → Split Terminal) — one per component, since all three need to stay running
at once.

### 1. Python scraper

```bash
cd scraper
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python scraper.py               # populates ../data/news_pulse.db
```

Run this once first so the database has data before you start the backend/frontend.
Re-running it later only adds new articles (URLs already in the DB are skipped) and
re-clusters anything not yet clustered.

### 2. Node backend

```bash
cd backend
npm install
cp .env.example .env            # defaults work as-is for local dev
npm run dev                     # http://localhost:4000
```

### 3. Next.js frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                     # http://localhost:3000
```

Open `http://localhost:3000`. Click **Refresh data** to trigger the scraper from the UI
itself (it calls `POST /ingest/trigger` on the backend, then polls
`GET /ingest/status/:jobId` until it finishes, then reloads the timeline).

### Quick sanity checks

```bash
curl http://localhost:4000/clusters
curl http://localhost:4000/timeline
curl -X POST http://localhost:4000/ingest/trigger
```

## API endpoints (backend)

| Endpoint | Purpose |
|---|---|
| `GET /clusters` | label, article count, time range per cluster |
| `GET /clusters/:id` | full cluster detail, articles sorted chronologically |
| `GET /timeline` | clusters shaped for charting: start/end, count, intensity |
| `POST /ingest/trigger` | runs the Python pipeline as a subprocess, returns a job ID |
| `GET /ingest/status/:jobId` | poll job status (`pending`/`running`/`done`/`failed`) |

## Deployment

| Component | Suggested platform | Notes |
|---|---|---|
| Frontend | Netlify | Set `NEXT_PUBLIC_API_BASE` to the deployed backend URL |
| Backend API | Render / Railway | Set `CORS_ORIGIN` to the deployed frontend URL |
| Python pipeline | GitHub Actions cron, or triggered on-demand via the Node API | `POST /ingest/trigger` already spawns it as a subprocess, so on Render/Railway this works out of the box as long as Python is available on the same instance as the backend |
| Database | Persistent disk on Render/Railway (SQLite file), or swap to hosted Postgres | This repo ships with SQLite for simplicity; swapping `better-sqlite3`/`sqlite3` for a Postgres client is the main change needed to move to a hosted DB |

Deploying live (Vercel/Render accounts, env vars in each dashboard) is an account-specific
step for whoever submits this — the code above is ready to deploy as-is once those
accounts exist; there is nothing hardcoded that blocks it (no secrets, no hardcoded URLs).

## Assumptions made

- "At least three RSS feeds" → used exactly three general-news feeds (see above) rather
  than niche/topical feeds, so clustering has a realistic chance of finding cross-outlet
  overlap on the same stories.
- Cross-source story merging (recognizing the same story across two outlets as one
  event) was left as the stretch goal it's labeled as — not implemented.
- SQLite was chosen over Postgres/MongoDB for local runnability without extra services;
  the schema is intentionally close to a relational shape so swapping to Postgres later
  is a small change.
