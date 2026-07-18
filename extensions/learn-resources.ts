/**
 * learn-resources — per-track and per-unit reading resources.
 *
 * Track-level resources cover background reading not tied to any unit; unit-
 * level resources travel with their MaterialUnit and surface in the dashboard
 * when that unit is active. Both live on the Track record (mechanism: single
 * source of truth), persisted via saveTrack.
 *
 * Commands:
 *   /learn-resources [track]                          List all resources
 *   /learn-resources add [track] [unit:<id>] <title> | <url> [--kind=<kind>]
 *                                                      Add a resource
 *   /learn-resources remove [track] <id>              Remove by id (track or unit)
 *
 * If [track] is omitted, uses the active track. The `<title> | <url>` pair is
 * split on the first `|`; either side may be wrapped in quotes for titles
 * containing pipes. `--kind` is optional and one of:
 * article | doc | video | book | paper | repo | other.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadTrackOrThrow,
	newResource,
	saveTrack,
	trackExists,
	type Resource,
	type ResourceKind,
	type Track,
} from "../lib/track";

const KINDS: ResourceKind[] = ["article", "doc", "video", "book", "paper", "repo", "other"];

export default function learnResources(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-resources", {
		description: "Track + unit reading resources: /learn-resources [add|remove] [track] [unit:<id>] <title> | <url> [--kind=]",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "list";

	if (sub === "add") {
		await cmdAdd(tokens.slice(1).join(" "), ctx);
		return;
	}
	if (sub === "remove") {
		await cmdRemove(tokens.slice(1), ctx);
		return;
	}
	if (sub === "list") {
		await cmdList(tokens[1], ctx);
		return;
	}
	// Bare /learn-resources <track> or /learn-resources <desc-without-sub>
	// Heuristic: if the first token is a known track id, list it; otherwise treat as add.
	if (await trackExists(sub)) {
		await cmdList(sub, ctx, false);
		return;
	}
	await cmdAdd(args, ctx);
}

async function resolveTrackAndRest(
	trackArg: string | undefined,
	rest: string,
	ctx: ExtensionCommandContext,
): Promise<{ track: Track; rest: string } | null> {
	if (trackArg && await trackExists(trackArg)) {
		return { track: await loadTrackOrThrow(trackArg), rest };
	}
	const active = await getActiveTrack();
	if (active) return { track: active, rest: `${trackArg ?? ""} ${rest}`.trim() };
	ctx.ui.notify("No active track. Specify one: /learn-resources add <track> <title> | <url>", "warning");
	return null;
}

/** Parse `add` rest into { unitId?, title, url, kind? }. */
function parseAddRest(rest: string): { unitId: string | null; title: string; url: string; kind: ResourceKind | null } | { error: string } {
	const tokens = rest.split(/\s+/).filter(Boolean);
	let unitId: string | null = null;
	let kind: ResourceKind | null = null;
	const positional: string[] = [];
	for (const tok of tokens) {
		if (tok.startsWith("unit:")) {
			unitId = tok.slice("unit:".length);
			continue;
		}
		if (tok.startsWith("--kind=")) {
			const k = tok.slice("--kind=".length).toLowerCase();
			kind = (KINDS as string[]).includes(k) ? (k as ResourceKind) : null;
			continue;
		}
		positional.push(tok);
	}
	const joined = positional.join(" ");
	const pipeIdx = joined.indexOf("|");
	if (pipeIdx === -1) {
		return { error: "Missing `|` separator between title and url. Format: <title> | <url>" };
	}
	const title = joined.slice(0, pipeIdx).trim().replace(/^"|"$/g, "");
	const url = joined.slice(pipeIdx + 1).trim().replace(/^"|"$/g, "");
	if (!title) return { error: "Title is empty." };
	if (!url) return { error: "URL is empty." };
	return { unitId, title, url, kind };
}

