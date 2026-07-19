import type { MaterialUnit } from "../types";
import { ResourceLink } from "./ResourceLink";

const STATUS_LABEL: Record<MaterialUnit["status"], string> = {
  pending: "pending",
  active: "active",
  done: "done",
  skipped: "skipped",
};

export function MaterialGraph({
  trackId,
  track,
}: {
  trackId: string;
  track: { material_graph: { source: string | null; units: MaterialUnit[]; revised_at: string | null } };
}) {
  const mg = track.material_graph;
  if (mg.units.length === 0) {
    return (
      <div className="card material">
        <div className="card-title">material graph</div>
        <div className="dim">(no units — run /learn-plan or /learn-scaffold)</div>
      </div>
    );
  }
  return (
    <div className="card material">
      <div className="card-title">
        material graph
        {mg.source && <span className="dim"> · source: {mg.source}</span>}
      </div>
      <ul className="units">
        {mg.units.map((u) => (
          <li key={u.id} className={`unit unit-${u.status}`}>
            <div className="unit-head">
              <span className={`status-pill status-${u.status}`}>{STATUS_LABEL[u.status]}</span>
              <span className="unit-title">{u.title}</span>
              <span className={`diff diff-${u.difficulty}`}>{u.difficulty}</span>
            </div>
            {u.prerequisites && u.prerequisites.length > 0 && (
              <div className="dim small">needs: {u.prerequisites.join(", ")}</div>
            )}
            {u.notes && <div className="dim small">{u.notes}</div>}
            {u.resources && u.resources.length > 0 && (
              <ul className="unit-res">
                {u.resources.map((r) => (
                  <li key={r.id}>
                    <ResourceLink trackId={trackId} resource={r} />
                    {r.kind && <span className="dim small"> · {r.kind}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
