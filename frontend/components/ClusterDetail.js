import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function ClusterDetail({ clusterId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clusterId) return;
    setData(null);
    setError(null);

    fetch(`${API_BASE}/clusters/${clusterId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load this cluster");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [clusterId]);

  if (!clusterId) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          CLOSE
        </button>

        {error && <div className="error-banner">{error}</div>}

        {data && (
          <>
            <h2>{data.cluster.label}</h2>
            <div className="mono" style={{ color: "var(--muted)", marginBottom: 20 }}>
              {data.articles.length} article{data.articles.length !== 1 ? "s" : ""} ·
              {" "}
              keywords: {data.cluster.keywords}
            </div>

            {data.articles.map((a) => (
              <div className="article-item" key={a.id}>
                <h4>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.headline}
                  </a>
                </h4>
                <div className="meta">
                  {a.source} · {new Date(a.published_at).toLocaleString()}
                </div>
              </div>
            ))}
          </>
        )}

        {!data && !error && <p className="mono">Loading…</p>}
      </div>
    </div>
  );
}
