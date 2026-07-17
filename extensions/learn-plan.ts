/**
 * learn-plan — forethought (mechanism #2/#7). Replaces socrates-plan.
 *
 * Sets and revises the Track's plan fields: edge, next_action, outcome_compass,
 * verify_command, session_min, and manual material_graph units (the ingestion
 * stub — /learn-ingest auto-decomposition is v1.1; for now units are entered
 * by hand and sequenced against the edge here).
 *
 * Socratic is OFF for this command (per DESIGN.md Fork B — management, not
 * learning interaction). Direct answers, not questions.
 *
 * Commands:
 *   /learn-plan [track]                     Show plan + open a menu
 *   /learn-plan edge [track] <statement>    Set the current edge
 *   /learn-plan next [track] <action>       Set the next concrete action
 *   /learn-plan compass [track] <text>      Revise the outcome compass
 *   /learn-plan verify [track] <cmd>        Set the verify command
 *   /learn-plan session [track] <min>       Set session length (minutes)
 *   /learn-plan unit [track] add <title>    Add a material unit (manual ingestion)
 *   /learn-plan unit [track] list           List material units
 *
 * If [track] is omitted, uses the active track.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getActiveTrack,
	loadTrackOrThrow,
	newUnit,
	saveTrack,
	trackExists,
	trackKind,
	type Track,
} from "../lib/track";
import { buildRubric } from "../lib/study-plan";

export default function learnPlan(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-plan", {
		description: "Plan-mode: set edge, next action, compass, verify, session length, or material units.",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "show";

	if (sub === "show") {
		await cmdShow(tokens[1], ctx);
		return;
	}
	if (sub === "edge") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			if (!rest) { ctx.ui.notify("No edge statement given.", "warning"); return; }
			const now = new Date().toISOString();
			let updated: Track = {
				...track,
				edge: { statement: rest, set_at: now, sessions_at_edge: 0 },
				edge_suggested: false, // learner has now owned the edge
			};
			// Study tracks: regenerate the rubric for the new edge (the rubric
			// is the study-track analog of verify_command — it must track the edge).
			if (trackKind(track) === "study" && track.domain_family) {
				updated = { ...updated, rubric: buildRubric(track.domain_family, rest) };
			}
			const saved = await maybePromptNextAction(updated, ctx);
			await saveTrack(saved);
			ctx.ui.notify(`Edge set: "${rest}"`, "info");
		});
		return;
	}
	if (sub === "next") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			if (!rest) { ctx.ui.notify("No next action given (cannot be empty — rule 1).", "warning"); return; }
			const updated: Track = { ...track, next_action: rest, next_action_set_at: new Date().toISOString() };
			await saveTrack(updated);
			ctx.ui.notify(`Next action set: "${rest}"`, "info");
		});
		return;
	}
	if (sub === "compass") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			if (!rest) { ctx.ui.notify("No compass text given.", "warning"); return; }
			const updated: Track = { ...track, outcome_compass: rest, outcome_compass_revised_at: new Date().toISOString() };
			await saveTrack(updated);
			ctx.ui.notify(`Outcome compass revised: "${rest}"`, "info");
		});
		return;
	}
	if (sub === "verify") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			const updated: Track = { ...track, verify_command: rest || null };
			await saveTrack(updated);
			ctx.ui.notify(`Verify command set: ${rest || "(cleared)"}`, "info");
		});
		return;
	}
	if (sub === "session") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			const n = Number.parseInt(rest, 10);
			if (!Number.isFinite(n) || n <= 0) { ctx.ui.notify(`Invalid minutes "${rest}".`, "warning"); return; }
			const updated: Track = { ...track, process_contract: { ...track.process_contract, session_min: n } };
			await saveTrack(updated);
			ctx.ui.notify(`Session length set: ${n}m`, "info");
		});
		return;
	}
	if (sub === "unit") {
		await cmdUnit(tokens.slice(1), ctx);
		return;
	}
	if (sub === "ingest") {
		ctx.ui.notify(
			"/learn-ingest (auto material decomposition) is a v1.1 feature. For now, add units manually: /learn-plan unit add <title>.",
			"info",
		);
		return;
	}
	ctx.ui.notify(`Unknown subcommand "${sub}". Try: show, edge, next, compass, verify, session, unit, ingest`, "warning");
}

async function cmdShow(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
	const track = await resolveTrack(trackArg, ctx);
	if (!track) return;
	const suggested = track.edge_suggested === true;
	const isStudy = trackKind(track) === "study";
	const lines = [
		`${track.label} (${track.id})${isStudy ? "  [study]" : ""}`,
		`compass: ${track.outcome_compass || "(unset)"}`,
	];
	if (isStudy && track.study_depth) {
		lines.push(`depth:   ${track.study_depth}${track.domain_family ? `  family: ${track.domain_family}` : ""}`);
	} else if (track.depth) {
		lines.push(`depth:   ${track.depth}${track.recommended_stack?.length ? `  stack: ${track.recommended_stack.join(" + ")}` : ""}`);
	}
	lines.push(
		`edge:    ${track.edge.statement}${suggested ? "  ⚠ wizard suggestion — run /learn-plan edge <track> <statement> to accept or replace" : ""}`,
		`next:    ${track.next_action}`,
		`verify:  ${isStudy ? "(rubric — surfaced in /learn-reflect)" : (track.verify_command ?? "(unset)")}`,
		`session: ${track.process_contract.session_min}m  cue: ${track.process_contract.cue ? "set" : "(none — /learn-cue set)"}`,
		`units:   ${track.material_graph.units.length}  yaks: ${track.deferred_yaks.filter((y) => !y.resolved).length} open`,
		`stall:   ${track.stall_counter}`,
	);
	if (isStudy && track.rubric?.length) {
		lines.push(`rubric:  ${track.rubric.length} questions (answered in /learn-reflect)`);
	}
	ctx.ui.notify(lines.join("\n"), "info");
}

const NEXT_ACTION_PLACEHOLDER = "(not set — run /learn-plan to set the next concrete action)";

/**
 * If next_action is still the placeholder, prompt the learner for it now.
 * Returns the (possibly updated) track. Caller persists.
 */
