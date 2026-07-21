import type { Track, TrackIndex } from "../types";
import { formatRelative } from "../api";
import { trackHref } from "../utils/routes";
import { TemplatePicker } from "./TemplatePicker";
import { RemoveTrackButton } from "./RemoveTrackButton";

interface Props {
  index: TrackIndex;
  tracks: Track[];
  onTrackCreated?: (trackId: string) => void;
  onTrackRemoved?: (trackId: string) => void;
}

export function Home({ index, tracks, onTrackCreated, onTrackRemoved }: Props) {
  return (
    <div className="home">
      <section className="home-section home-start" aria-labelledby="home-start-title">
        <h2 id="home-start-title" className="section-title">
          Start a track
        </h2>
        <p className="home-section-lede dim small">
          Starter templates ship units, resources, and glossary. Or run <code>/learn-scaffold</code> in pi for a custom goal.
        </p>
        <div className="home-start-panel">
          <TemplatePicker onCreated={(id) => onTrackCreated?.(id)} />
        </div>
      </section>

      <section className="home-section home-tracks" aria-labelledby="home-tracks-title">
        <h2 id="home-tracks-title" className="section-title">
          Your tracks
          {tracks.length > 0 && <span className="home-track-count">{tracks.length}</span>}
        </h2>

        {tracks.length === 0 ? (
          <p className="home-tracks-empty dim small">No tracks yet — pick a template above or scaffold one in pi.</p>
        ) : (
          <div className="home-grid">
            {tracks.map((t) => {
              const isActive = t.id === index.active_track_id;
              const stalled = t.stall_counter >= 3;
              return (
                <article key={t.id} className="track-card-wrap">
                  <a className="track-card" href={trackHref(t.id)}>
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
                  <RemoveTrackButton
                    trackId={t.id}
                    trackLabel={t.label}
                    onRemoved={(id) => onTrackRemoved?.(id)}
                    className="track-remove-btn track-remove-btn-card"
                  >
                    Remove
                  </RemoveTrackButton>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
