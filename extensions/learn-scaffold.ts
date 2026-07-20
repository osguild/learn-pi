/**
 * learn-scaffold — generate a project + Track in one step. v1's big feature.
 *
 * Implements DESIGN.md mechanism #6 Mode B: when setup is required-but-painful
 * (WebGPU env, ML toolchain, etc.) and has no good tutorial, the package
 * generates the scaffolding itself instead of leaving the learner to fight it.
 *
 * Flow:
 *   1. ensureBuiltinRecipes() — seeds webgpu-rust if absent.
 *   2. Resolve recipe (arg > pick from available).
 *   3. Resolve target dir (arg > default_dir_name under ~/gitrepos).
 *   4. Resolve variables (manifest defaults, learner may override PROJECT_NAME etc.)
 *   5. emitSkeleton() into target dir; runPostCreate() in it.
 *   6. Create a fresh Track with work_dir → target dir, verify_command from manifest,
 *      outcome_compass from template. Save it.
 *   7. Hand off to /learn-start by emitting the same kickoff path.
 *
 * Command:
 *   /learn-scaffold <recipe> [dir]   e.g. /learn-scaffold webgpu-rust ~/gitrepos/rust-webgpu
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	ensureBuiltinRecipes,
	emitSkeleton,
	listRecipes,
	loadManifest,
	resolveVariables,
	runPostCreate,
	substitute,
	type ScaffoldManifest,
	buildOutcomeCompass,
	buildSuggestedEdge,
	emitGenericSkeleton,
	listLanguages,
	runGenericPostCreate,
	LANGUAGE_SKELETONS,
	type Depth,
} from "../lib/scaffold";
import { freshTrack, saveTrack, trackExists, type Track } from "../lib/track";
import { collectTrackOverview } from "../lib/track-overview";
import { slugify, normalizeGoal } from "../lib/paths";
import { webSearch } from "../lib/web";

export default function learnScaffold(pi: ExtensionAPI) {
	pi.registerCommand("learn-scaffold", {
		description: "Scaffold a new project + learning track. /learn-scaffold [generic] <recipe|goal> [dir].",
		handler: async (args, ctx) => {
			await run(args, ctx, pi);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	await ensureBuiltinRecipes();
	const tokens = args.trim().split(/\s+/).filter(Boolean);

	// Generic wizard path: no arg, or first arg is "generic".
	if (tokens.length === 0 || tokens[0] === "generic") {
		await runGeneric(tokens.slice(1), ctx, pi);
		return;
	}
	await runRecipe(tokens, ctx, pi);
}

async function runRecipe(tokens: string[], ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const recipeName = await resolveRecipe(tokens[0], ctx);
	if (!recipeName) return;
	const manifest = await loadManifest(recipeName);
	if (!manifest) {
		ctx.ui.notify(`Recipe "${recipeName}" has no manifest.json.`, "error");
		return;
	}

	const targetDir = resolveTargetDir(tokens[1], manifest);
	if (existsSync(targetDir)) {
		const ok = await ctx.ui.confirm(
			"Target dir exists",
			`${targetDir} already exists. Scaffold into it anyway? (Existing files may be overwritten.)`,
		);
		if (!ok) return;
	}

	const vars = await resolveVariablesWithPrompts(manifest, ctx);
	const overview = await collectTrackOverview(ctx, {
		goal: substitute(manifest.label, vars),
		stack: [substitute(manifest.label, vars)],
	});
	const trackId = manifest.track_id ?? slugify(manifest.label);
	if (await trackExists(trackId)) {
		const ok = await ctx.ui.confirm(
			"Track exists",
			`A track "${trackId}" already exists. Overwrite its record with the scaffolded one?`,
		);
		if (!ok) return;
	}

	ctx.ui.setStatus("learn-scaffold", "Emitting skeleton…");
	let written: string[];
	try {
		await mkdir(targetDir, { recursive: true });
		written = await emitSkeleton(recipeName, targetDir, vars);
	} catch (err) {
		ctx.ui.setStatus("learn-scaffold", undefined);
		ctx.ui.notify(`Failed to emit skeleton: ${(err as Error).message}`, "error");
		return;
	}

	ctx.ui.setStatus("learn-scaffold", "Running post-create commands…");
	try {
		runPostCreate(manifest, targetDir, vars);
	} catch (err) {
		ctx.ui.setStatus("learn-scaffold", undefined);
		ctx.ui.notify(
			`Post-create command failed: ${(err as Error).message}. Skeleton emitted; fix manually or re-run.`,
			"warning",
		);
	}
	ctx.ui.setStatus("learn-scaffold", undefined);

	const track = freshTrack({
		id: trackId,
		label: substitute(manifest.label, vars),
		outcome_compass: substitute(manifest.outcome_compass_template, vars),
		overview,
		work_dir: targetDir,
		verify_command: substitute(manifest.verify_command, vars),
		process_contract: {
			cue: null,
			session_min: manifest.default_session_min ?? 45,
			reward: "log + 5min decompression",
		},
	});
	await saveTrack(track);
	ctx.ui.notify(
		`Scaffolded ${track.label} → ${targetDir}\n${written.length} files written. Run /learn-plan to set the first edge + next action, then /learn-start.`,
		"info",
	);

	// Offer to set the edge immediately via /learn-plan, or hand off to start.
	const choice = await ctx.ui.select("Next step:", [
		"Set edge + next action now (/learn-plan)",
		"Start a session now (/learn-start)",
	]);
	if (choice === "Start a session now (/learn-start)") {
		pi.sendUserMessage(`/learn-start ${track.id}`);
	} else if (choice === "Set edge + next action now (/learn-plan)") {
		pi.sendUserMessage(`/learn-plan ${track.id}`);
	}
}

async function resolveRecipe(arg: string | undefined, ctx: ExtensionCommandContext): Promise<string | null> {
	const recipes = await listRecipes();
	if (recipes.length === 0) {
		ctx.ui.notify("No scaffold recipes found (and built-in seeding failed).", "error");
		return null;
	}
	if (arg && recipes.includes(arg)) return arg;
	if (arg) {
		ctx.ui.notify(`Recipe "${arg}" not found.`, "warning");
	}
	const choice = await ctx.ui.select("Pick a recipe:", recipes);
	return choice ?? null;
}

function resolveTargetDir(arg: string | undefined, manifest: ScaffoldManifest): string {
	if (arg) return resolve(arg.replace(/^~/, homedir()));
	return join(homedir(), "gitrepos", manifest.default_dir_name);
}

async function resolveVariablesWithPrompts(
	manifest: ScaffoldManifest,
	ctx: ExtensionCommandContext,
): Promise<Record<string, string>> {
	const overrides: Record<string, string> = {};
	for (const v of manifest.variables) {
		const ans = await ctx.ui.input(`${v.name} [${v.description ?? "variable"}]:`, v.default);
		if (ans !== undefined) overrides[v.name] = ans;
	}
	return resolveVariables(manifest, overrides);
}

// Reference Track to keep the type import meaningful for future per-recipe track shaping.
void ({} as Track);

// --- Generic wizard (open-ended goal) ---------------------------------------

const DEPTH_OPTIONS: Array<{ value: Depth; label: string; hint: string }> = [
	{ value: "guided", label: "Guided — frameworks do the work; I study the concepts", hint: "guided" },
	{ value: "standard", label: "Standard — use frameworks, understand their internals", hint: "standard" },
	{ value: "from-scratch", label: "From-scratch — build the primitive myself, no high-level lib", hint: "from-scratch" },
];

async function runGeneric(tokens: string[], ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	// tokens: optional [goal...] [dir]. If the learner passed a goal inline, use it.
	const inlineGoal = tokens.length > 0 && !isDirish(tokens[tokens.length - 1]) ? tokens.join(" ") : "";
	const inlineDir = tokens.length > 0 && isDirish(tokens[tokens.length - 1]) ? tokens[tokens.length - 1] : "";

	// 1. Goal
	let goal = inlineGoal.trim();
	if (!goal) {
		const ans = await ctx.ui.input("What do you want to learn?", "e.g. machine learning fundamentals");
		if (!ans || !ans.trim()) { ctx.ui.notify("No goal given — wizard cancelled.", "warning"); return; }
		goal = ans.trim();
	}
	// Strip leading intent phrasings ("I want to learn X" → "X") so templated
	// outputs (compass, edge, label, search query) read naturally.
	goal = normalizeGoal(goal);

	// 2. Depth (fixed enum)
	const depthPick = await ctx.ui.select(
		"How deep do you want to go?",
		DEPTH_OPTIONS.map((d) => d.label),
	);
	if (!depthPick) { ctx.ui.notify("Wizard cancelled.", "warning"); return; }
	const depth = DEPTH_OPTIONS.find((d) => d.label === depthPick)!.value;

	// 3. Language (curated table)
	const langs = listLanguages();
	const langPick = await ctx.ui.select(
		"Pick a language to scaffold:",
		langs.map((k) => LANGUAGE_SKELETONS[k].label),
	);
	if (!langPick) { ctx.ui.notify("Wizard cancelled.", "warning"); return; }
	const language = langs.find((k) => LANGUAGE_SKELETONS[k].label === langPick)!;
	const skel = LANGUAGE_SKELETONS[language];

	// 4. Framework — optional, capped single web-search round (scope-guarded).
	let framework: string | undefined;
	const fwChoice = await ctx.ui.select("Framework recommendation?", [
		"Skip — no framework for now",
		"Search the web for current recommendations",
		"Enter a framework manually",
	]);
	if (fwChoice === "Search the web for current recommendations") {
		try {
			const query = `${goal} ${skel.label} framework ${depth} best 2026`;
			const results = await webSearch(query, { count: 5 });
			if (results.length === 0) {
				ctx.ui.notify("Web search returned no results — proceeding without a framework pick.", "info");
			} else {
				const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n");
				ctx.ui.notify(`Top results for "${query}":\n${lines}\n\nUse these to pick a framework (next prompt).`, "info");
			}
		} catch (err) {
			ctx.ui.notify(`Web search failed: ${(err as Error).message}. Proceeding without it.`, "warning");
		}
		const entered = await ctx.ui.input("Framework to scaffold with (leave blank to skip):", "e.g. pytorch");
		if (entered && entered.trim()) framework = entered.trim();
	} else if (fwChoice === "Enter a framework manually") {
		const entered = await ctx.ui.input("Framework to scaffold with (leave blank to skip):", "e.g. pytorch");
		if (entered && entered.trim()) framework = entered.trim();
	}

	const overview = await collectTrackOverview(ctx, {
		goal,
		depth,
		stack: framework ? [language, framework] : [language],
	});

	// 5. Target dir + session length
	const defaultDir = slugify(goal);
	const dirArg = inlineDir || (await ctx.ui.input("Target directory:", `~/gitrepos/${defaultDir}`));
	const targetDir = resolveTargetDirGeneric(dirArg, defaultDir);
	if (existsSync(targetDir)) {
		const ok = await ctx.ui.confirm(
			"Target dir exists",
			`${targetDir} already exists. Scaffold into it anyway? (Existing files may be overwritten.)`,
		);
		if (!ok) return;
	}
	const sessionAns = await ctx.ui.input("Session length (minutes):", String(skel.defaultSessionMin));
	const sessionMin = Number.parseInt(sessionAns ?? String(skel.defaultSessionMin), 10);
	const session = Number.isFinite(sessionMin) && sessionMin > 0 ? sessionMin : skel.defaultSessionMin;

	// 6. Track id + existence check
	const trackId = slugify(goal);
	if (await trackExists(trackId)) {
		const ok = await ctx.ui.confirm(
			"Track exists",
			`A track "${trackId}" already exists. Overwrite its record with the scaffolded one?`,
		);
		if (!ok) return;
	}

	// 7. Emit skeleton + run post-create (best effort).
	const projectName = slugify(goal).replace(/-/g, "_") || "learn";
	const sctx = { projectName, goal, depth, framework };
	ctx.ui.setStatus("learn-scaffold", "Emitting skeleton…");
	let written: string[];
	try {
		await mkdir(targetDir, { recursive: true });
		written = await emitGenericSkeleton(skel.files(sctx), targetDir);
	} catch (err) {
		ctx.ui.setStatus("learn-scaffold", undefined);
		ctx.ui.notify(`Failed to emit skeleton: ${(err as Error).message}`, "error");
		return;
	}
	ctx.ui.setStatus("learn-scaffold", "Running post-create commands…");
	const warnings = runGenericPostCreate(skel.postCreate(sctx), targetDir);
	ctx.ui.setStatus("learn-scaffold", undefined);
	if (warnings.length > 0) {
		ctx.ui.notify(`Post-create warnings (non-fatal):\n${warnings.join("\n")}`, "warning");
	}

	// 8. Build the Track with pre-seeded compass + suggested edge (not yet accepted).
	const compass = buildOutcomeCompass({ goal, depth, language, framework });
	const suggestedEdge = buildSuggestedEdge({ goal, depth, language, framework });
	const track = freshTrack({
		id: trackId,
		label: goal,
		outcome_compass: compass,
		overview,
		work_dir: targetDir,
		verify_command: skel.verifyCommand(sctx),
		depth,
		recommended_stack: framework ? [language, framework] : [language],
		edge: { statement: suggestedEdge, set_at: new Date().toISOString(), sessions_at_edge: 0 },
		edge_suggested: true,
		process_contract: { cue: null, session_min: session, reward: "log + 5min decompression" },
	});
	await saveTrack(track);
	ctx.ui.notify(
		`Scaffolded ${track.label} → ${targetDir}\n${written.length} files written.\n` +
		`Suggested edge: "${suggestedEdge}"\nRun /learn-plan to accept, revise, or replace it, then /learn-start.`,
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

function resolveTargetDirGeneric(arg: string | undefined, defaultDirName: string): string {
	if (!arg || !arg.trim()) return join(homedir(), "gitrepos", defaultDirName);
	return resolve(arg.replace(/^~/, homedir()));
}