async function cmdAdd(rest: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = rest.split(/\s+/).filter(Boolean);
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const parsed = parseAddRest(resolved.rest);
	if ("error" in parsed) {
		ctx.ui.notify(parsed.error, "warning");
		return;
	}
	const { unitId, title, url, kind } = parsed;
	const resource = newResource(title, url, kind ?? undefined);

	if (unitId === null) {
		const updated: Track = {
			...resolved.track,
			resources: [...resolved.track.resources, resource],
		};
		await saveTrack(updated);
		ctx.ui.notify(`Track resource: ${resource.id} — "${title}"`, "info");
		return;
	}

	const units = resolved.track.material_graph.units.map((u) =>
		u.id === unitId ? { ...u, resources: [...(u.resources ?? []), resource] } : u,
	);
	if (!units.some((u) => u.id === unitId)) {
		ctx.ui.notify(`No unit matching "${unitId}".`, "warning");
		return;
	}
	const updated: Track = {
		...resolved.track,
		material_graph: { ...resolved.track.material_graph, units },
	};
	await saveTrack(updated);
	ctx.ui.notify(`Unit ${unitId} resource: ${resource.id} — "${title}"`, "info");
}

async function cmdRemove(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const resId = resolved.rest.trim();
	if (!resId) {
		ctx.ui.notify("No resource id given. /learn-resources remove <track> <id>", "warning");
		return;
	}

	const matchTrack = resolved.track.resources.find((r) => r.id === resId || r.id.endsWith(resId));
	if (matchTrack) {
		const updated: Track = {
			...resolved.track,
			resources: resolved.track.resources.filter((r) => r.id !== matchTrack.id),
		};
		await saveTrack(updated);
		ctx.ui.notify(`Removed track resource: ${matchTrack.id} — "${matchTrack.title}"`, "info");
		return;
	}

	let removed: Resource | null = null;
	const units = resolved.track.material_graph.units.map((u) => {
		const hit = (u.resources ?? []).find((r) => r.id === resId || r.id.endsWith(resId));
		if (hit) {
			removed = hit;
			return { ...u, resources: (u.resources ?? []).filter((r) => r.id !== hit.id) };
		}
		return u;
	});
	if (removed) {
		const updated: Track = {
			...resolved.track,
			material_graph: { ...resolved.track.material_graph, units },
		};
		await saveTrack(updated);
		ctx.ui.notify(`Removed unit resource: ${(removed as Resource).id} — "${(removed as Resource).title}"`, "info");
		return;
	}

	ctx.ui.notify(`No resource matching "${resId}".`, "warning");
}

async function cmdList(trackArg: string | undefined, ctx: ExtensionCommandContext, _includeResolved = false): Promise<void> {
	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;
	const lines: string[] = [];
	if (track.resources.length > 0) {
		lines.push("track-level:");
		for (const r of track.resources) {
			lines.push(`  ${r.id} [${r.kind ?? "other"}] ${r.title} — ${r.url}`);
		}
	}
	const unitsWithRes = track.material_graph.units.filter((u) => (u.resources ?? []).length > 0);
	if (unitsWithRes.length > 0) {
		lines.push("per-unit:");
		for (const u of unitsWithRes) {
			lines.push(`  ${u.id} (${u.status}) ${u.title}:`);
			for (const r of u.resources ?? []) {
				lines.push(`    ${r.id} [${r.kind ?? "other"}] ${r.title} — ${r.url}`);
			}
		}
	}
	if (lines.length === 0) {
		ctx.ui.notify(`No resources on ${track.label}.`, "info");
		return;
	}
	ctx.ui.notify(`${track.label} resources:\n${lines.join("\n")}`, "info");
}

async function resolveTrack(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (trackArg && await trackExists(trackArg)) return loadTrackOrThrow(trackArg);
	const active = await getActiveTrack();
	if (active) return active;
	ctx.ui.notify("No active track. Specify one: /learn-resources <track>", "warning");
	return null;
}
