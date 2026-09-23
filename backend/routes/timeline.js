const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /timeline - shaped specifically for a charting library:
// each cluster becomes a block with a start/end range, not just a raw list.
router.get("/timeline", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT
           c.id,
           c.label,
           COUNT(a.id) AS article_count,
           MIN(a.published_at) AS start,
           MAX(a.published_at) AS end,
           GROUP_CONCAT(DISTINCT a.source) AS sources
         FROM clusters c
         JOIN articles a ON a.cluster_id = c.id
         GROUP BY c.id
         HAVING article_count > 0
         ORDER BY start ASC`
      )
      .all();

    const maxCount = Math.max(1, ...rows.map((r) => r.article_count));

    const timeline = rows.map((r) => ({
      clusterId: r.id,
      label: r.label,
      start: r.start,
      end: r.end,
      articleCount: r.article_count,
      // intensity: normalized 0-1 size metric a chart can map to marker size
      intensity: Number((r.article_count / maxCount).toFixed(2)),
      sources: r.sources ? r.sources.split(",") : [],
    }));

    res.json({ timeline });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build timeline" });
  }
});

module.exports = router;
