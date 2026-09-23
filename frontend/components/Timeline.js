const LANE_HEIGHT = 26;
// Minimum horizontal gap (in % of axis width) two markers must keep before
// they're allowed to share a lane -- otherwise text/hitboxes overlap even
// when their real time ranges barely touch.
const MIN_GAP_PCT = 6;

// Greedy interval-scheduling: walk items left-to-right and drop each one into
// the first lane whose last marker ends far enough to the left. This is the
// same idea calendar apps use to stack overlapping events side by side
// instead of letting them visually collide.
function assignLanes(positioned) {
  const lanes = []; // each entry: rightmost % edge used so far in that lane
  return positioned.map((item) => {
    let lane = lanes.findIndex((rightEdge) => item.left >= rightEdge + MIN_GAP_PCT);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(0);
    }
    lanes[lane] = item.left + item.width;
    return { ...item, lane };
  });
}

function percentile(sortedNums, p) {
  const idx = (sortedNums.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedNums[lo];
  return sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (idx - lo);
}

const TICK_COUNT = 6;

function buildTicks(min, max, posFor) {
  const span = max - min;
  return Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const t = min + (span * i) / TICK_COUNT;
    const date = new Date(t);
    return {
      left: posFor(date.toISOString()),
      label: date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });
}

export default function Timeline({ items, onSelect }) {
  if (!items.length) {
    return <div className="empty-state mono">No clusters in range yet. Try Refresh.</div>;
  }

  // A single mis-dated article (bad/missing pubDate in a feed) can otherwise
  // dominate the min/max and squash every normal cluster into one corner.
  // Use the 5th/95th percentile of article times as the visible axis range,
  // and clamp anything outside it to the edge instead of stretching the scale.
  const times = items
    .flatMap((i) => [new Date(i.start).getTime(), new Date(i.end).getTime()])
    .sort((a, b) => a - b);

  const min = percentile(times, 0.05);
  const max = percentile(times, 0.95);
  const span = Math.max(max - min, 1);

  const posFor = (iso) => {
    const pct = ((new Date(iso).getTime() - min) / span) * 100;
    return Math.min(100, Math.max(0, pct));
  };

  const positioned = items
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((item) => {
      const left = posFor(item.start);
      const right = posFor(item.end);
      return { ...item, left, width: Math.max(right - left, 1.5) };
    });

  const laned = assignLanes(positioned);
  const laneCount = Math.max(...laned.map((i) => i.lane)) + 1;
  const ticks = buildTicks(min, max, posFor);

  return (
    <div className="timeline-strip">
      <div className="timeline-axis" style={{ height: laneCount * LANE_HEIGHT + 10 }}>
        {ticks.map((tick, i) => (
          <div key={i} className="timeline-gridline" style={{ left: `${tick.left}%` }} />
        ))}

        {laned.map((item) => {
          const size = 10 + item.intensity * 12;
          return (
            <div
              key={item.clusterId}
              className="timeline-marker"
              style={{
                left: `${item.left}%`,
                width: `${item.width}%`,
                height: `${size}px`,
                top: `${item.lane * LANE_HEIGHT + LANE_HEIGHT / 2}px`,
              }}
              onClick={() => onSelect(item.clusterId)}
              title={`${item.label} — ${item.articleCount} articles`}
            />
          );
        })}
      </div>

      <div className="timeline-ticks">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="timeline-tick-label mono"
            style={{ left: `${tick.left}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}