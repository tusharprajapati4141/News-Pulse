require("dotenv").config();
const express = require("express");
const cors = require("cors");

const clustersRouter = require("./routes/clusters");
const timelineRouter = require("./routes/timeline");
const ingestRouter = require("./routes/ingest");

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: CORS_ORIGIN.split(",") }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "news-pulse-backend" });
});

app.use(clustersRouter);
app.use(timelineRouter);
app.use(ingestRouter);

// 400 for anything that reaches here with a bad request shape
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`News Pulse backend running on http://localhost:${PORT}`);
});
