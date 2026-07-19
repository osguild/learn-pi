/**
 * Data loading for learn-tui — reads ~/.pi/learn directly (no HTTP server).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LEARN_ROOT } from "../paths";
import {
	ensureLearnRoot,
	loadIndex,
	loadTrack,
	listTrackIds,
	type Track,
	type TrackIndex,
} from "../track";

export interface TimerSnapshot {
	mode: "idle" | "work" | "break";
	paused: boolean;
	totalSec: number;
	startedAt: string | null;
	track: string | null;
}

export interface LearnTuiSnapshot {
	index: TrackIndex;
	tracks: Track[];
	timer: TimerSnapshot | null;
}

export async function loadLearnTuiSnapshot(): Promise<LearnTuiSnapshot> {
	await ensureLearnRoot();
	const index = await loadIndex();
	const ids = await listTrackIds();
	const tracks: Track[] = [];
	for (const id of ids) {
		const t = await loadTrack(id);
		if (t) tracks.push(t);
	}
	const timer = await readTimerState();
	return { index, tracks, timer };
}

async function readTimerState(): Promise<TimerSnapshot | null> {
	const stateFile = join(LEARN_ROOT, "timer", "state.json");
	try {
		const raw = await readFile(stateFile, "utf8");
		return JSON.parse(raw) as TimerSnapshot;
	} catch {
		return null;
	}
}

export function computeTimerRemaining(timer: TimerSnapshot): number {
	if (timer.mode === "idle" || !timer.startedAt) return 0;
	const start = Date.parse(timer.startedAt);
	if (Number.isNaN(start)) return 0;
	const elapsed = Math.floor((Date.now() - start) / 1000);
	return Math.max(0, timer.totalSec - elapsed);
}

export function findTrack(snapshot: LearnTuiSnapshot, trackId: string): Track | null {
	return snapshot.tracks.find((t) => t.id === trackId) ?? null;
}
