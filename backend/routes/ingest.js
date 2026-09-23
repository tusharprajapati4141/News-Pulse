const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRAPER_SCRIPT = path.resolve(
  __dirname,
  "..",
  process.env.SCRAPER_SCRIPT || "../scraper/scraper.py"
);

// POST /ingest/trigger - runs the Python pipeline as a subprocess, returns a job ID immediately
router.post("/ingest/trigger", (req, res) => {
  const jobId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO ingest_jobs (id, status, started_at) VALUES (?, ?, ?)"
  ).run(jobId, "running", now);

  const child = spawn(PYTHON_BIN, [SCRAPER_SCRIPT], {
    cwd: path.dirname(SCRAPER_SCRIPT),
  });

  let stderrOutput = "";
  child.stderr.on("data", (chunk) => {
    stderrOutput += chunk.toString();
  });

  child.on("close", (code) => {
    const finishedAt = new Date().toISOString();
    if (code === 0) {
      db.prepare(
        "UPDATE ingest_jobs SET status = ?, finished_at = ?, message = ? WHERE id = ?"
      ).run("done", finishedAt, "Ingestion completed successfully", jobId);
    } else {
      db.prepare(
        "UPDATE ingest_jobs SET status = ?, finished_at = ?, message = ? WHERE id = ?"
      ).run("failed", finishedAt, stderrOutput.slice(0, 2000) || `exit code ${code}`, jobId);
    }
  });

  child.on("error", (err) => {
    db.prepare(
      "UPDATE ingest_jobs SET status = ?, finished_at = ?, message = ? WHERE id = ?"
    ).run("failed", new Date().toISOString(), err.message, jobId);
  });

  res.status(202).json({ jobId, status: "running" });
});

// GET /ingest/status/:jobId - poll job status
router.get("/ingest/status/:jobId", (req, res) => {
  const job = db
    .prepare("SELECT * FROM ingest_jobs WHERE id = ?")
    .get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({ job });
});

module.exports = router;
