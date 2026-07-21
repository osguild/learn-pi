import type { Track, TrackIndex } from "../types";
import { formatRelative } from "../api";
import { CompassCard, OverviewCard, ProcessContractCard } from "./Cards";
import { HeroPanel } from "./HeroPanel";
import { MaterialGraph } from "./MaterialGraph";
import { ResourcesList, YaksList } from "./Lists";
import { GlossaryList } from "./GlossaryList";
import { SessionLog } from "./SessionLog";
import { RemoveTrackButton } from "./RemoveTrackButton";

interface Props {
  track: Track;
  index: TrackIndex;
  onTrackChanged: () => void;
  onTrackRemoved: (trackId: string) => void;
}

export function TrackDetail({ track, index, onTrackChanged, onTrackRemoved }: Props) {
  const isActive = track.id === index.active_track_id;
  const isStudy = (track.track_kind ?? "programming") === "study";
  const stalled = track.stall_counter >= 3;
  return (
    <div className="detail">
      <header className="detail-header">
        <div className="dh-row">
          <h2>
            {isActive && <span className="mark">▶</span>} {track.label}
          </h2>
          <span className={`status-pill status-${track.status}`}>{track.status}</span>
          <span className={`dh-kind${isStudy ? " study" : ""}`}>{isStudy ? "study" : "programming"}</span>
          {stalled && (
            <span className="stall-pill" title="double-loop: is the goal wrong?">
              stall: {track.stall_counter}
            </span>
          )}
          <RemoveTrackButton
            trackId={track.id}
            trackLabel={track.label}
            onRemoved={onTrackRemoved}
            className="track-remove-btn track-remove-btn-detail"
          />
        </div>
        <div className="dh-meta dim small">
          <span className="mono">{track.id}</span>
          {isStudy && track.study_depth && <span>· {track.study_depth}</span>}
          {isStudy && track.domain_family && <span>· {track.domain_family}</span>}
          {!isStudy && track.depth && <span>· {track.depth}</span>}
          {!isStudy && track.recommended_stack && track.recommended_stack.length > 0 && (
            <span>· stack: {track.recommended_stack.join(" + ")}</span>
          )}
          <span>· created {formatRelative(track.created_at)}</span>
          <span>· last session {formatRelative(track.last_session_at)}</span>
        </div>
      </header>

      <HeroPanel track={track} onTrackChanged={onTrackChanged} />

      <section className="section">
        <h3 className="section-title">Forethought</h3>
        <div className="section-grid">
          <CompassCard track={track} onTrackChanged={onTrackChanged} />
          <OverviewCard track={track} onTrackChanged={onTrackChanged} />
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Process</h3>
        <div className="section-grid">
          <ProcessContractCard track={track} onTrackChanged={onTrackChanged} />
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Materials</h3>
        <div className="section-grid materials-grid">
          <MaterialGraph trackId={track.id} track={track} onTrackChanged={onTrackChanged} />
          <GlossaryList track={track} onTrackChanged={onTrackChanged} />
          <ResourcesList track={track} onTrackChanged={onTrackChanged} />
          <YaksList trackId={track.id} yaks={track.deferred_yaks} onTrackChanged={onTrackChanged} />
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">History</h3>
        <SessionLog entries={track.log} />
      </section>
    </div>
  );
}
