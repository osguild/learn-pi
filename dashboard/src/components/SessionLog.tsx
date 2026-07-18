import type { SessionLogEntry } from "../types";
import { formatDate } from "../api";

export function MinutesSparkline({ entries }: { entries: SessionLogEntry[] }) {
  const last = entries.slice(-20);
  if (last.length === 0) return null;
  const max = Math.max(...last.map((e) => e.minutes), 1);
  const w = 200;
  const h = 36;
  const step = last.length > 1 ? w / (last.length - 1) : w;
  const pts = last.map((e, i) => {
    const x = i * step;
    const y = h - (e.minutes / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="sparkline">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="dim small">
        last {last.length} sessions · max {max}m
      </div>
    </div>
  );
}

export function SessionLog({ entries }: { entries: SessionLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card sessions">
        <div className="card-title">session log</div>
        <div className="dim">(no sessions yet — run /learn-timer start)</div>
      </div>
    );
  }
  const ordered = [...entries].reverse();
  return (
    <div className="card sessions">
      <div className="card-title">
        session log
        <span className="dim small"> · {entries.length} total</span>
      </div>
      <MinutesSparkline entries={entries} />
      <ul className="log-list">
        {ordered.map((e) => (
          <li key={e.id} className={`log-row${e.edge_crossed ? " crossed" : ""}`}>
            <div className="log-row-head">
              <span className="mono">{formatDate(e.at)}</span>
              <span className="mins">{e.minutes}m</span>
              {e.edge_crossed && <span className="edge-crossed">edge crossed</span>}
              {e.outcome_compass_revised && <span className="compass-rev">compass revised</span>}
              {e.cued && <span className="cued">cued</span>}
            </div>
            {e.new_edge && <div className="dim small">new edge: {e.new_edge}</div>}
            {e.note && <div className="small">{e.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
