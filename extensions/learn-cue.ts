/**
 * learn-cue — the cue half of #10 (Cue-Routine-Reward). Hard cue: writes an
 * OS-level reminder (launchd → cron → ics) that fires when pi is closed.
 *
 * The cue carries the current next_action (read fresh at fire time), so when
 * the learner sees the notification, the waiting move is right there — lowering
 * the bar from "feel like it" to "the cue fired, I sit down."
 *
 * Commands:
 *   /learn-cue set [track]          Configure a cue (prompts for kind/time/days)
 *   /learn-cue show [track]         Show the cue config + install status
 *   /learn-cue test [track]         Fire the notifier script once now
 *   /learn-cue clear [track]        Unload + remove the cue
 *
 * If [track] is omitted, uses the active track.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadTrackOrThrow,
	saveTrack,
	trackExists,
	type CueConfig,
	type Track,
} from "../lib/track";
import {
	cueScriptPath,
	installCue,
	parseTime,
	uninstallCue,
} from "../lib/cue";
import { cueFile } from "../lib/paths";

export default function learnCue(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-cue", {
		description: "Hard cue: /learn-cue [set|show|test|clear] [track]",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "show";
	const trackArg = tokens[1];

	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;

	switch (sub) {
		case "set":
			await cmdSet(track, ctx);
			break;
		case "show":
			cmdShow(track, ctx);
			break;
		case "test":
			await cmdTest(track, ctx);
			break;
		case "clear":
			await cmdClear(track.id, ctx);
			break;
		default:
			ctx.ui.notify(`Unknown subcommand "${sub}". Try: set, show, test, clear`, "warning");
	}
}

async function resolveTrack(arg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (arg) {
		if (await trackExists(arg)) return loadTrackOrThrow(arg);
		ctx.ui.notify(`Track "${arg}" not found.`, "warning");
		return null;
	}
	const active = await getActiveTrack();
	if (active) return active;
	ctx.ui.notify("No active track. Specify one: /learn-cue set <track>", "warning");
	return null;
}

async function cmdSet(track: Track, ctx: ExtensionCommandContext): Promise<void> {
	const kind = await ctx.ui.select("Cue kind:", ["weekday", "daily", "once"]) as CueConfig["kind"] | undefined;
	if (!kind) return;

	const time = await ctx.ui.input("Time (HH:MM, 24h local):", "09:30");
	if (!time || !parseTime(time)) {
		ctx.ui.notify(`Invalid time "${time}". Use HH:MM.`, "warning");
		return;
	}

	const cue: CueConfig = { kind, time };
	if (kind === "weekday") {
		const daysStr = await ctx.ui.input("Weekdays (comma-separated, e.g. mon,tue,wed,thu,fri):", "mon,tue,wed,thu,fri");
		const days = (daysStr ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
		if (days.length === 0) {
			ctx.ui.notify("No weekdays given.", "warning");
			return;
		}
		cue.days = days;
	} else if (kind === "once") {
		const at = await ctx.ui.input("When (ISO date-time, e.g. 2026-07-14T09:30):", "");
		if (!at) {
			ctx.ui.notify("No date-time given.", "warning");
			return;
		}
		cue.at = at;
	}

	const updated: Track = {
		...track,
		process_contract: { ...track.process_contract, cue },
	};
	await saveTrack(updated);

	ctx.ui.setStatus("learn-cue", "Installing cue…");
	const result = await installCue(updated);
	ctx.ui.setStatus("learn-cue", undefined);
	ctx.ui.notify(`Cue installed via ${result.method}: ${result.message}`, result.method === "none" ? "error" : "info");
}

function cmdShow(track: Track, ctx: ExtensionCommandContext): void {
	const cue = track.process_contract.cue;
	const plistExists = existsSync(cueFile(track.id));
	if (!cue) {
		ctx.ui.notify(`No cue configured on ${track.label}. Run /learn-cue set.`, "info");
		return;
	}
	const desc = describeCue(cue);
	const installed = plistExists ? "launchd plist present" : "no plist file (not installed via launchd)";
	ctx.ui.notify(`${track.label} cue: ${desc}\n${installed}`, "info");
}

async function cmdTest(track: Track, ctx: ExtensionCommandContext): Promise<void> {
	if (!track.process_contract.cue) {
		ctx.ui.notify("No cue configured. Run /learn-cue set first.", "warning");
		return;
	}
	const script = cueScriptPath(track.id);
	if (!existsSync(script)) {
		// Install first so the script exists.
		await installCue(track);
	}
	try {
		execSync(`/bin/bash "${script}"`, { stdio: "inherit" });
		ctx.ui.notify("Cue fired (check your notifications).", "info");
	} catch (err) {
		ctx.ui.notify(`Cue test failed: ${(err as Error).message}`, "error");
	}
}

async function cmdClear(trackId: string, ctx: ExtensionCommandContext): Promise<void> {
	const msg = await uninstallCue(trackId);
	ctx.ui.notify(msg, "info");
}

function describeCue(cue: CueConfig): string {
	if (cue.kind === "once") return `once at ${cue.at ?? "(unset)"}`;
	if (cue.kind === "daily") return `daily at ${cue.time}`;
	return `${(cue.days ?? []).join(", ")} at ${cue.time}`;
}
