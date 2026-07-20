/**
 * learn-glossary — track-wide technical terms from course documentation.
 *
 * Each entry stores a term and its definition, optionally linked to a source
 * doc and/or a material unit. Lives on the Track record (single source of truth).
 *
 * Commands:
 *   /learn-glossary [track]                              List all terms (A→Z)
 *   /learn-glossary add [track] <term> | <definition>    Add an entry
 *       [--source=<url>] [--unit=<unit-id>]
 *   /learn-glossary update [track] <id> [--term=] [--definition=] [--source=] [--unit=]
 *   /learn-glossary remove [track] <id>                  Remove an entry
 *   /learn-glossary scan [track] [--dry-run]             Extract terms from unit-guide markdown
 *
 * The `<term> | <definition>` pair is split on the first `|`.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mergeScannedGlossary, scanTrackGlossaryCandidates } from "../lib/glossary-scan";
import {
	addGlossaryEntry,
	getActiveTrack,
	loadTrackOrThrow,
	removeGlossaryEntry,
	saveTrack,
	trackExists,
	updateGlossaryEntry,
	type GlossaryEntry,
	type Track,
} from "../lib/track";

export default function learnGlossary(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-glossary", {
		description: "Track glossary: /learn-glossary [list|add|update|remove|scan] [track] …",
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
	if (sub === "update") {
		await cmdUpdate(tokens.slice(1), ctx);
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
	if (sub === "scan") {
		await cmdScan(tokens.slice(1), ctx);
		return;
	}
	if (await trackExists(sub)) {
		await cmdList(sub, ctx);
		return;
	}
	await cmdAdd(args, ctx);
}

async function resolveTrackAndRest(
	trackArg: string | undefined,
	rest: string,
	ctx: ExtensionCommandContext,
): Promise<{ track: Track; rest: string } | null> {
	if (trackArg && (await trackExists(trackArg))) {
		return { track: await loadTrackOrThrow(trackArg), rest };
	}
	const active = await getActiveTrack();
	if (active) return { track: active, rest: `${trackArg ?? ""} ${rest}`.trim() };
	ctx.ui.notify("No active track. Specify one: /learn-glossary add <track> <term> | <definition>", "warning");
	return null;
}

function parseFlags(tokens: string[]): { flags: Record<string, string>; positional: string[] } {
	const flags: Record<string, string> = {};
	const positional: string[] = [];
	for (const tok of tokens) {
		if (tok.startsWith("--") && tok.includes("=")) {
			const eq = tok.indexOf("=");
			flags[tok.slice(2, eq)] = tok.slice(eq + 1);
			continue;
		}
		positional.push(tok);
	}
	return { flags, positional };
}

function parseTermDefinition(joined: string): { term: string; definition: string } | { error: string } {
	const pipeIdx = joined.indexOf("|");
	if (pipeIdx === -1) {
		return { error: "Missing `|` separator. Format: <term> | <definition>" };
	}
	const term = joined.slice(0, pipeIdx).trim().replace(/^"|"$/g, "");
	const definition = joined.slice(pipeIdx + 1).trim().replace(/^"|"$/g, "");
	if (!term) return { error: "Term is empty." };
	if (!definition) return { error: "Definition is empty." };
	return { term, definition };
}

async function cmdAdd(rest: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = rest.split(/\s+/).filter(Boolean);
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const { flags, positional } = parseFlags(resolved.rest.split(/\s+/).filter(Boolean));
	const parsed = parseTermDefinition(positional.join(" "));
	if ("error" in parsed) {
		ctx.ui.notify(parsed.error, "warning");
		return;
	}
	const now = new Date().toISOString();
	const updated = addGlossaryEntry(resolved.track, parsed.term, parsed.definition, now, {
		source: flags.source,
		unit_id: flags.unit,
	});
	const entry = updated.glossary[updated.glossary.length - 1];
	await saveTrack(updated);
	ctx.ui.notify(`Glossary: ${entry.id} — "${parsed.term}"`, "info");
}

async function cmdUpdate(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const parts = resolved.rest.split(/\s+/).filter(Boolean);
	const { flags, positional } = parseFlags(parts);
	const entryId = positional[0];
	if (!entryId) {
		ctx.ui.notify("No entry id. /learn-glossary update [track] <id> [--term=] [--definition=]", "warning");
		return;
	}
	const patch: Partial<Pick<GlossaryEntry, "term" | "definition" | "source" | "unit_id">> = {};
	if (flags.term !== undefined) patch.term = flags.term;
	if (flags.definition !== undefined) patch.definition = flags.definition;
	if (flags.source !== undefined) patch.source = flags.source;
	if (flags.unit !== undefined) patch.unit_id = flags.unit;
	if (Object.keys(patch).length === 0) {
		ctx.ui.notify("Nothing to update. Pass --term=, --definition=, --source=, or --unit=.", "warning");
		return;
	}
	const now = new Date().toISOString();
	const updated = updateGlossaryEntry(resolved.track, entryId, patch, now);
	await saveTrack(updated);
	ctx.ui.notify(`Updated glossary entry ${entryId}.`, "info");
}

async function cmdRemove(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const resolved = await resolveTrackAndRest(tokens[0], tokens.slice(1).join(" "), ctx);
	if (!resolved) return;
	const entryId = resolved.rest.trim();
	if (!entryId) {
		ctx.ui.notify("No entry id. /learn-glossary remove [track] <id>", "warning");
		return;
	}
	const glossary = resolved.track.glossary ?? [];
	const hit = glossary.find((e) => e.id === entryId || e.id.endsWith(entryId));
	if (!hit) {
		ctx.ui.notify(`No glossary entry matching "${entryId}".`, "warning");
		return;
	}
	const updated = removeGlossaryEntry(resolved.track, hit.id);
	await saveTrack(updated);
	ctx.ui.notify(`Removed glossary entry: ${hit.id} — "${hit.term}"`, "info");
}

async function cmdScan(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const dryRun = tokens.includes("--dry-run");
	const trackArg = tokens.find((t) => !t.startsWith("--"));
	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;

	const candidates = await scanTrackGlossaryCandidates(track);
	if (candidates.length === 0) {
		ctx.ui.notify(`No glossary terms found in markdown resources on ${track.label}.`, "info");
		return;
	}

	if (dryRun) {
		const preview = candidates.slice(0, 12).map((c) => `  ${c.term}: ${c.definition.slice(0, 80)}${c.definition.length > 80 ? "…" : ""}`);
		const more = candidates.length > 12 ? `\n  … and ${candidates.length - 12} more` : "";
		ctx.ui.notify(
			`Scan preview (${candidates.length} terms from unit guides):\n${preview.join("\n")}${more}`,
			"info",
		);
		return;
	}

	const now = new Date().toISOString();
	const result = mergeScannedGlossary(track, candidates, now);
	if (result.added.length === 0) {
		ctx.ui.notify(
			`Scan found ${candidates.length} terms; all already in glossary (${result.scanned_resources} resources scanned).`,
			"info",
		);
		return;
	}
	await saveTrack(result.track);
	ctx.ui.notify(
		`Glossary scan: added ${result.added.length} terms (${result.skipped.length} skipped, ${result.scanned_resources} resources).`,
		"info",
	);
}

async function cmdList(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;
	const entries = [...(track.glossary ?? [])].sort((a, b) => a.term.localeCompare(b.term));
	if (entries.length === 0) {
		ctx.ui.notify(`No glossary entries on ${track.label}.`, "info");
		return;
	}
	const lines = entries.map((e) => {
		const scope = e.unit_id ? ` [unit:${e.unit_id}]` : "";
		const src = e.source ? ` (${e.source})` : "";
		return `  ${e.id}${scope} ${e.term}: ${e.definition}${src}`;
	});
	ctx.ui.notify(`${track.label} glossary (${entries.length}):\n${lines.join("\n")}`, "info");
}

async function resolveTrack(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (trackArg && (await trackExists(trackArg))) return loadTrackOrThrow(trackArg);
	const active = await getActiveTrack();
	if (active) return active;
	ctx.ui.notify("No active track. Specify one: /learn-glossary <track>", "warning");
	return null;
}
