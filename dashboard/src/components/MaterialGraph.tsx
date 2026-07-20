import { useState } from "react";
import type { MaterialUnit } from "../types";
import { Modal } from "./Modal";
import { MaterialGraphEditor } from "./MaterialGraphEditor";

interface Props {
  trackId: string;
  track: { material_graph: { source: string | null; units: MaterialUnit[]; revised_at: string | null } };
  onTrackChanged: () => void;
}

const STATUS_LABEL: Record<MaterialUnit["status"], string> = {
  pending: "pending",
  active: "active",
  done: "done",
  skipped: "skipped",
};

// Material graph card. The card itself is a launcher: clicking it (or the
// "edit" affordance) opens a modal with the full per-unit editor. The inline
// status/difficulty dropdowns that used to live here moved into the modal so
// the card stays a compact summary.
export function MaterialGraph({ trackId, track, onTrackChanged }: Props) {
  const [open, setOpen] = useState(false);
  const mg = track.material_graph;
  const counts = countByStatus(mg.units);
  const summary = (
    <span className="mg-summary">
      {mg.units.length} unit{mg.units.length === 1 ? "" : "s"}
      {counts.active > 0 && <span className="mg-count active">· {counts.active} active</span>}
      {counts.done > 0 && <span className="mg-count done">· {counts.done} done</span>}
      {counts.pending > 0 && <span className="mg-count pending">· {counts.pending} pending</span>}
      {counts.skipped > 0 && <span className="mg-count skipped">· {counts.skipped} skipped</span>}
    </span>
  );

  return (
    <>
      <div className="card material material-launcher" onClick={() => setOpen(true)} role="button" tabIndex={0}>
        <div className="card-title">
          material graph
          {mg.source && <span className="dim"> · source: {mg.source}</span>}
        </div>
        {mg.units.length === 0 ? (
          <div className="dim small">(no units — click to add one)</div>
        ) : (
          <>
            <div className="mg-summary-row">{summary}</div>
            <ul className="mg-preview">
              {mg.units.slice(0, 4).map((u) => (
                <li key={u.id} className={`mg-preview-unit unit-${u.status}`}>
                  <span className={`status-pill status-${u.status}`}>{STATUS_LABEL[u.status]}</span>
                  <span className="mg-preview-title">{u.title}</span>
                </li>
              ))}
              {mg.units.length > 4 && (
                <li className="dim small mg-preview-more">+ {mg.units.length - 4} more…</li>
              )}
            </ul>
          </>
        )}
        <div className="mg-open-hint dim small">click to edit →</div>
      </div>

      {open && (
        <Modal
          title="Material graph"
          subtitle={`${mg.units.length} unit${mg.units.length === 1 ? "" : "s"}${mg.source ? ` · source: ${mg.source}` : ""}`}
          onClose={() => setOpen(false)}
        >
          <MaterialGraphEditor
            trackId={trackId}
            units={mg.units}
            source={mg.source}
            onTrackChanged={onTrackChanged}
          />
        </Modal>
      )}
    </>
  );
}

function countByStatus(units: MaterialUnit[]): Record<MaterialUnit["status"], number> {
  const out: Record<MaterialUnit["status"], number> = {
    pending: 0,
    active: 0,
    done: 0,
    skipped: 0,
  };
  for (const u of units) out[u.status] += 1;
  return out;
}
