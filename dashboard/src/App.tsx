import { useEffect, useState } from "react";
import type { SessionLogLine, TimerState, Track, TrackIndex } from "./types";
import { getTimer, getIndex, getTracks, getTrack, getSessions, formatClock } from "./api";
import { TrackList } from "./components/TrackList";
import { TrackDetail } from "./components/TrackDetail";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { DocsViewer } from "./components/DocsViewer";
import { navigateAppRoute, parseAppRoute, type AppRoute } from "./utils/routes";

const POLL_MS = 5000;

function readAppRoute(): AppRoute {
  return parseAppRoute(window.location.hash);
}

export default function App() {
  const [index, setIndex] = useState<TrackIndex | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Track | null>(null);
  const [sessions, setSessions] = useState<SessionLogLine[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appRoute, setAppRoute] = useState(readAppRoute);

  useEffect(() => {
    const syncRoute = () => setAppRoute(parseAppRoute(window.location.hash));
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  useEffect(() => {
    if (appRoute?.kind === "doc") {
      setSelectedId(appRoute.trackId);
    }
  }, [appRoute]);

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

  const goToDocs = () => {
    const route: AppRoute = { kind: "docs", slug: "dashboard" };
    navigateAppRoute(route);
    setAppRoute(route);
  };

  const backFromOverlay = () => {
    navigateAppRoute(null);
    setAppRoute(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1>learn-pi</h1>
          <button type="button" className="docs-btn" onClick={goToDocs}>
            Docs
          </button>
        </div>
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
          {appRoute?.kind === "docs" ? (
            <DocsViewer slug={appRoute.slug} onBack={backFromOverlay} />
          ) : appRoute?.kind === "doc" ? (
            <MarkdownViewer
              trackId={appRoute.trackId}
              url={appRoute.url}
              onBack={backFromOverlay}
            />
          ) : selected && index ? (
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
