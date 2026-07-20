import type { Track, TrackOverview } from "../types";
import { formatRelative, patchTrack } from "../api";
import { EditableText } from "./Editable";

interface CardProps {
  track: Track;
  onTrackChanged: () => void;
}

export function CompassCard({ track, onTrackChanged }: CardProps) {
  const save = async (next: string) => {
    await patchTrack(track.id, { outcome_compass: next });
    onTrackChanged();
  };
  return (
    <div className="card compass">
      <div className="card-title">outcome compass</div>
      <EditableText
        value={track.outcome_compass}
        onSave={save}
        multiline
        className="compass-statement"
      />
      <div className="meta">
        <span>revised {formatRelative(track.outcome_compass_revised_at)}</span>
      </div>
    </div>
  );
}

export function OverviewCard({ track, onTrackChanged }: CardProps) {
  const overview = track.overview;
  if (!overview) {
    return (
      <div className="card overview">
        <div className="card-title">track overview</div>
        <div className="dim">(unset — set at scaffold time or run /learn-plan overview edit)</div>
      </div>
    );
  }
  const saveSummary = async (next: string) => {
    const patch: TrackOverview = { ...overview, summary: next };
    await patchTrack(track.id, { overview: patch });
    onTrackChanged();
  };
  const saveField = (key: "learner_context" | "approach" | "learning_path") => async (next: string) => {
    const patch: TrackOverview = { ...overview, [key]: next };
    await patchTrack(track.id, { overview: patch });
    onTrackChanged();
  };
  return (
    <div className="card overview">
      <div className="card-title">track overview</div>
      <div className="overview-section">
        <EditableText value={overview.summary} onSave={saveSummary} multiline className="overview-summary" />
      </div>
      <div className="overview-section">
        <div className="overview-label">background</div>
        <EditableText
          value={overview.learner_context ?? ""}
          onSave={saveField("learner_context")}
          multiline
          placeholder="(no background noted)"
        />
      </div>
      <div className="overview-section">
        <div className="overview-label">approach</div>
        <EditableText
          value={overview.approach ?? ""}
          onSave={saveField("approach")}
          multiline
          placeholder="(no approach noted)"
        />
      </div>
      <div className="overview-section">
        <div className="overview-label">learning path</div>
        <EditableText
          value={overview.learning_path ?? ""}
          onSave={saveField("learning_path")}
          multiline
          placeholder="(no path noted)"
        />
      </div>
      <div className="meta">
        <span>set {formatRelative(overview.set_at)}</span>
        {overview.revised_at && <span>· revised {formatRelative(overview.revised_at)}</span>}
      </div>
    </div>
  );
}

export function ProcessContractCard({ track, onTrackChanged }: CardProps) {
  const pc = track.process_contract;
  const cue = pc.cue;
  const cueStr = cue
    ? `${cue.kind} @ ${cue.time}${cue.days ? ` ${cue.days.join("/")}` : ""}${cue.at ? ` on ${cue.at}` : ""}`
    : "(none)";
  const saveSession = async (next: string) => {
    const n = Number.parseInt(next, 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error("session_min must be a positive integer");
    await patchTrack(track.id, { session_min: n });
    onTrackChanged();
  };
  const saveVerify = async (next: string) => {
    await patchTrack(track.id, { verify_command: next.trim() ? next : null });
    onTrackChanged();
  };
  return (
    <div className="card process">
      <div className="card-title">process contract</div>
      <div className="kv"><span>cue</span><span>{cueStr}</span></div>
      <div className="kv">
        <span>session</span>
        <span>
          <EditableText value={String(pc.session_min)} onSave={saveSession} mono />m
        </span>
      </div>
      <div className="kv"><span>reward</span><span>{pc.reward}</span></div>
      <div className="kv"><span>work dir</span><span className="mono">{track.work_dir || "(unset)"}</span></div>
      <div className="kv">
        <span>verify</span>
        <span className="mono">
          <EditableText
            value={track.verify_command ?? ""}
            onSave={saveVerify}
            mono
            placeholder="(none)"
          />
        </span>
      </div>
    </div>
  );
}
