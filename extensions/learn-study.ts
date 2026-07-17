/**
 * learn-study — scaffold a *study* track for any non-coding topic.
 *
 * Sibling to `/learn-scaffold`, not a replacement. `/learn-scaffold` emits a
 * project skeleton + a shell `verify_command` for programming tracks;
 * `/learn-study` emits a notes workspace + a self-assessment rubric for study
 * tracks (music, languages, history, math, science). Both write the same
 * `Track` record via `lib/track.ts`; both pre-seed a *suggested* edge that
 * `/learn-plan` surfaces for accept/revise/replace.
 *
 * Why a separate command, not a flag on `/learn-scaffold`: the two paths share
 * the Track model but diverge on what they emit (code skeleton vs. notes
 * workspace) and what "verify" means (compiler vs. rubric). Folding them into
 * one command would force every learner through a "programming or study?"
 * fork; keeping them separate keeps each command's help text honest about
 * what it does.
 *
 * Flow:
 *   1. Goal (free text: "music theory fundamentals", "conversational Spanish").
 *   2. Depth — fixed enum: appreciation / practitioner / mastery.
 *   3. Domain family — curated table (language / music / history / math / science).
 *   4. Source — optional, single capped webSearch round (scope-guarded, same
 *      cap as the programming wizard — "which textbook is best" is the classic
 *      study-track yak).
 *   5. Target dir + session length.
 *   6. Emit notes workspace (README + notes/ + one domain-named practice folder).
 *   7. Seed the Track: outcome_compass, material_graph.source + 3–5 sequenced
 *      units (this is the field's debut as load-bearing), suggested first edge
 *      + a rubric for that edge, depth, approach, track_kind="study".
 *      next_action stays the placeholder — `/learn-plan` owns the forethought.
 *   8. Hand off to /learn-plan (default) or /learn-start.
 *
 * Per DESIGN.md Fork B asterisk (extended): conversational-but-direct, not
 * socratic. `scope-guard` is active during the wizard.
 *
 * Command:
 *   /learn-study [topic] [dir]   e.g. /learn-study "music theory fundamentals"
 */

import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	APPROACHES,
	buildNotesWorkspace,
	buildRubric,
	buildStudyOutcomeCompass,
	buildStudySuggestedEdge,
	emitNotesWorkspace,
	listDomainFamilies,
	type Approach,
	type DomainFamily,
	type NotesContext,
} from "../lib/study-plan";
import { freshTrack, saveTrack, trackExists, type StudyDepth } from "../lib/track";
import { slugify, normalizeGoal } from "../lib/paths";
import { webSearch } from "../lib/web";

const DEPTH_OPTIONS: Array<{ value: StudyDepth; label: string }> = [
	{ value: "appreciation", label: "Appreciation — follow along, understand the shape of the field, no production" },
	{ value: "practitioner", label: "Practitioner — do the thing competently (play songs, hold conversations, explain it)" },
	{ value: "mastery", label: "Mastery — deep / original work (compose, fluent+idiomatic, synthesize an original argument)" },
];