async function maybePromptNextAction(track: Track, ctx: ExtensionCommandContext): Promise<Track> {
	if (track.next_action !== NEXT_ACTION_PLACEHOLDER) return track;
	const ans = await ctx.ui.input(
		"Next concrete action for this edge (one small first move):",
		"e.g. open src/main.rs and declare the vertex buffer layout struct",
	);
	if (!ans || !ans.trim()) return track;
	return { ...track, next_action: ans.trim(), next_action_set_at: new Date().toISOString() };
}

async function cmdUnit(tokens: string[], ctx: ExtensionCommandContext): Promise<void> {
	const sub = tokens[0] ?? "list";
	if (sub === "list") {
		const track = await resolveTrack(tokens[1], ctx);
		if (!track) return;
		const units = track.material_graph.units;
		if (units.length === 0) {
			ctx.ui.notify("No material units. Add one: /learn-plan unit add <title>", "info");
			return;
		}
		const lines = units.map((u) => `[${u.status}] ${u.id} (${u.difficulty}) ${u.title}`);
		ctx.ui.notify(`${track.label} units:\n${lines.join("\n")}`, "info");
		return;
	}
	if (sub === "add") {
		await withTrackAndRest(tokens.slice(1), ctx, async (track, rest) => {
			if (!rest) { ctx.ui.notify("No unit title given.", "warning"); return; }
			const unit = newUnit(rest);
			const updated: Track = {
				...track,
				material_graph: {
					...track.material_graph,
					units: [...track.material_graph.units, unit],
					revised_at: new Date().toISOString(),
				},
			};
			await saveTrack(updated);
			ctx.ui.notify(`Added unit: ${unit.id} — "${rest}" (manual ingestion stub)`, "info");
		});
		return;
	}
	ctx.ui.notify(`Unknown unit subcommand "${sub}". Try: add, list`, "warning");
}

async function withTrackAndRest(
	tokens: string[],
	ctx: ExtensionCommandContext,
	fn: (track: Track, rest: string) => Promise<void>,
): Promise<void> {
	if (tokens[0] && await trackExists(tokens[0])) {
		const track = await loadTrackOrThrow(tokens[0]);
		await fn(track, tokens.slice(1).join(" ").trim());
		return;
	}
	const active = await getActiveTrack();
	if (active) {
		await fn(active, tokens.join(" ").trim());
		return;
	}
	ctx.ui.notify("No active track. Specify one: /learn-plan <sub> <track> <rest>", "warning");
}

async function resolveTrack(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
	if (trackArg && await trackExists(trackArg)) return loadTrackOrThrow(trackArg);
	const active = await getActiveTrack();
	if (active) return active;
	ctx.ui.notify("No active track. Specify one: /learn-plan <track>", "warning");
	return null;
}
