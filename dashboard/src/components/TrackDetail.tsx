import type { Track, TrackIndex } from "../types";
import { formatRelative } from "../api";
import { CompassCard, EdgeCard, NextActionCard, ProcessContractCard, StallBadge } from "./Cards";
import { MaterialGraph } from "./MaterialGraph";
import { ResourcesList, YaksList } from "./Lists";
import { SessionLog } from "./SessionLog";

interface Props {
  track: Track;
  index: TrackIndex;
}

export function TrackDetail({ track, index }: Props) {
  const isActive = track.id === index.active_track_id;
  const isStudy = (track.track_kind ?? "programming") === "study";
  return (
    <div className="detail">
      <header className="detail-header">
        <h2>
          {isActive && <span className="mark">▶</span>} {track.label}
          <span className="dim small"> · {track.id}</span>
        </h2>
        <div className="meta">
          <span className={`status status-${track.status}`}>{track.status}</span>
          <span>{isStudy ? "study" : "programming"}</span>
          {isStudy && track.study_depth && <span>· {track.study_depth}</span>}
          {isStudy && track.domain_family && <span>· {track.domain_family}</span>}
          {!isStudy && track.depth && <span>· {track.depth}</span>}
          {!isStudy && track.recommended_stack && track.recommended_stack.length > 0 && (
            <span>· stack: {track.recommended_stack.join(" + ")}</span>
          )}
          <span>· created {formatRelative(track.created_at)}</span>
          <span>· last session {formatRelative(track.last_session_at)}</span>
        </div>
        <StallBadge track={track} />
      </header>

      <div className="grid">
        <CompassCard track={track} />
        <EdgeCard track={track} />
        <NextActionCard track={track} />
        <ProcessContractCard track={track} />
        <MaterialGraph trackId={track.id} track={track} />
        <ResourcesList trackId={track.id} resources={track.resources} />
        <YaksList yaks={track.deferred_yaks} />
        <SessionLog entries={track.log} />
      </div>
    </div>
  );
}
