/**
 * learn-start — the re-entry command. Centerpiece of the package.
 *
 * This is the architectural fix for the socrates-plan failure: the waiting
 * next_action is rendered the moment /learn-start runs (and the session_start
 * widget in index.ts renders it even before any command). Re-entry is
 * "execute the next action" not "figure out what to do."
 *
 * Flow:
 *   1. Resolve track: arg > active > pick from index > (notify if none).
 *   2. Set active, render dashboard widget (outcome compass + edge + next_action).
 *   3. Surface cue status: if a configured cue time passed since last_session_at,
 *      note "your cue fired N hours ago" — the reward half of #10 is showing up.
 *   4. Start the timer via the learn:timer:start event (uses session_min from Track).
 *   5. Hand off to the socratic-method skill with a session kickoff message that
 *      frames the work around the current edge + next_action. Socratic is ON here.
 *
 * Command:
 *   /learn-start [track-id] [energy]   Quick: /learn-start rust-webgpu low
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadIndex,
	loadTrackOrThrow,
	saveTrack,
	setActiveTrack,
	trackExists,
	type Energy,
	type Track,
} from "../lib/track";
import { renderTrackDashboard } from "../lib/format";

const DEFAULT_DASHBOARD_WIDTH = 80;

export default function learnStart(pi: ExtensionAPI) {
	pi.registerCommand("learn-start", {
		description: "Re-enter a learning track: render edge + next_action, start timer, begin socratic session.",
		getArgumentCompletions: (prefix: string) => {
			// Synchronous-ish completion: return null to defer to built-ins when no tracks match.
			// We can't await here, so we return null and let the pick dialog handle selection.
			void prefix;
			return null;
		},
		handler: async (args, ctx) => {
			await start(args, ctx);
		},
	});

	async function start(args: string, ctx: ExtensionCommandContext): Promise<void> {
		const tokens = args.trim().split(/\s+/).filter(Boolean);
		const trackIdArg = tokens[0];
		const energy = parseEnergy(tokens[1]);

		const track = await resolveTrack(trackIdArg, ctx);
		if (!track) return;

		await setActiveTrack(track.id);
		renderDashboard(ctx, track);
		surfaceCueStatus(ctx, track);
		startTimerFor(track);
		kickoffSocraticSession(pi, track, energy);
	}

	async function resolveTrack(arg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
		if (arg) {
			if (await trackExists(arg)) {
				return loadTrackOrThrow(arg);
			}
			ctx.ui.notify(`Track "${arg}" not found.`, "warning");
		}
		// Fall back to active track.
		const active = await getActiveTrack();
		if (active) return active;

		// No active track — pick from index.
		const index = await loadIndex();
		if (index.tracks.length === 0) {
			ctx.ui.notify(
				"No tracks yet. Create one with /learn-plan (or /learn-scaffold to scaffold a project + track).",
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

	function renderDashboard(ctx: ExtensionCommandContext, track: Track): void {
		if (!ctx.hasUI) {
			ctx.ui.notify(
				`${track.label} · edge: ${track.edge.statement} · next: ${track.next_action}`,
				"info",
			);
			return;
		}
		const lines = renderTrackDashboard(ctx, track, DEFAULT_DASHBOARD_WIDTH);
		ctx.ui.setWidget("learn-start", lines, { placement: "belowEditor" });
	}

	function surfaceCueStatus(ctx: ExtensionCommandContext, track: Track): void {
		const cue = track.process_contract.cue;
		if (!cue) return;
		const last = track.last_session_at ? Date.parse(track.last_session_at) : null;
		const now = Date.now();
		if (last === null) {
			ctx.ui.notify(`First session on ${track.label}. Cue set: ${describeCue(cue)}.`, "info");
			return;
		}
		const hoursSince = (now - last) / 3_600_000;
		if (hoursSince >= 20) {
			ctx.ui.notify(
				`Your cue fired ~${Math.round(hoursSince)}h ago — showing up now. Edge: ${track.edge.statement}`,
				"info",
			);
		}
	}

	function startTimerFor(track: Track): void {
		const minutes = track.process_contract.session_min;
		pi.events.emit("learn:timer:start", { minutes, track: track.id });
	}

	function kickoffSocraticSession(api: ExtensionAPI, track: Track, energy: Energy | null): void {
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
