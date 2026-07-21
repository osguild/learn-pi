/**
 * learn-start — jump into the active exercise and host the coding + review loop.
 *
 * Flow:
 *   1. Resolve track: arg > active > pick from index.
 *   2. Resolve active exercise unit (in_progress > active > pending).
 *   3. Print reference summary + exercise spec; ensure starter file exists.
 *   4. Render dashboard widget; start timer.
 *   5. Hand off to socratic-method scoped to the exercise; agent generates tests
 *      and reviews diffs — never writes the implementation.
 *
 * Command:
 *   /learn-start [track-id] [energy]
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadIndex,
	loadTrackOrThrow,
	resolveActiveExerciseUnit,
	saveTrack,
	setActiveTrack,
	setUnitExerciseStatus,
	trackExists,
	type Energy,
	type MaterialUnit,
	type Track,
} from "../lib/track";
import { renderTrackDashboard } from "../lib/format";

const DEFAULT_DASHBOARD_WIDTH = 80;

export default function learnStart(pi: ExtensionAPI) {
	pi.registerCommand("learn-start", {
		description: "Start a learning session: open the active exercise, start timer, begin socratic review loop.",
		getArgumentCompletions: (prefix: string) => {
			void prefix;
			return null;
		},
		handler: async (args, ctx) => {
			await start(args, ctx, pi);
		},
	});
}

async function start(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const trackIdArg = tokens[0];
	const energy = parseEnergy(tokens[1]);

	let track = await resolveTrack(trackIdArg, ctx);
	if (!track) return;

	const now = new Date().toISOString();
	const exerciseUnit = resolveActiveExerciseUnit(track);
	if (exerciseUnit?.exercise?.status === "todo") {
		track = setUnitExerciseStatus(track, exerciseUnit.id, "in_progress", now);
		await saveTrack(track);
	}

	await setActiveTrack(track.id);
	renderDashboard(ctx, track, exerciseUnit);
	surfaceCueStatus(ctx, track);
	startTimerFor(pi, track);

	if (exerciseUnit?.exercise) {
		await surfaceExercise(ctx, track, exerciseUnit);
		kickoffExerciseSession(pi, track, exerciseUnit, energy);
	} else {
		kickoffEdgeSession(pi, track, energy);
	}
}

async function resolveTrack(arg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (arg) {
		if (await trackExists(arg)) {
			return loadTrackOrThrow(arg);
		}
		ctx.ui.notify(`Track "${arg}" not found.`, "warning");
	}
	const active = await getActiveTrack();
	if (active) return active;

	const index = await loadIndex();
	if (index.tracks.length === 0) {
		ctx.ui.notify(
			"No tracks yet. Create one with /learn-scaffold or /learn-plan.",
			"info",
		);
		return null;
	}
	const labels = index.tracks.map((t) => `${t.label} (${t.id})`);
	const choice = await ctx.ui.select("Pick a track:", labels);
	if (choice === undefined) return null;
	const picked = index.tracks[labels.indexOf(choice)];
	if (!picked) return null;
	return loadTrackOrThrow(picked.id);
}

function renderDashboard(
	ctx: ExtensionCommandContext,
	track: Track,
	exerciseUnit: MaterialUnit | null,
): void {
	if (!ctx.hasUI) {
		const ex = exerciseUnit?.exercise;
		const line = ex
			? `${track.label} · exercise: ${exerciseUnit!.title} · ${ex.starter_path ?? "(no starter file)"}`
			: `${track.label} · edge: ${track.edge.statement} · next: ${track.next_action}`;
		ctx.ui.notify(line, "info");
		return;
	}
	const lines = renderTrackDashboard(ctx, track, DEFAULT_DASHBOARD_WIDTH, exerciseUnit);
	ctx.ui.setWidget("learn-start", lines, { placement: "belowEditor" });
}

async function surfaceExercise(
	ctx: ExtensionCommandContext,
	track: Track,
	unit: MaterialUnit,
): Promise<void> {
	const ex = unit.exercise!;
	if (unit.reference?.summary) {
		ctx.ui.notify(`Reference — ${unit.title}\n\n${unit.reference.summary}`, "info");
	}
	ctx.ui.notify(`Exercise — ${unit.title}\n\n${ex.spec}`, "info");

	if (ex.starter_path && track.work_dir) {
		const fullPath = await ensureStarterFile(track.work_dir, ex.starter_path);
		ctx.ui.notify(`Open and implement: ${fullPath}`, "info");
	}
	if (ex.test_path) {
		ctx.ui.notify(`Tests (agent-owned): ${ex.test_path}`, "info");
	}
}

async function ensureStarterFile(workDir: string, starterPath: string): Promise<string> {
	const fullPath = join(workDir, starterPath);
	await mkdir(dirname(fullPath), { recursive: true });
	try {
		await access(fullPath);
	} catch {
		await writeFile(fullPath, "# Implement here\n", "utf8");
	}
	return fullPath;
}

function surfaceCueStatus(ctx: ExtensionCommandContext, track: Track): void {
	const cue = track.process_contract.cue;
	if (!cue) return;
	const last = track.last_session_at ? Date.parse(track.last_session_at) : null;
	if (last === null) {
		ctx.ui.notify(`First session on ${track.label}. Cue set: ${describeCue(cue)}.`, "info");
		return;
	}
	const hoursSince = (Date.now() - last) / 3_600_000;
	if (hoursSince >= 20) {
		ctx.ui.notify(
			`Your cue fired ~${Math.round(hoursSince)}h ago — showing up now.`,
			"info",
		);
	}
}

function startTimerFor(pi: ExtensionAPI, track: Track): void {
	const minutes = track.process_contract.session_min;
	pi.events.emit("learn:timer:start", { minutes, track: track.id });
}

function kickoffExerciseSession(
	api: ExtensionAPI,
	track: Track,
	unit: MaterialUnit,
	energy: Energy | null,
): void {
	const ex = unit.exercise!;
	const testPath = ex.test_path ?? "(agent picks a test file path)";
	const energyLine = energy ? `\nEnergy today: ${energy} — calibrate scope accordingly.` : "";
	const verify = ex.test_command || track.verify_command || "(unset)";

	const kickoff = [
		`Starting exercise session on ${track.label}.`,
		``,
		`Unit: ${unit.title} (${unit.id})`,
		unit.reference?.summary ? `Reference:\n${unit.reference.summary}` : "",
		`Exercise spec:\n${ex.spec}`,
		``,
		`Learner is hand-coding exercise ${unit.id}. Your role: when asked, generate or update tests at ${testPath}, run ${ex.test_command}, report pass/fail with the failing assertion. On "review," read the diff and ask questions — do **not** rewrite the implementation. Do not write the implementation under any circumstance; the learner types every line.`,
		``,
		`Work in socratic-method mode scoped to this exercise. Lead with questions about the learner's approach; do not hand over solutions.`,
		`Verify command for this exercise: ${verify}.${energyLine}`,
		``,
		`Begin by asking what part of ${ex.starter_path ?? "the starter file"} they will implement first.`,
	].filter(Boolean).join("\n");

	api.sendUserMessage(kickoff);
}

function kickoffEdgeSession(api: ExtensionAPI, track: Track, energy: Energy | null): void {
	const energyLine = energy ? `\nEnergy today: ${energy} — calibrate scope accordingly.` : "";
	const kickoff = [
		`Starting a learning session on ${track.label}.`,
		``,
		`Outcome compass: ${track.outcome_compass || "(unset)"}`,
		`Current edge: ${track.edge.statement}`,
		`Next action: ${track.next_action}`,
		``,
		`Work in the socratic-method mode: lead me to the next insight via questions, do not hand over conclusions. The verify command for this track is: ${track.verify_command ?? "(unset — set one with /learn-plan)"}.${energyLine}`,
		``,
		`Begin by orienting me on the next action above.`,
	].join("\n");
	api.sendUserMessage(kickoff);
}

function parseEnergy(token: string | undefined): Energy | null {
	if (!token) return null;
	const t = token.toLowerCase();
	if (t === "low" || t === "medium" || t === "high") return t;
	return null;
}

function describeCue(cue: NonNullable<Track["process_contract"]["cue"]>): string {
	if (cue.kind === "once") return `once at ${cue.at ?? "(unset)"}`;
	if (cue.kind === "daily") return `daily at ${cue.time}`;
	return `${(cue.days ?? []).join(", ")} at ${cue.time}`;
}
