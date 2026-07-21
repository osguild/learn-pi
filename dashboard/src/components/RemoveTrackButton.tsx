import { useState } from "react";
import { deleteTrack } from "../api";

interface Props {
  trackId: string;
  trackLabel: string;
  onRemoved: (trackId: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export function RemoveTrackButton({ trackId, trackLabel, onRemoved, className, children }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const ok = window.confirm(
      `Remove track "${trackLabel}"?\n\nThis deletes the track record from ~/.pi/learn. Session log lines and work files are kept.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteTrack(trackId);
      onRemoved(trackId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? "track-remove-btn"}
      onClick={(e) => void handleClick(e)}
      disabled={busy}
    >
      {children ?? (busy ? "Removing…" : "Remove track")}
    </button>
  );
}
