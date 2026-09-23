import { useEffect, useMemo, useState } from "react";
import Timeline from "../components/Timeline";
import ClusterDetail from "../components/ClusterDetail";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const POLL_INTERVAL_MS = 2500;

export default function Home() {
  const [timeline, setTimeline] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [activeSources, setActiveSources] = useState(new Set());
  const [allSources, setAllSources] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  async function loadData() {
    try {
      const [timelineRes, clustersRes] = await Promise.all([
        fetch(`${API_BASE}/timeline`),
        fetch(`${API_BASE}/clusters`),
      ]);
      if (!timelineRes.ok || !clustersRes.ok) throw new Error("Backend not reachable");

      const timelineJson = await timelineRes.json();
      const clustersJson = await clustersRes.json();

      setTimeline(timelineJson.timeline);
      setClusters(clustersJson.clusters);

      const sources = new Set(timelineJson.timeline.flatMap((t) => t.sources));
      setAllSources((prev) => (prev.length ? prev : Array.from(sources)));
      setActiveSources((prev) => (prev.size ? prev : sources));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`${API_BASE}/ingest/status/${jobId}`);
      const json = await res.json();
      setJobStatus(json.job.status);

      if (json.job.status === "done" || json.job.status === "failed") {
        clearInterval(interval);
        setJobId(null);
        if (json.job.status === "done") loadData();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId]);

  async function handleRefresh() {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ingest/trigger`, { method: "POST" });
      if (!res.ok) throw new Error("Could not start ingestion");
      const json = await res.json();
      setJobId(json.jobId);
      setJobStatus("running");
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleSource(source) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  const filteredTimeline = useMemo(
    () => timeline.filter((t) => t.sources.some((s) => activeSources.has(s))),
    [timeline, activeSources]
  );

  const filteredClusters = useMemo(() => {
    const visibleIds = new Set(filteredTimeline.map((t) => t.clusterId));
    return clusters.filter((c) => visibleIds.has(c.id));
  }, [clusters, filteredTimeline]);

  return (
    <div>
      <header className="masthead">
        <div>
          <h1>News Pulse</h1>
          <div className="dateline">TOPIC-CLUSTERED WIRE — LIVE TIMELINE</div>
        </div>
        <button
          className="refresh-btn"
          data-state={jobId ? "polling" : "idle"}
          onClick={handleRefresh}
          disabled={!!jobId}
        >
          {jobId ? `INGESTING (${jobStatus})…` : "↻ REFRESH DATA"}
        </button>
      </header>

      <div className="layout">
        <aside className="filter-rail">
          <h3>SOURCES</h3>
          {allSources.map((source) => (
            <label className="filter-row" key={source}>
              <input
                type="checkbox"
                checked={activeSources.has(source)}
                onChange={() => toggleSource(source)}
              />
              {source}
            </label>
          ))}
        </aside>

        <main className="main-col">
          {error && <div className="error-banner">{error}</div>}

          <Timeline items={filteredTimeline} onSelect={setSelectedCluster} />

          <div className="cluster-list">
            {filteredClusters.map((c, idx) => (
              <button
                className="cluster-row"
                key={c.id}
                onClick={() => setSelectedCluster(c.id)}
              >
                <span className="idx">{String(idx + 1).padStart(2, "0")}</span>
                <h2>{c.label}</h2>
                <span className="meta">
                  {c.article_count} articles · {new Date(c.earliest).toLocaleDateString()} →{" "}
                  {new Date(c.latest).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>

      <ClusterDetail clusterId={selectedCluster} onClose={() => setSelectedCluster(null)} />
    </div>
  );
}
