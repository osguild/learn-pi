import { useState } from "react";
import type { MaterialUnit } from "../types";
import { patchTrack } from "../api";
import { InlineAdd } from "./Editable";
import { MaterialUnitCard } from "./MaterialUnitCard";

interface Props {
  trackId: string;
  track: { material_graph: { source: string | null; units: MaterialUnit[]; revised_at: string | null } };
  onTrackChanged: () => void;
}

export function MaterialGraph({ trackId, track, onTrackChanged }: Props) {
  const mg = track.material_graph;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const counts = countByStatus(mg.units);

  const addUnit = async (title: string) => {
    setErr(null);
    setBusy(true);
    try {
      await patchTrack(trackId, { add_unit: { title } });
      onTrackChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="material-graph-section">
      <div className="material-graph-header">
        <span className="material-graph-title">material units</span>
        {mg.units.length > 0 && (
          <span className="dim small mg-summary">
            {mg.units.length} unit{mg.units.length === 1 ? "" : "s"}
            {counts.active > 0 && <span className="mg-count active"> · {counts.active} active</span>}
            {counts.done > 0 && <span className="mg-count done"> · {counts.done} done</span>}
            {counts.pending > 0 && <span className="mg-count pending"> · {counts.pending} pending</span>}
            {counts.skipped > 0 && <span className="mg-count skipped"> · {counts.skipped} skipped</span>}
          </span>
        )}
        {mg.source && (
          <span className="dim small">
            · source: <span className="mono">{mg.source}</span>
          </span>
        )}
      </div>

      <div className="unit-cards-grid">
        {mg.units.map((u) => (
          <MaterialUnitCard key={u.id} trackId={trackId} unit={u} onTrackChanged={onTrackChanged} />
        ))}
        <div className={`card unit-add-card${busy ? " busy" : ""}`}>
          <div className="card-title">add unit</div>
          <InlineAdd label="new unit" placeholder="unit title" onAdd={addUnit} />
        </div>
      </div>

      {mg.units.length === 0 && !busy && (
        <div className="dim small material-graph-empty">No units yet — add one above or run /learn-plan /learn-scaffold.</div>
      )}

      {err && <div className="edit-error material-graph-error">{err}</div>}
    </div>
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
