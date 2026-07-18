/**
 * learn-timer — pomodoro + session-duration tracker (migrated from socrates-timer).
 *
 * Changes from the proto:
 *   - State lives in ~/.pi/learn/timer/ (not .pi/timer/ in a project repo).
 *   - Default session length comes from the active Track's process_contract.session_min.
 *   - Track id is a free-form string, not a hardcoded union.
 *   - Auto-starts from /learn-start via the `learn:timer:start` event.
 *   - Emits `learn:timer:stopped` with the elapsed minutes when a focus segment
 *     completes, so /learn-reflect can pick up the session duration.
 *
 * Commands:
 *   /learn-timer                Show current state
 *   /learn-timer start [min]    Begin work (default: active track's session_min or 45)
 *   /learn-timer pause          Pause the running timer
 *   /learn-timer resume         Resume a paused timer
 *   /learn-timer stop           Stop, log interrupted, return to idle
 *   /learn-timer reset          Clear without logging
 *   /learn-timer stats          Today's focus minutes + session count
 *
 * Data:
 *   ~/.pi/learn/timer/state.json  — running state (restored paused on next session)
 *   ~/.pi/learn/timer/log.jsonl   — one JSON per completed/interrupted work session
 */

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { LEARN_ROOT, slugify } from "../lib/paths";
import { formatClock, today } from "../lib/format";
import { getActiveTrack, loadTrack } from "../lib/track";

type Mode = "idle" | "work" | "break";

interface TimerState {
	mode: Mode;
	paused: boolean;
	totalSec: number;
	startedAt: string | null;
	pausedAt: string | null;
	track: string | null;
	cyclesToday: number;
	cycleDate: string;
}

interface LogEntry {
	id: string;
	track: string | null;
	started_at: string;
	ended_at: string;
	duration_min: number;
	state: "completed" | "interrupted";
	cycles: number;
}

const DEFAULT_WORK_SEC = 45 * 60;
const SHORT_BREAK_SEC = 5 * 60;
const LONG_BREAK_SEC = 15 * 60;
const CYCLES_BEFORE_LONG_BREAK = 4;

const TIMER_DIR = join(LEARN_ROOT, "timer");
const STATE_FILE = join(TIMER_DIR, "state.json");
const LOG_FILE = join(TIMER_DIR, "log.jsonl");

function freshState(): TimerState {
	return {
		mode: "idle",
		paused: false,
		totalSec: 0,
		startedAt: null,
		pausedAt: null,
		track: null,
		cyclesToday: 0,
		cycleDate: today(),
	};
}

