const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /clusters - label, article count, time range per cluster
router.get("/clusters", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT
           c.id,
           c.label,
           c.keywords,
           COUNT(a.id) AS article_count,
           MIN(a.published_at) AS earliest,
           MAX(a.published_at) AS latest
         FROM clusters c
         LEFT JOIN articles a ON a.cluster_id = c.id
         GROUP BY c.id
         ORDER BY latest DESC`
      )
      .all();

    res.json({ clusters: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load clusters" });
  }
});

// GET /clusters/:id - full detail, articles sorted chronologically
router.get("/clusters/:id", (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "cluster id must be a number" });
  }

  try {
    const cluster = db.prepare("SELECT * FROM clusters WHERE id = ?").get(id);
    if (!cluster) {
      return res.status(404).json({ error: "Cluster not found" });
    }

    const articles = db
      .prepare(
        `SELECT id, url, source, headline, summary, published_at
         FROM articles WHERE cluster_id = ? ORDER BY published_at ASC`
      )
      .all(id);

    res.json({ cluster, articles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load cluster detail" });
  }
});

module.exports = router;
