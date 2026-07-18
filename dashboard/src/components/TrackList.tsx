import type { Track, TrackIndex } from "../types";

interface Props {
  index: TrackIndex;
  tracks: Track[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TrackList({ index, tracks, selectedId, onSelect }: Props) {
  if (tracks.length === 0) {
    return (
      <div className="empty">
        <p>No tracks yet.</p>
        <p className="dim">Create one with <code>/learn-scaffold</code>, <code>/learn-study</code>, or <code>/learn-plan</code>.</p>
      </div>
    );
  }
  return (
    <ul className="track-list">
      {tracks.map((t) => {
        const isActive = t.id === index.active_track_id;
        const isSelected = t.id === selectedId;
        const stalled = t.stall_counter >= 3;
        return (
          <li
            key={t.id}
            className={`track-row${isSelected ? " selected" : ""}${isActive ? " active" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="track-row-head">
              {isActive && <span className="mark" title="active">▶</span>}
              <span className="label">{t.label}</span>
              <span className={`status status-${t.status}`}>{t.status}</span>
              {stalled && <span className="stall" title="stalled">⚠</span>}
            </div>
            <div className="track-row-edge dim">{t.edge.statement}</div>
            <div className="track-row-next">next: {t.next_action}</div>
          </li>
        );
      })}
    </ul>
  );
}
