import type { Track, TrackIndex } from "../types";
import { homeHref, trackHref } from "../utils/routes";

interface NavProps {
  index: TrackIndex;
  tracks: Track[];
  currentTrackId: string | null;
  onGoHome: () => void;
  onSelectTrack: (id: string) => void;
  onGoDocs: () => void;
  /** Optional timer chip rendered on the right of the bar. */
  timerChip?: React.ReactNode;
  /** Breadcrumb elements rendered under the bar. */
  breadcrumbs: React.ReactNode;
}

// Top navigation bar: app title (→ home), a tracks dropdown, and a Docs
// button. Breadcrumbs render in a row beneath the bar. Replaces the old
// sidebar track list now that each track has its own page.
export function Nav({
  index,
  tracks,
  currentTrackId,
  onGoHome,
  onSelectTrack,
  onGoDocs,
  timerChip,
  breadcrumbs,
}: NavProps) {
  return (
    <div className="nav-wrap">
      <header className="nav-bar">
        <div className="nav-left">
          <button type="button" className="nav-brand" onClick={onGoHome}>
            learn-pi
          </button>
          <details className="nav-tracks-menu">
            <summary className="nav-tracks-toggle">Tracks</summary>
            <div className="nav-tracks-dropdown">
              {tracks.length === 0 ? (
                <div className="dim small nav-tracks-empty">No tracks yet</div>
              ) : (
                <ul className="nav-tracks-list">
                  {tracks.map((t) => (
                    <li
                      key={t.id}
                      className={`nav-track-item${t.id === currentTrackId ? " current" : ""}${t.id === index.active_track_id ? " active" : ""}`}
                      onClick={() => onSelectTrack(t.id)}
                    >
                      {t.id === index.active_track_id && <span className="mark">▶</span>}
                      <span className="nav-track-label">{t.label}</span>
                      <span className={`status-pill status-${t.status}`}>{t.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
          <button type="button" className="nav-docs-btn" onClick={onGoDocs}>
            Docs
          </button>
        </div>
        <div className="nav-right">{timerChip}</div>
      </header>
      <nav className="breadcrumbs">{breadcrumbs}</nav>
    </div>
  );
}

// Breadcrumb crumb helpers. Render `<Crumb label href onClick />` in a row.
export function Crumb({
  label,
  href,
  onClick,
  current = false,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
}) {
  if (current) {
    return <span className="crumb crumb-current">{label}</span>;
  }
  return (
    <a className="crumb" href={href} onClick={onClick}>
      {label}
    </a>
  );
}

// Convenience: build the standard breadcrumb row for a given page.
export function trackBreadcrumbs(track: Track) {
  return (
    <>
      <Crumb label="learn-pi" href={homeHref()} />
      <span className="crumb-sep">/</span>
      <Crumb label={track.label} current />
    </>
  );
}

export function docsBreadcrumbs() {
  return (
    <>
      <Crumb label="learn-pi" href={homeHref()} />
      <span className="crumb-sep">/</span>
      <Crumb label="Docs" current />
    </>
  );
}

export function docBreadcrumbs(track: Track) {
  return (
    <>
      <Crumb label="learn-pi" href={homeHref()} />
      <span className="crumb-sep">/</span>
      <Crumb label={track.label} href={trackHref(track.id)} />
      <span className="crumb-sep">/</span>
      <Crumb label="resource" current />
    </>
  );
}
