import type { Track } from "../types";
import { formatRelative } from "../api";

export function EdgeCard({ track }: { track: Track }) {
  const suggested = track.edge_suggested;
  return (
    <div className="card edge">
      <div className="card-title">edge</div>
      <div className={`edge-statement${suggested ? " suggested" : ""}`}>{track.edge.statement}</div>
      <div className="meta">
        <span>at edge for {track.edge.sessions_at_edge} session{track.edge.sessions_at_edge === 1 ? "" : "s"}</span>
        <span>set {formatRelative(track.edge.set_at)}</span>
        {suggested && <span className="warn">⚠ wizard suggestion (not yet accepted)</span>}
      </div>
    </div>
  );
}

export function NextActionCard({ track }: { track: Track }) {
  return (
    <div className="card next">
      <div className="card-title">next action</div>
      <div className="next-statement">{track.next_action}</div>
      <div className="meta">
        <span>set {formatRelative(track.next_action_set_at)}</span>
      </div>
    </div>
  );
}

export function CompassCard({ track }: { track: Track }) {
  return (
    <div className="card compass">
      <div className="card-title">outcome compass</div>
      <div className="compass-statement">{track.outcome_compass || "(unset)"}</div>
      <div className="meta">
        <span>revised {formatRelative(track.outcome_compass_revised_at)}</span>
      </div>
    </div>
  );
}

export function ProcessContractCard({ track }: { track: Track }) {
  const pc = track.process_contract;
  const cue = pc.cue;
  const cueStr = cue
    ? `${cue.kind} @ ${cue.time}${cue.days ? ` ${cue.days.join("/")}` : ""}${cue.at ? ` on ${cue.at}` : ""}`
    : "(none)";
  return (
    <div className="card process">
      <div className="card-title">process contract</div>
      <div className="kv"><span>cue</span><span>{cueStr}</span></div>
      <div className="kv"><span>session</span><span>{pc.session_min}m</span></div>
      <div className="kv"><span>reward</span><span>{pc.reward}</span></div>
      <div className="kv"><span>work dir</span><span className="mono">{track.work_dir || "(unset)"}</span></div>
      <div className="kv">
        <span>verify</span>
        <span className="mono">
          {track.verify_command ?? "(none)"}
        </span>
      </div>
    </div>
  );
}

export function StallBadge({ track }: { track: Track }) {
  const stalled = track.stall_counter >= 3;
  return (
    <div className={`stall-badge${stalled ? " stalled" : ""}`}>
      stall: {track.stall_counter}{stalled ? " · double-loop: is the goal wrong?" : ""}
    </div>
  );
}
