import type { Resource, Yak } from "../types";

export function ResourcesList({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;
  return (
    <div className="card resources">
      <div className="card-title">track resources</div>
      <ul className="res-list">
        {resources.map((r) => (
          <li key={r.id}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
            {r.kind && <span className="dim small"> · {r.kind}</span>}
            {r.note && <div className="dim small">{r.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function YaksList({ yaks }: { yaks: Yak[] }) {
  if (yaks.length === 0) return null;
  const open = yaks.filter((y) => !y.resolved);
  const resolved = yaks.filter((y) => y.resolved);
  return (
    <div className="card yaks">
      <div className="card-title">deferred yaks</div>
      {open.length > 0 && (
        <ul className="yak-list">
          {open.map((y) => (
            <li key={y.id} className="yak-open">
              <span className="yak-mark">○</span>
              <span>{y.desc}</span>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details>
          <summary className="dim small">{resolved.length} resolved</summary>
          <ul className="yak-list">
            {resolved.map((y) => (
              <li key={y.id} className="yak-resolved dim">
                <span className="yak-mark">✓</span>
                <span className="strike">{y.desc}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
