import { useState } from "react";
import type { MaterialUnit } from "../types";
import { patchTrack } from "../api";
import { EditableText } from "./Editable";
import { ResourceLink } from "./ResourceLink";
import { isUnitGuide } from "../utils/trackResources";

const STATUSES: MaterialUnit["status"][] = ["pending", "active", "done", "skipped"];
const DIFFICULTIES: MaterialUnit["difficulty"][] = ["easy", "medium", "hard"];

const STATUS_LABEL: Record<MaterialUnit["status"], string> = {
  pending: "pending",
  active: "active",
  done: "done",
  skipped: "skipped",
};

const EXERCISE_STATUS_LABEL: Record<NonNullable<MaterialUnit["exercise"]>["status"], string> = {
  todo: "todo",
  in_progress: "in progress",
  passing: "passing",
  reviewing: "reviewing",
};

interface Props {
  trackId: string;
  unit: MaterialUnit;
  onTrackChanged: () => void;
}

export function MaterialUnitCard({ trackId, unit, onTrackChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const updateUnit = async (
    patch: Partial<Pick<MaterialUnit, "title" | "status" | "difficulty" | "notes" | "prerequisites">>,
  ) => {
    setErr(null);
    setBusy(true);
    try {
      await patchTrack(trackId, { update_unit: { id: unit.id, patch } });
      onTrackChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resources = [...(unit.resources ?? [])].sort((a, b) => {
    const ag = isUnitGuide({ ...a, unitId: unit.id, unitTitle: unit.title });
    const bg = isUnitGuide({ ...b, unitId: unit.id, unitTitle: unit.title });
    if (ag && !bg) return -1;
    if (!ag && bg) return 1;
    return 0;
  });

  return (
    <div className={`card unit-card unit-${unit.status}${busy ? " busy" : ""}`}>
      <div className="unit-card-head">
        <select
          className="unit-status-select"
          value={unit.status}
          disabled={busy}
          onChange={(e) => void updateUnit({ status: e.target.value as MaterialUnit["status"] })}
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
          value={unit.difficulty}
          disabled={busy}
          onChange={(e) => void updateUnit({ difficulty: e.target.value as MaterialUnit["difficulty"] })}
          aria-label="difficulty"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="dim small mono unit-card-id">{unit.id}</span>
      </div>

      <EditableText
        value={unit.title}
        onSave={(v) => updateUnit({ title: v })}
        multiline
        className="unit-card-title"
        disabled={busy}
      />

      {unit.exercise && (
        <div className="unit-card-field">
          <span className="unit-card-label">exercise</span>
          <span className={`exercise-status-pill exercise-${unit.exercise.status}`}>
            {EXERCISE_STATUS_LABEL[unit.exercise.status]}
          </span>
          <p className="unit-exercise-spec dim small">{unit.exercise.spec}</p>
          {unit.exercise.starter_path && (
            <p className="dim small mono">file: {unit.exercise.starter_path}</p>
          )}
          {unit.exercise.test_command && (
            <p className="dim small mono">verify: {unit.exercise.test_command}</p>
          )}
        </div>
      )}

      {unit.reference && (
        <div className="unit-card-field">
          <span className="unit-card-label">reference</span>
          <p className="unit-reference-summary dim small">{unit.reference.summary}</p>
          {unit.reference.sources.length > 0 && (
            <ul className="unit-reference-sources dim small">
              {unit.reference.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="unit-card-field">
        <span className="unit-card-label">prerequisites</span>
        <EditableText
          value={(unit.prerequisites ?? []).join(", ")}
          onSave={(v) =>
            updateUnit({
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

      <div className="unit-card-field">
        <span className="unit-card-label">notes</span>
        <EditableText
          value={unit.notes ?? ""}
          onSave={(v) => updateUnit({ notes: v })}
          multiline
          placeholder="(no notes)"
          disabled={busy}
        />
      </div>

      {resources.length > 0 && (
        <div className="unit-card-field">
          <span className="unit-card-label">resources</span>
          <ul className="unit-res">
            {resources.map((r) => (
              <li key={r.id} className={isUnitGuide({ ...r, unitId: unit.id, unitTitle: unit.title }) ? "unit-res-guide" : undefined}>
                <ResourceLink trackId={trackId} resource={r} />
                {r.kind && <span className="dim small"> · {r.kind}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <div className="edit-error">{err}</div>}
    </div>
  );
}
