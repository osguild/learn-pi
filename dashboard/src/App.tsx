import { useEffect, useState } from "react";
import type { SessionLogLine, TimerState, Track, TrackIndex } from "./types";
import { getTimer, getIndex, getTracks, getTrack, getSessions, formatClock } from "./api";
import { Home } from "./components/Home";
import { TrackDetail } from "./components/TrackDetail";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { DocsViewer } from "./components/DocsViewer";
import { Nav, docBreadcrumbs, docsBreadcrumbs, roadmapBreadcrumbs, trackBreadcrumbs } from "./components/Nav";
import { navigateAppRoute, parseAppRoute, type AppRoute } from "./utils/routes";

const POLL_MS = 5000;

function readAppRoute(): AppRoute {
  return parseAppRoute(window.location.hash);
}

export default function App() {
  const [index, setIndex] = useState<TrackIndex | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
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

  // Poll: index + all tracks + sessions + timer. The full track for the
  // current track page is loaded separately (below) and on edits.
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

  // Load the full track on track pages and when viewing a unit guide / resource doc.
  const routeTrackId =
    appRoute?.kind === "track" ? appRoute.trackId : appRoute?.kind === "doc" ? appRoute.trackId : null;

  useEffect(() => {
    let cancelled = false;
    if (!routeTrackId) {
      setSelected(null);
      return;
    }
    getTrack(routeTrackId)
      .then((t) => {
        if (!cancelled) setSelected(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [routeTrackId, index, tracks]);

  const currentTrackId = appRoute?.kind === "track" ? appRoute.trackId : null;

  // Immediate refetch of the current track after a dashboard edit, so the
  // UI reflects the change without waiting for the 5s poll.
  const refreshSelectedTrack = () => {
    if (!currentTrackId) return;
    getTrack(currentTrackId)
      .then((t) => setSelected(t))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const refreshTracks = () => {
    void Promise.all([getIndex(), getTracks()])
      .then(([idx, trks]) => {
        setIndex(idx);
        setTracks(trks);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const handleTrackRemoved = (trackId: string) => {
    refreshTracks();
    if (
      currentTrackId === trackId ||
      (appRoute?.kind === "doc" && appRoute.trackId === trackId)
    ) {
      goHome();
    }
  };

  const timerRemaining = timer ? computeRemaining(timer) : 0;
  const timerChip = timer ? (
    <div className={`timer-chip timer-${timer.mode}${timer.paused ? " paused" : ""}`}>
      <span className="timer-mode">{timer.mode}</span>
      <span className="timer-time">{formatClock(timerRemaining)}</span>
      {timer.paused && <span className="dim">paused</span>}
      {timer.track && <span className="dim small">· {timer.track}</span>}
    </div>
  ) : null;

  const goHome = () => {
    const route: AppRoute = { kind: "home" };
    navigateAppRoute(route);
    setAppRoute(route);
  };
  const goToTrack = (id: string) => {
    const route: AppRoute = { kind: "track", trackId: id };
    navigateAppRoute(route);
    setAppRoute(route);
  };
  const goToDocs = () => {
    const route: AppRoute = { kind: "docs", slug: "dashboard" };
    navigateAppRoute(route);
    setAppRoute(route);
  };
  const goToRoadmap = () => {
    const route: AppRoute = { kind: "docs", slug: "roadmap" };
    navigateAppRoute(route);
    setAppRoute(route);
  };
  const backFromOverlay = () => {
    if (appRoute?.kind === "doc") {
      goToTrack(appRoute.trackId);
      return;
    }
    if (currentTrackId) {
      goToTrack(currentTrackId);
    } else {
      goHome();
    }
  };

  // Breadcrumbs per route kind.
  let breadcrumbs: React.ReactNode = (
    <>
      <span className="crumb crumb-current">learn-pi</span>
    </>
  );
  if (appRoute?.kind === "track" && selected) {
    breadcrumbs = trackBreadcrumbs(selected);
  } else if (appRoute?.kind === "docs" && appRoute.slug === "roadmap") {
    breadcrumbs = roadmapBreadcrumbs();
  } else if (appRoute?.kind === "docs") {
    breadcrumbs = docsBreadcrumbs();
  } else if (appRoute?.kind === "doc" && selected) {
    breadcrumbs = docBreadcrumbs(selected);
  }

  return (
    <div className="app">
      <Nav
        index={index ?? { active_track_id: null, tracks: [] }}
        tracks={tracks}
        currentTrackId={currentTrackId ?? (appRoute?.kind === "doc" ? appRoute.trackId : null)}
        onGoHome={goHome}
        onSelectTrack={goToTrack}
        onGoDocs={goToDocs}
        onGoRoadmap={goToRoadmap}
        timerChip={timerChip}
        breadcrumbs={breadcrumbs}
      />

      {error && (
        <div className="error">
          <strong>API error:</strong> <code>{error}</code>
          <div className="dim small">
            Is the dashboard server running? Start it with <code>/learn-dashboard start</code>.
          </div>
        </div>
      )}

      <main className="main">
        {appRoute?.kind === "docs" ? (
          <DocsViewer slug={appRoute.slug} onBack={backFromOverlay} />
        ) : appRoute?.kind === "doc" ? (
          <MarkdownViewer trackId={appRoute.trackId} url={appRoute.url} onBack={backFromOverlay} />
        ) : appRoute?.kind === "track" ? (
          selected && index ? (
            <TrackDetail
              track={selected}
              index={index}
              onTrackChanged={refreshSelectedTrack}
              onTrackRemoved={handleTrackRemoved}
            />
          ) : (
            <div className="empty">
              <p>Loading track…</p>
            </div>
          )
        ) : index ? (
          <>
            <Home
              index={index}
              tracks={tracks}
              onTrackCreated={(id) => {
                refreshTracks();
                goToTrack(id);
              }}
              onTrackRemoved={handleTrackRemoved}
            />
            <div className="sessions-summary dim small">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} logged
            </div>
          </>
        ) : (
          <div className="empty">
            <p>Loading…</p>
          </div>
        )}
      </main>
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
