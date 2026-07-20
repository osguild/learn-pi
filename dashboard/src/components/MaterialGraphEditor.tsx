import { useState } from "react";
import type { MaterialUnit } from "../types";
import { patchTrack } from "../api";
import { EditableText, InlineAdd } from "./Editable";

const STATUSES: MaterialUnit["status"][] = ["pending", "active", "done", "skipped"];
const DIFFICULTIES: MaterialUnit["difficulty"][] = ["easy", "medium", "hard"];

const STATUS_LABEL: Record<MaterialUnit["status"], string> = {
  pending: "pending",
  active: "active",
  done: "done",
  skipped: "skipped",
};

interface Props {
  trackId: string;
  units: MaterialUnit[];
  source: string | null;
  onTrackChanged: () => void;
}

// Full-screen-ish unit editor rendered inside a Modal. Each unit is a row
// with editable title/notes/prerequisites and status/difficulty selects.
// All edits PATCH /api/tracks/:id immediately (no local draft / save button);
// the parent refetches on each change so the modal stays in sync.
export function MaterialGraphEditor({ trackId, units, source, onTrackChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (id: string | null, fn: () => Promise<unknown>) => {
    setErr(null);
    setBusyId(id);
    try {
      await fn();
      onTrackChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const addUnit = (title: string) => run(null, () => patchTrack(trackId, { add_unit: { title } }));

  const updateUnit = (
    id: string,
    patch: Partial<Pick<MaterialUnit, "title" | "status" | "difficulty" | "notes" | "prerequisites">>,
  ) => run(id, () => patchTrack(trackId, { update_unit: { id, patch } }));

  return (
    <div className="mg-editor">
      {source && (
        <div className="dim small mg-source">
          source: <span className="mono">{source}</span>
        </div>
      )}

      {units.length === 0 ? (
        <div className="dim">No units yet. Add the first one below.</div>
      ) : (
        <ul className="mg-units">
          {units.map((u) => {
            const busy = busyId === u.id;
            return (
              <li key={u.id} className={`mg-unit mg-unit-${u.status}${busy ? " busy" : ""}`}>
                <div className="mg-unit-head">
                  <select
                    className="unit-status-select"
                    value={u.status}
                    disabled={busy}
                    onChange={(e) => void updateUnit(u.id, { status: e.target.value as MaterialUnit["status"] })}
                    aria-label="status"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="unit-diff-select"
                    value={u.difficulty}
                    disabled={busy}
                    onChange={(e) =>
                      void updateUnit(u.id, { difficulty: e.target.value as MaterialUnit["difficulty"] })
                    }
                    aria-label="difficulty"
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <span className="dim small mono mg-unit-id">{u.id}</span>
                </div>

                <div className="mg-field">
                  <label className="mg-label">title</label>
                  <EditableText
                    value={u.title}
                    onSave={(v) => updateUnit(u.id, { title: v })}
                    disabled={busy}
                  />
                </div>

                <div className="mg-field">
                  <label className="mg-label">prerequisites</label>
                  <EditableText
                    value={(u.prerequisites ?? []).join(", ")}
                    onSave={(v) =>
                      updateUnit(u.id, {
                        prerequisites: v
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="(none)"
                    disabled={busy}
                  />
                </div>

                <div className="mg-field">
                  <label className="mg-label">notes</label>
                  <EditableText
                    value={u.notes ?? ""}
                    onSave={(v) => updateUnit(u.id, { notes: v })}
                    multiline
                    placeholder="(no notes)"
                    disabled={busy}
                  />
                </div>

                {u.resources && u.resources.length > 0 && (
                  <div className="mg-field">
                    <label className="mg-label">resources</label>
                    <ul className="mg-unit-res">
                      {u.resources.map((r) => (
                        <li key={r.id}>
                          <a href={r.url} target="_blank" rel="noreferrer">
                            {r.title}
                          </a>
                          {r.kind && <span className="dim small"> · {r.kind}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mg-add">
        <InlineAdd label="add unit" placeholder="unit title" onAdd={addUnit} />
      </div>

      {err && <div className="edit-error mg-error">{err}</div>}
    </div>
  );
}
