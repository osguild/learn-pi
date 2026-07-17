/**
 * learn-yaks — the deferred-yaks list (mechanism #6 Mode A data half).
 *
 * Tangential drift gets defers to this list instead of being blocked, so it
 * doesn't feel like a loss. The behavioral mirror half is the scope-guard skill.
 *
 * Commands:
 *   /learn-yaks [track]               List open yaks for a track
 *   /learn-yaks add [track] <desc>    Add a deferred yak
 *   /learn-yaks resolve [track] <id>  Mark a yak resolved
 *   /learn-yaks all [track]           Include resolved yaks
 *
 * If [track] is omitted, uses the active track. When adding, the description
 * is everything after the track id (or after "add" if no track given).
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadTrackOrThrow,
	newYak,
	saveTrack,
	trackExists,
	type Track,
} from "../lib/track";

export default function learnYaks(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-yaks", {
		description: "Deferred-yaks list: /learn-yaks [add|resolve|all] [track] [desc|id]",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "list";

	// "add" consumes a description (rest of line); "resolve" consumes an id.
	if (sub === "add") {
		await cmdAdd(tokens.slice(1).join(" "), ctx);
		return;
	}
	if (sub === "resolve") {
		await cmdResolve(tokens.slice(1), ctx);
		return;
	}
	if (sub === "all") {
		await cmdList(tokens[1], ctx, true);
		return;
	}
	if (sub === "list") {
		await cmdList(tokens[1], ctx, false);
		return;
	}
	// Bare /learn-yaks <track> or /learn-yaks <desc-without-sub>
	// Heuristic: if the first token is a known track id, list it; otherwise treat as add.
	if (await trackExists(sub)) {
		await cmdList(sub, ctx, false);
	} else {
		await cmdAdd(args, ctx);
	}
}

async function resolveTrackAndRest(trackArg: string | undefined, rest: string, ctx: ExtensionCommandContext): Promise<{ track: Track; rest: string } | null> {
	if (trackArg && await trackExists(trackArg)) {
		return { track: await loadTrackOrThrow(trackArg), rest };
	}
	const active = await getActiveTrack();
	if (active) return { track: active, rest: `${trackArg ?? ""} ${rest}`.trim() };
	ctx.ui.notify("No active track. Specify one: /learn-yaks add <track> <desc>", "warning");
	return null;
}

async function cmdAdd(rest: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = rest.split(/\s+/).filter(Boolean);
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const desc = resolved.rest.trim();
	if (!desc) {
		ctx.ui.notify("No yak description given.", "warning");
		return;
	}
	const yak = newYak(desc);
	const updated: Track = {
		...resolved.track,
		deferred_yaks: [...resolved.track.deferred_yaks, yak],
	};
	await saveTrack(updated);
	ctx.ui.notify(`Deferred yak: ${yak.id} — "${desc}"`, "info");
}

async function cmdResolve(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const yakId = resolved.rest.trim();
	if (!yakId) {
		ctx.ui.notify("No yak id given. /learn-yaks resolve <track> <id>", "warning");
		return;
	}
	const match = resolved.track.deferred_yaks.find((y) => y.id === yakId || y.id.endsWith(yakId));
	if (!match) {
		ctx.ui.notify(`No yak matching "${yakId}".`, "warning");
		return;
	}
	const updated: Track = {
		...resolved.track,
		deferred_yaks: resolved.track.deferred_yaks.map((y) =>
			y.id === match.id ? { ...y, resolved: true } : y,
		),
	};
	await saveTrack(updated);
	ctx.ui.notify(`Resolved yak: ${match.id} — "${match.desc}"`, "info");
}

async function cmdList(trackArg: string | undefined, ctx: ExtensionCommandContext, includeResolved: boolean): Promise<void> {
	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;
	const yaks = includeResolved ? track.deferred_yaks : track.deferred_yaks.filter((y) => !y.resolved);
	if (yaks.length === 0) {
		ctx.ui.notify(`No${includeResolved ? "" : " open"} yaks on ${track.label}.`, "info");
		return;
	}
	const lines = yaks.map((y) => `${y.resolved ? "✓" : "○"} ${y.id} — ${y.desc}`);
	ctx.ui.notify(`${track.label} yaks:\n${lines.join("\n")}`, "info");
}

async function resolveTrack(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (trackArg && await trackExists(trackArg)) return loadTrackOrThrow(trackArg);
	const active = await getActiveTrack();
	if (active) return active;
	ctx.ui.notify("No active track. Specify one: /learn-yaks <track>", "warning");
	return null;
}