export default function learnTimer(pi: ExtensionAPI) {
	let currentCtx: ExtensionCommandContext | null = null;
	let state: TimerState = freshState();
	let tickHandle: ReturnType<typeof setInterval> | null = null;

	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;
		state = await loadState();
		rollCyclesIfNeeded();
		if (state.mode !== "idle" && state.startedAt) {
			const remaining = computeRemaining();
			if (remaining <= 0) {
				await completeSegment();
			} else {
				state.paused = true;
				state.pausedAt = new Date().toISOString();
				await persistState();
				ctx.ui.notify("Timer restored — /learn-timer resume", "info");
			}
		}
		render();
	});

	pi.on("session_shutdown", async () => {
		stopTick();
		if (state.mode === "work" && state.startedAt) {
			await logInterrupted();
			state = freshState();
			await persistState();
		} else {
			await persistState();
		}
		clearWidget();
	});

	pi.events.on("learn:timer:start", (data) => {
		const { minutes, track } = (data ?? {}) as { minutes?: number; track?: string };
		if (!currentCtx) return;
		const secs = minutes && minutes > 0 ? Math.round(minutes * 60) : DEFAULT_WORK_SEC;
		startWork(secs, track ?? state.track ?? null);
	});

	pi.registerCommand("learn-timer", {
		description: "Pomodoro timer: /learn-timer [start|pause|resume|stop|reset|stats]",
		handler: async (args, ctx) => {
			currentCtx = ctx;
			const sub = args.trim().split(/\s+/)[0] ?? "";
			const rest = args.trim().slice(sub.length).trim();
			if (!sub) {
				ctx.ui.notify(formatStatusLine(state), "info");
				return;
			}
			switch (sub) {
				case "start":
					await cmdStart(rest);
					break;
				case "pause":
					cmdPause();
					break;
				case "resume":
					cmdResume();
					break;
				case "stop":
					await cmdStop();
					break;
				case "reset":
					cmdReset();
					break;
				case "stats":
					await cmdStats();
					break;
				default:
					ctx.ui.notify(`Unknown subcommand "${sub}". Try: start, pause, resume, stop, reset, stats`, "warning");
			}
		},
	});

	async function cmdStart(rest: string): Promise<void> {
		const mins = Number.parseInt(rest, 10);
		let secs: number;
		let track: string | null;
		if (Number.isFinite(mins) && mins > 0) {
			secs = mins * 60;
			const active = await getActiveTrack();
			track = active?.id ?? state.track ?? null;
		} else {
			const active = await getActiveTrack();
			secs = (active?.process_contract.session_min ?? 45) * 60;
			track = active?.id ?? state.track ?? null;
		}
		startWork(secs, track);
	}

	function startWork(secs: number, track: string | null): void {
		stopTick();
		rollCyclesIfNeeded();
		state = {
			...freshState(),
			cyclesToday: state.cyclesToday,
			cycleDate: state.cycleDate,
			mode: "work",
			paused: false,
			totalSec: secs,
			startedAt: new Date().toISOString(),
			pausedAt: null,
			track,
		};
		startTick();
		void persistState();
		render();
		currentCtx?.ui.notify(`Focus started · ${Math.round(secs / 60)}m${track ? ` · ${track}` : ""}`, "info");
	}

	function cmdPause(): void {
		if (state.mode === "idle" || state.paused) {
			currentCtx?.ui.notify("Nothing to pause", "info");
			return;
		}
		state.paused = true;
		state.pausedAt = new Date().toISOString();
		stopTick();
		void persistState();
		render();
		currentCtx?.ui.notify("Paused", "info");
	}

	function cmdResume(): void {
		if (state.mode === "idle") {
			currentCtx?.ui.notify("No timer running — /learn-timer start", "info");
			return;
		}
		if (!state.paused) {
			currentCtx?.ui.notify("Already running", "info");
			return;
		}
		state.paused = false;
		state.pausedAt = null;
		startTick();
		void persistState();
		render();
		currentCtx?.ui.notify("Resumed", "info");
	}

	async function cmdStop(): Promise<void> {
		if (state.mode === "idle") {
			currentCtx?.ui.notify("No timer running", "info");
			return;
		}
		if (state.mode === "work" && state.startedAt) {
			await logInterrupted();
		}
		stopTick();
		state = freshState();
		await persistState();
		render();
		currentCtx?.ui.notify("Stopped", "info");
	}

	function cmdReset(): void {
		stopTick();
		state = freshState();
		void persistState();
		render();
		currentCtx?.ui.notify("Reset", "info");
	}

	async function cmdStats(): Promise<void> {
		const entries = await loadTodayLog();
		const focusMin = entries.filter((e) => e.state === "completed").reduce((s, e) => s + e.duration_min, 0);
		const interrupted = entries.filter((e) => e.state === "interrupted").length;
		const completed = entries.filter((e) => e.state === "completed").length;
		currentCtx?.ui.notify(
			`Today: ${focusMin}m focus · ${completed} completed · ${interrupted} interrupted · cycle ${state.cyclesToday}/${CYCLES_BEFORE_LONG_BREAK}`,
			"info",
		);
	}

	function startTick(): void {
		stopTick();
		tickHandle = setInterval(() => {
			if (state.paused || state.mode === "idle") return;
			const remaining = computeRemaining();
			if (remaining <= 0) {
				void completeSegment();
			} else {
				render();
			}
		}, 1000);
	}

	function stopTick(): void {
		if (tickHandle !== null) {
			clearInterval(tickHandle);
			tickHandle = null;
		}
	}

	async function completeSegment(): Promise<void> {
		stopTick();
		const finishedMode = state.mode;
		const track = state.track;
		const startedAt = state.startedAt ?? new Date().toISOString();
		const endedAt = new Date().toISOString();
		const minutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000));

		if (finishedMode === "work") {
			state.cyclesToday += 1;
			await appendLog({
				id: randomUUID(),
				track,
				started_at: startedAt,
				ended_at: endedAt,
				duration_min: minutes,
				state: "completed",
				cycles: state.cyclesToday,
			});
			// Notify /learn-reflect so it can offer a reflection with the real duration.
			pi.events.emit("learn:timer:stopped", { minutes, track, state: "completed" });
			const isLong = state.cyclesToday % CYCLES_BEFORE_LONG_BREAK === 0;
			const breakSec = isLong ? LONG_BREAK_SEC : SHORT_BREAK_SEC;
			state.mode = "break";
			state.totalSec = breakSec;
			state.startedAt = endedAt;
			state.paused = false;
			currentCtx?.ui.notify(
				`Focus done · ${isLong ? "long" : "short"} break (${Math.round(breakSec / 60)}m) — /learn-reflect to debrief`,
				"info",
			);
			startTick();
		} else {
			state = { ...freshState(), cyclesToday: state.cyclesToday, cycleDate: state.cycleDate };
			currentCtx?.ui.notify("Break done — /learn-timer start when ready", "info");
		}
		await persistState();
		render();
	}

	async function logInterrupted(): Promise<void> {
		if (!state.startedAt) return;
		const endedAt = new Date().toISOString();
		const elapsedMin = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(state.startedAt)) / 60_000));
		if (elapsedMin < 1) return;
		await appendLog({
			id: randomUUID(),
			track: state.track,
			started_at: state.startedAt,
			ended_at: endedAt,
			duration_min: elapsedMin,
			state: "interrupted",
			cycles: state.cyclesToday,
		});
		pi.events.emit("learn:timer:stopped", { minutes: elapsedMin, track: state.track, state: "interrupted" });
	}

	function computeRemaining(): number {
		if (!state.startedAt) return state.totalSec;
		const elapsedSec = Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000);
		return state.totalSec - elapsedSec;
	}

	function rollCyclesIfNeeded(): void {
		const t = today();
		if (state.cycleDate !== t) {
			state.cyclesToday = 0;
			state.cycleDate = t;
		}
	}

	function render(): void {
		const ctx = currentCtx;
		if (!ctx?.hasUI) return;
		if (state.mode === "idle" && !state.startedAt) {
			clearWidget();
			return;
		}
		const remaining = state.paused ? state.totalSec - pausedElapsed() : computeRemaining();
		const sec = Math.max(0, remaining);
		ctx.ui.setWidget("learn-timer", [formatWidgetLine(ctx, state, sec)], { placement: "belowEditor" });
		ctx.ui.setStatus("learn-timer", formatFooter(ctx, state, sec));
	}

	function clearWidget(): void {
		const ctx = currentCtx;
		if (!ctx?.hasUI) return;
		ctx.ui.setWidget("learn-timer", undefined);
		ctx.ui.setStatus("learn-timer", undefined);
	}

	function pausedElapsed(): number {
		if (!state.startedAt || !state.pausedAt) return state.totalSec;
		return Math.floor((Date.parse(state.pausedAt) - Date.parse(state.startedAt)) / 1000);
	}

	async function persistState(): Promise<void> {
		await mkdir(TIMER_DIR, { recursive: true });
		// Use a unique tmp path per call so concurrent persistState() calls don't
		// clobber each other's tmp file (which caused ENOENT on rename).
		const tmp = `${STATE_FILE}.${process.pid}.${randomUUID()}.tmp`;
		await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
		await rename(tmp, STATE_FILE);
	}

	async function appendLog(entry: LogEntry): Promise<void> {
		await mkdir(TIMER_DIR, { recursive: true });
		await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
	}

	async function loadTodayLog(): Promise<LogEntry[]> {
		try {
			const raw = await readFile(LOG_FILE, "utf8");
			const t = today();
			return raw
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as LogEntry)
				.filter((e) => e.ended_at.slice(0, 10) === t);
		} catch {
			return [];
		}
	}

	async function loadState(): Promise<TimerState> {
		try {
			const raw = await readFile(STATE_FILE, "utf8");
			return { ...freshState(), ...(JSON.parse(raw) as Partial<TimerState>) };
		} catch {
			return freshState();
		}
	}

	// Expose a slugged track label helper for other modules via the event bus is overkill;
	// keep slugify import used so the surface is stable for future per-track timer files.
	void slugify;
	void loadTrack;
}

