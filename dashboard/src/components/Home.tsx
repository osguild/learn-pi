import type { Track, TrackIndex } from "../types";
import { formatRelative } from "../api";
import { trackHref } from "../utils/routes";

interface Props {
  index: TrackIndex;
  tracks: Track[];
}

// Home page: a grid of track cards. Each card links to that track's page
// (#/tracks/:id). Replaces the old sidebar track list now that each track
// has its own page.
export function Home({ index, tracks }: Props) {
  if (tracks.length === 0) {
    return (
      <div className="empty">
        <p>No tracks yet.</p>
        <p className="dim">
          Create one with <code>/learn-scaffold</code>, <code>/learn-study</code>, or <code>/learn-plan</code>.
        </p>
      </div>
    );
  }
  return (
    <div className="home">
      <div className="home-grid">
        {tracks.map((t) => {
          const isActive = t.id === index.active_track_id;
          const stalled = t.stall_counter >= 3;
          return (
            <a key={t.id} className="track-card" href={trackHref(t.id)}>
              <div className="track-card-head">
                {isActive && <span className="mark" title="active track">▶</span>}
                <span className="track-card-label">{t.label}</span>
                <span className={`status-pill status-${t.status}`}>{t.status}</span>
                {stalled && <span className="stall-pill" title="stalled">stall: {t.stall_counter}</span>}
              </div>
              <div className="track-card-edge">
                <span className="track-card-kw">edge</span>
                <span className="track-card-text">{t.edge.statement}</span>
              </div>
              <div className="track-card-next">
                <span className="track-card-kw">next</span>
                <span className="track-card-text">{t.next_action}</span>
              </div>
              <div className="track-card-meta dim small">
                <span>{(t.track_kind ?? "programming") === "study" ? "study" : "programming"}</span>
                <span>· last session {formatRelative(t.last_session_at)}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
