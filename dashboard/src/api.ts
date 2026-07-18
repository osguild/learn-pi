// Thin fetch helpers. All endpoints are served by lib/dashboard.ts at
// runtime (or proxied to :7331 in dev). Polling is the refresh model —
// tracks change slowly, so 5s is plenty.

import type { SessionLogLine, TimerState, Track, TrackIndex } from "./types";

const API_BASE = "";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

export const getIndex = (): Promise<TrackIndex> => getJson("/api/index");
export const getTracks = async (): Promise<Track[]> => (await getJson<Track[]>("/api/tracks")).map(normalizeTrack);
export const getTrack = async (id: string): Promise<Track> => normalizeTrack(await getJson<Track>(`/api/tracks/${encodeURIComponent(id)}`));
export const getSessions = (): Promise<SessionLogLine[]> => getJson("/api/sessions").then((xs) => xs ?? []);
export const getTimer = (): Promise<TimerState> => getJson("/api/timer");

// Persisted track JSON may have `null` for array fields (older records, or
// fields the writer left unset). Coerce to empty arrays so components can
// assume `T[]` and skip null-guards everywhere.
function normalizeTrack(t: Track): Track {
  const mg = t.material_graph ?? { source: null, units: [], revised_at: null };
  return {
    ...t,
    resources: t.resources ?? [],
    deferred_yaks: t.deferred_yaks ?? [],
    log: t.log ?? [],
    material_graph: {
      ...mg,
      units: mg.units ?? [],
    },
  };
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}