export default function learnStudy(pi: ExtensionAPI) {
	pi.registerCommand("learn-study", {
		description: "Scaffold a study track (notes workspace + rubric) for any non-coding topic.",
		handler: async (args, ctx) => {
			await run(args, ctx, pi);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	// tokens: optional [topic...] [dir]. A trailing dir-looking token is the dir.
	const inlineDir = tokens.length > 0 && isDirish(tokens[tokens.length - 1]) ? tokens[tokens.length - 1] : "";
	const inlineTopic = tokens.length > 0 && !isDirish(tokens[tokens.length - 1]) ? tokens.join(" ") : "";

	// 1. Goal / topic
	let goal = inlineTopic.trim();
	if (!goal) {
		const ans = await ctx.ui.input("What do you want to learn?", "e.g. music theory fundamentals");
		if (!ans || !ans.trim()) { ctx.ui.notify("No goal given — wizard cancelled.", "warning"); return; }
		goal = ans.trim();
	}
	// Strip leading intent phrasings ("I want to learn X" → "X") so templated
	// outputs (compass, edge, label, search query) read naturally.
	goal = normalizeGoal(goal);

	// 2. Depth (fixed enum)
	const depthPick = await ctx.ui.select("How deep do you want to go?", DEPTH_OPTIONS.map((d) => d.label));
	if (!depthPick) { ctx.ui.notify("Wizard cancelled.", "warning"); return; }
	const depth = DEPTH_OPTIONS.find((d) => d.label === depthPick)!.value;

	// 3. Domain family (curated table)
	const families = listDomainFamilies();
	const familyPick = await ctx.ui.select(
		"Which domain family fits best?",
		families.map((k) => `${APPROACHES[k].label} — ${APPROACHES[k].blurb}`),
	);
	if (!familyPick) { ctx.ui.notify("Wizard cancelled.", "warning"); return; }
	const family = families.find((k) => familyPick.startsWith(APPROACHES[k].label))!;
	const approach: Approach = APPROACHES[family];

	// 4. Source — optional, capped single web-search round (scope-guarded).
	let source: string | undefined;
	const srcChoice = await ctx.ui.select("Primary source?", [
		"Skip — I'll add sources later",
		"Search the web for current best resources",
		"Enter a source manually (book / course / video)",
	]);
	if (srcChoice === "Search the web for current best resources") {
		try {
			const query = `best ${goal} ${approach.label} resource textbook course 2026`;
			const results = await webSearch(query, { count: 5 });
			if (results.length === 0) {
				ctx.ui.notify("Web search returned no results — proceeding without a source pick.", "info");
			} else {
				const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n");
				ctx.ui.notify(`Top results for "${query}":\n${lines}\n\nUse these to pick a source (next prompt).`, "info");
			}
		} catch (err) {
			ctx.ui.notify(`Web search failed: ${(err as Error).message}. Proceeding without it.`, "warning");
		}
		const entered = await ctx.ui.input("Primary source to anchor on (leave blank to skip):", "e.g. 'Tonal Harmony, Kostka/Payne'");
		if (entered && entered.trim()) source = entered.trim();
	} else if (srcChoice === "Enter a source manually (book / course / video)") {
		const entered = await ctx.ui.input("Primary source to anchor on (leave blank to skip):", "e.g. 'Tonal Harmony, Kostka/Payne'");
		if (entered && entered.trim()) source = entered.trim();
	}

	// 5. Target dir + session length
	const defaultDir = slugify(goal);
	const dirArg = inlineDir || (await ctx.ui.input("Target directory for notes workspace:", `~/gitrepos/${defaultDir}-notes`));
	const targetDir = resolveTargetDir(dirArg, `${defaultDir}-notes`);
	if (existsSync(targetDir)) {
		const ok = await ctx.ui.confirm(
			"Target dir exists",
			`${targetDir} already exists. Scaffold into it anyway? (Existing files may be overwritten.)`,
		);
		if (!ok) return;
	}
	const sessionAns = await ctx.ui.input("Session length (minutes):", String(approach.defaultSessionMin));
	const sessionMin = Number.parseInt(sessionAns ?? String(approach.defaultSessionMin), 10);
	const session = Number.isFinite(sessionMin) && sessionMin > 0 ? sessionMin : approach.defaultSessionMin;

	// 6. Track id + existence check
	const trackId = slugify(goal);
	if (await trackExists(trackId)) {
		const ok = await ctx.ui.confirm(
			"Track exists",
			`A track "${trackId}" already exists. Overwrite its record with the study-scaffolded one?`,
		);
		if (!ok) return;
	}

	// 7. Emit notes workspace.
	const notesCtx: NotesContext = { topic: goal, goal, depth, approach, source };
	ctx.ui.setStatus("learn-study", "Emitting notes workspace…");
	let written: string[];
	try {
		await mkdir(targetDir, { recursive: true });
		written = await emitNotesWorkspace(buildNotesWorkspace(notesCtx), targetDir);
	} catch (err) {
		ctx.ui.setStatus("learn-study", undefined);
		ctx.ui.notify(`Failed to emit notes workspace: ${(err as Error).message}`, "error");
		return;
	}
	ctx.ui.setStatus("learn-study", undefined);

	// 8. Seed the Track.
	const compass = buildStudyOutcomeCompass({ goal, depth, approach, source });
	const suggestedEdge = buildStudySuggestedEdge({ goal, depth, approach });
	const rubric = buildRubric(family as DomainFamily, suggestedEdge);
	const units = approach.sequenceUnits(goal, depth);
	const track = freshTrack({
		id: trackId,
		label: goal,
		outcome_compass: compass,
		work_dir: targetDir,
		verify_command: null, // study tracks verify via the rubric in /learn-reflect, not a shell command
		track_kind: "study",
		study_depth: depth,
		domain_family: family as DomainFamily,
		approach: approach.approach,
		material_graph: { source: source ?? null, units, revised_at: new Date().toISOString() },
		edge: { statement: suggestedEdge, set_at: new Date().toISOString(), sessions_at_edge: 0 },
		edge_suggested: true,
		rubric,
		process_contract: { cue: null, session_min: session, reward: "log + 5min decompression" },
	});
	await saveTrack(track);
	ctx.ui.notify(
		`Scaffolded study track "${track.label}" → ${targetDir}\n` +
		`${written.length} files written, ${units.length} units seeded.\n` +
		`Suggested edge: "${suggestedEdge}"\n` +
		`Run /learn-plan to accept, revise, or replace the edge (and set next_action), then /learn-start.`,
		"info",
	);

	// 9. Hand off — default to /learn-plan so the learner owns the forethought step.
	const choice = await ctx.ui.select("Next step:", [
		"Accept / revise the suggested edge now (/learn-plan)",
		"Start a session now (/learn-start)",
	]);
	if (choice === "Start a session now (/learn-start)") {
		pi.sendUserMessage(`/learn-start ${track.id}`);
	} else {
		pi.sendUserMessage(`/learn-plan ${track.id}`);
	}
}

function isDirish(tok: string): boolean {
	return tok.startsWith("~") || tok.startsWith("/") || tok.startsWith("./") || /^[A-Za-z]:[\\/]/.test(tok);
}

function resolveTargetDir(arg: string | undefined, defaultDirName: string): string {
	if (!arg || !arg.trim()) return join(homedir(), "gitrepos", defaultDirName);
	return resolve(arg.replace(/^~/, homedir()));
}
