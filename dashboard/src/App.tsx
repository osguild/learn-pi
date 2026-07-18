import { useEffect, useState } from "react";
import type { SessionLogLine, TimerState, Track, TrackIndex } from "./types";
import { getTimer, getIndex, getTracks, getTrack, getSessions, formatClock } from "./api";
import { TrackList } from "./components/TrackList";
import { TrackDetail } from "./components/TrackDetail";

const POLL_MS = 5000;

export default function App() {
  const [index, setIndex] = useState<TrackIndex | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Track | null>(null);
  const [sessions, setSessions] = useState<SessionLogLine[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [idx, trks, sess, tmr] = await Promise.all([
          getIndex(),
          getTracks(),
          getSessions().catch(() => []),
          getTimer().catch(() => null),
        ]);
        if (cancelled) return;
        setIndex(idx);
        setTracks(trks);
        setSessions(sess);
        setTimer(tmr);
        setError(null);
        setSelectedId((cur) => cur ?? idx.active_track_id ?? trks[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    const handle = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSelected(null);
      return;
    }
    getTrack(selectedId)
      .then((t) => {
        if (!cancelled) setSelected(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, index, tracks]);

  const timerRemaining = timer ? computeRemaining(timer) : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>learn-pi</h1>
        {timer && (
          <div className={`timer-chip timer-${timer.mode}${timer.paused ? " paused" : ""}`}>
            <span className="timer-mode">{timer.mode}</span>
            <span className="timer-time">{formatClock(timerRemaining)}</span>
            {timer.paused && <span className="dim">paused</span>}
            {timer.track && <span className="dim small">· {timer.track}</span>}
          </div>
        )}
      </header>

      {error && (
        <div className="error">
          <strong>API error:</strong> <code>{error}</code>
          <div className="dim small">
            Is the dashboard server running? Start it with <code>/learn-dashboard start</code>.
          </div>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          {index && (
            <TrackList
              index={index}
              tracks={tracks}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          <div className="sessions-summary dim small">
            {sessions.length} session{sessions.length === 1 ? "" : "s"} logged
          </div>
        </aside>
        <main className="main">
          {selected && index ? (
            <TrackDetail track={selected} index={index} />
          ) : (
            <div className="empty">
              <p>Select a track from the sidebar, or create one with a <code>/learn-*</code> command.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function computeRemaining(t: TimerState): number {
  if (t.mode === "idle" || !t.startedAt) return 0;
  const start = Date.parse(t.startedAt);
  if (Number.isNaN(start)) return 0;
  const elapsed = Math.floor((Date.now() - start) / 1000);
  return Math.max(0, t.totalSec - elapsed);
}
