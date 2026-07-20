import type { Track } from "../types";
import { formatRelative, patchTrack } from "../api";
import { EditableText } from "./Editable";

interface Props {
  track: Track;
  onTrackChanged: () => void;
}

// The "what now" hero: the current edge and the next concrete action, given
// the most visual weight on the page. Everything else on the dashboard is
// reference material; this is the focal point that tells the learner what to
// do in this session.
export function HeroPanel({ track, onTrackChanged }: Props) {
  const suggested = track.edge_suggested === true;
  const saveEdge = async (next: string) => {
    await patchTrack(track.id, { edge: { statement: next } });
    onTrackChanged();
  };
  const saveNext = async (next: string) => {
    await patchTrack(track.id, { next_action: next });
    onTrackChanged();
  };
  return (
    <section className="hero">
      <div className="hero-block hero-edge">
        <div className="hero-label">current edge</div>
        <EditableText
          value={track.edge.statement}
          onSave={saveEdge}
          multiline
          className="hero-edge-text"
        />
        <div className="hero-meta">
          <span>at edge for {track.edge.sessions_at_edge} session{track.edge.sessions_at_edge === 1 ? "" : "s"}</span>
          <span>· set {formatRelative(track.edge.set_at)}</span>
          {suggested && <span className="warn">· ⚠ wizard suggestion (not yet accepted)</span>}
        </div>
      </div>
      <div className="hero-divider" />
      <div className="hero-block hero-next">
        <div className="hero-label">next action</div>
        <EditableText
          value={track.next_action}
          onSave={saveNext}
          multiline
          className="hero-next-text"
          disabled={track.status === "active"}
        />
        <div className="hero-meta">
          <span>set {formatRelative(track.next_action_set_at)}</span>
          {track.status === "active" && <span className="dim">· cannot be empty while active</span>}
        </div>
      </div>
    </section>
  );
}