function formatWidgetLine(ctx: ExtensionCommandContext, state: TimerState, sec: number): string {
	const theme = ctx.ui.theme;
	const barWidth = 16;
	const progress = state.totalSec > 0 ? 1 - sec / state.totalSec : 0;
	const filled = Math.round(progress * barWidth);
	const bar = `${"█".repeat(Math.min(filled, barWidth))}${"░".repeat(Math.max(barWidth - filled, 0))}`;
	const time = formatClock(sec);
	const cycle = `cycle ${state.cyclesToday}/${CYCLES_BEFORE_LONG_BREAK}`;
	if (state.paused) {
		return `${theme.fg("warning", "⏸")} ${bar} ${theme.fg("warning", `paused ${time}`)} · ${theme.fg("dim", cycle)}`;
	}
	if (state.mode === "work") {
		return `${theme.fg("accent", "🎯")} ${bar} ${theme.fg("accent", `focus ${time}`)} · ${theme.fg("dim", cycle)}`;
	}
	return `${theme.fg("success", "☕")} ${bar} ${theme.fg("success", `break ${time}`)} · ${theme.fg("dim", cycle)}`;
}

function formatFooter(ctx: ExtensionCommandContext, state: TimerState, sec: number): string {
	const theme = ctx.ui.theme;
	const time = formatClock(sec);
	if (state.paused) return theme.fg("warning", `⏸ ${time}`);
	if (state.mode === "work") return theme.fg("accent", `⏱ ${time}`);
	if (state.mode === "break") return theme.fg("success", `☕ ${time}`);
	return theme.fg("dim", "⏱ idle");
}

function formatStatusLine(state: TimerState): string {
	if (state.mode === "idle") return "Timer idle · /learn-timer start [min]";
	const sec = state.paused ? state.totalSec : Math.max(0, computeRemainingStatic(state));
	const time = formatClock(sec);
	const label = state.mode === "work" ? "focus" : "break";
	const pauseTag = state.paused ? " (paused)" : "";
	return `${label} ${time}${pauseTag} · cycle ${state.cyclesToday}/${CYCLES_BEFORE_LONG_BREAK}${state.track ? ` · ${state.track}` : ""}`;
}

function computeRemainingStatic(state: TimerState): number {
	if (!state.startedAt) return state.totalSec;
	return state.totalSec - Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000);
}
