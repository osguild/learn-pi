/**
 * Socrates Timer — pomodoro + session-duration tracker
 *
 * Persistent below-editor widget with footer status. Auto-starts from
 * /socrates-start via the `socrates:timer:start` event.
 *
 * Commands:
 *   /socrates-timer                Show current state
 *   /socrates-timer start [min]    Begin work (default: learner.session_length_min or 25)
 *   /socrates-timer pause          Pause the running timer
 *   /socrates-timer resume         Resume a paused timer
 *   /socrates-timer stop           Stop, log interrupted, return to idle
 *   /socrates-timer reset          Clear without logging
 *   /socrates-timer stats          Today's focus minutes + session count
 *
 * Data:
 *   .pi/timer/state.json  — running state (restored paused on next session)
 *   .pi/timer/log.jsonl   — one JSON per completed/interrupted work session
 */

import { accessSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type TrackId = "rust-rag-learn" | "rust-webgpu" | "c";
type Mode = "idle" | "work" | "break";

interface LearnerState {
	track?: TrackId;
	current_focus?: string;
	session_length_min?: 25 | 45;
	energy?: "low" | "medium" | "high";
	updated_at?: string;
}

interface TimerState {
	mode: Mode;
	paused: boolean;
	totalSec: number;
	/** ISO when the current segment started (wall clock). Null when idle. */
	startedAt: string | null;
	/** ISO when the timer was paused. Used to subtract paused duration. */
	pausedAt: string | null;
	track: TrackId | null;
	cyclesToday: number;
	cycleDate: string; // YYYY-MM-DD for cycle reset
}

interface LogEntry {
	id: string;
	track: TrackId | null;
	started_at: string;
	ended_at: string;
	duration_min: number;
	state: "completed" | "interrupted";
	cycles: number;
}

const DEFAULT_WORK_SEC = 25 * 60;
const SHORT_BREAK_SEC = 5 * 60;
const LONG_BREAK_SEC = 15 * 60;
const CYCLES_BEFORE_LONG_BREAK = 4;

const TIMER_DIR = join(".pi", "timer");
const STATE_FILE = join(TIMER_DIR, "state.json");
const LOG_FILE = join(TIMER_DIR, "log.jsonl");
const LEARNER_STATE = join(".pi", "learner.json");

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

export default function socratesTimer(pi: ExtensionAPI) {
	let repoRoot: string | null = null;
	let currentCtx: ExtensionCommandContext | null = null;
	let state: TimerState = freshState();
	let tickHandle: ReturnType<typeof setInterval> | null = null;

	pi.on("session_start", async (_event, ctx) => {
		repoRoot = findRepoRoot(ctx.cwd);
		currentCtx = ctx;
		state = await loadState(repoRoot);
		rollCyclesIfNeeded();
		if (state.mode !== "idle" && state.startedAt) {
			// Recompute remaining from wall clock; if elapsed >= total, finalize.
			const remaining = computeRemaining();
			if (remaining <= 0) {
				await completeSegment();
			} else {
				// Restore paused so user explicitly resumes.
				state.paused = true;
				state.pausedAt = new Date().toISOString();
				await persistState();
				ctx.ui.notify("Timer restored — /socrates-timer resume", "info");
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

	pi.events.on("socrates:timer:start", (data) => {
		const { minutes, track } = (data ?? {}) as { minutes?: number; track?: TrackId };
		if (!currentCtx) return;
		const secs = minutes && minutes > 0 ? Math.round(minutes * 60) : DEFAULT_WORK_SEC;
		startWork(secs, track ?? null);
	});

	pi.registerCommand("socrates-timer", {
		description: "Pomodoro timer: /socrates-timer [start|pause|resume|stop|reset|stats]",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
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

	function ensureRepo(ctx: ExtensionCommandContext): boolean {
		repoRoot = repoRoot ?? findRepoRoot(ctx.cwd);
		if (!repoRoot) {
			ctx.ui.notify("Socrates timer only works inside socratic-playground", "warning");
			return false;
		}
		return true;
	}

	async function cmdStart(rest: string): Promise<void> {
		const mins = Number.parseInt(rest, 10);
		const learner = await loadLearnerState(repoRoot!);
		const secs = Number.isFinite(mins) && mins > 0
			? mins * 60
			: (learner.session_length_min ?? 25) * 60;
		const track = learner.track ?? state.track ?? null;
		startWork(secs, track);
	}

	function startWork(secs: number, track: TrackId | null): void {
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
			currentCtx?.ui.notify("No timer running — /socrates-timer start", "info");
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
		const focusMin = entries
			.filter((e) => e.state === "completed")
			.reduce((sum, e) => sum + e.duration_min, 0);
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

		if (finishedMode === "work") {
			state.cyclesToday += 1;
			await appendLog({
				id: randomUUID(),
				track,
				started_at: startedAt,
				ended_at: endedAt,
				duration_min: Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000)),
				state: "completed",
				cycles: state.cyclesToday,
			});
			const isLong = state.cyclesToday % CYCLES_BEFORE_LONG_BREAK === 0;
			const breakSec = isLong ? LONG_BREAK_SEC : SHORT_BREAK_SEC;
			state.mode = "break";
			state.totalSec = breakSec;
			state.startedAt = endedAt;
			state.paused = false;
			currentCtx?.ui.notify(
				`Focus done · ${isLong ? "long" : "short"} break (${Math.round(breakSec / 60)}m)`,
				"info",
			);
			startTick();
		} else {
			// break finished
			state = { ...freshState(), cyclesToday: state.cyclesToday, cycleDate: state.cycleDate };
			currentCtx?.ui.notify("Break done — /socrates-timer start when ready", "info");
		}
		await persistState();
		render();
	}

	async function logInterrupted(): Promise<void> {
		if (!state.startedAt) return;
		const endedAt = new Date().toISOString();
		const elapsedMin = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(state.startedAt)) / 60_000));
		if (elapsedMin < 1) return; // skip sub-minute interruptions
		await appendLog({
			id: randomUUID(),
			track: state.track,
			started_at: state.startedAt,
			ended_at: endedAt,
			duration_min: elapsedMin,
			state: "interrupted",
			cycles: state.cyclesToday,
		});
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
		const lines = [formatWidgetLine(ctx, state, sec)];
		ctx.ui.setWidget("socrates-timer", lines, { placement: "belowEditor" });
		ctx.ui.setStatus("socrates-timer", formatFooter(ctx, state, sec));
	}

	function clearWidget(): void {
		const ctx = currentCtx;
		if (!ctx?.hasUI) return;
		ctx.ui.setWidget("socrates-timer", undefined);
		ctx.ui.setStatus("socrates-timer", undefined);
	}

	function pausedElapsed(): number {
		// When paused, freeze remaining at the moment of pause.
		if (!state.startedAt || !state.pausedAt) return state.totalSec;
		const elapsedBeforePause = Math.floor((Date.parse(state.pausedAt) - Date.parse(state.startedAt)) / 1000);
		return elapsedBeforePause;
	}

	async function persistState(): Promise<void> {
		if (!repoRoot) return;
		const path = join(repoRoot, STATE_FILE);
		await mkdir(dirname(path), { recursive: true });
		const tmp = `${path}.tmp`;
		await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
		await rename(tmp, path);
	}

	async function appendLog(entry: LogEntry): Promise<void> {
		if (!repoRoot) return;
		const path = join(repoRoot, LOG_FILE);
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
	}

	async function loadTodayLog(): Promise<LogEntry[]> {
		if (!repoRoot) return [];
		try {
			const raw = await readFile(join(repoRoot, LOG_FILE), "utf8");
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

	async function loadState(root: string | null): Promise<TimerState> {
		if (!root) return freshState();
		try {
			const raw = await readFile(join(root, STATE_FILE), "utf8");
			const parsed = JSON.parse(raw) as Partial<TimerState>;
			return { ...freshState(), ...parsed };
		} catch {
			return freshState();
		}
	}
}

function formatWidgetLine(
	ctx: ExtensionCommandContext,
	state: TimerState,
	sec: number,
): string {
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

function formatFooter(
	ctx: ExtensionCommandContext,
	state: TimerState,
	sec: number,
): string {
	const theme = ctx.ui.theme;
	const time = formatClock(sec);
	if (state.paused) return theme.fg("warning", `⏸ ${time}`);
	if (state.mode === "work") return theme.fg("accent", `⏱ ${time}`);
	if (state.mode === "break") return theme.fg("success", `☕ ${time}`);
	return theme.fg("dim", "⏱ idle");
}

function formatStatusLine(state: TimerState): string {
	if (state.mode === "idle") return "Timer idle · /socrates-timer start [min]";
	const sec = state.paused ? state.totalSec - 0 : Math.max(0, computeRemainingStatic(state));
	const time = formatClock(sec);
	const label = state.mode === "work" ? "focus" : "break";
	const pauseTag = state.paused ? " (paused)" : "";
	return `${label} ${time}${pauseTag} · cycle ${state.cyclesToday}/${CYCLES_BEFORE_LONG_BREAK}${state.track ? ` · ${state.track}` : ""}`;
}

function computeRemainingStatic(state: TimerState): number {
	if (!state.startedAt) return state.totalSec;
	return state.totalSec - Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000);
}

function formatClock(sec: number): string {
	const s = Math.max(0, sec);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

async function loadLearnerState(repoRoot: string): Promise<LearnerState> {
	try {
		const raw = await readFile(join(repoRoot, LEARNER_STATE), "utf8");
		return JSON.parse(raw) as LearnerState;
	} catch {
		return {};
	}
}

function findRepoRoot(cwd: string): string | null {
	let dir = resolve(cwd);
	for (let i = 0; i < 8; i++) {
		const rag = join(dir, "rust-rag-learn");
		const webgpu = join(dir, "rust-webgpu");
		const agents = join(dir, "AGENTS.md");
		if (pathExists(agents) && pathExists(rag) && pathExists(webgpu)) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function pathExists(path: string): boolean {
	try {
		accessSync(path);
		return true;
	} catch {
		return false;
	}
}
