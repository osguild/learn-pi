import type { Track } from "../types";
import { patchTrack } from "../api";
import { InlineAdd } from "./Editable";
import { GlossaryCarousel } from "./GlossaryCarousel";

interface Props {
  track: Track;
  onTrackChanged: () => void;
}

export function GlossaryList({ track, onTrackChanged }: Props) {
  const addEntry = async (raw: string) => {
    const pipeIdx = raw.indexOf("|");
    if (pipeIdx === -1) throw new Error('Use "term | definition" format');
    const term = raw.slice(0, pipeIdx).trim();
    const definition = raw.slice(pipeIdx + 1).trim();
    if (!term || !definition) throw new Error("Term and definition are required");
    await patchTrack(track.id, { add_glossary: { term, definition } });
    onTrackChanged();
  };

  return (
    <div className="card glossary">
      <div className="card-title">glossary</div>
      <GlossaryCarousel track={track} onTrackChanged={onTrackChanged} />
      <div className="glossary-add">
        <InlineAdd label="add term" placeholder="term | definition" onAdd={addEntry} />
      </div>
    </div>
  );
}
