/**
 * learn-migrate — one-shot migration from the socrates-* proto to Track records.
 *
 * Reads the proto's scattered state (.pi/learner.json + .pi/plans/<track>.md in
 * a socratic-playground repo) and emits one Track JSON per track into
 * ~/.pi/learn/tracks/. Idempotent — refuses to overwrite an existing Track
 * unless the learner confirms.
 *
 * The proto's plan.md format is freeform markdown; this migration does a
 * best-effort extraction and leaves edge/next_action as honest placeholders
 * pointing to /learn-plan if nothing parseable is found. The hard guarantee:
 * track id, label, session length, and work_dir are carried forward.
 *
 * Command:
 *   /learn-migrate [path]   Default path: ~/gitrepos/socratic-playground
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { freshTrack, saveTrack, trackExists } from "../lib/track";

interface ProtoLearnerState {
	track?: string;
	current_focus?: string;
	session_length_min?: number;
	energy?: string;
	updated_at?: string;
}

const PROTO_TRACK_DIRS: Record<string, string> = {
	"rust-rag-learn": "rust-rag-learn",
	"rust-webgpu": "rust-webgpu",
	"c": "c",
};

const TRACK_LABELS: Record<string, string> = {
	"rust-rag-learn": "Rust RAG Learn",
	"rust-webgpu": "Rust WebGPU",
	"c": "C",
};

const DEFAULT_SESSION_MIN = 25;

export default function learnMigrate(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-migrate", {
		description: "One-shot migration from socrates-* proto state to Track records.",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const repoPath = resolve((args.trim() || join(homedir(), "gitrepos", "socratic-playground")).replace(/^~/, homedir()));
	const learnerPath = join(repoPath, ".pi", "learner.json");
	const plansDir = join(repoPath, ".pi", "plans");

	if (!existsSync(learnerPath)) {
		ctx.ui.notify(`No .pi/learner.json found at ${learnerPath}. Is this a socratic-playground repo?`, "warning");
		return;
	}

	const learner = readProtoLearner(learnerPath);
	const planIds = listPlanIds(plansDir);
	const candidateIds = new Set<string>([
		...(learner.track ? [learner.track] : []),
		...planIds,
		...Object.keys(PROTO_TRACK_DIRS),
	]);

	if (candidateIds.size === 0) {
		ctx.ui.notify("Nothing to migrate — no tracks in learner.json or .pi/plans/.", "info");
		return;
	}

	let migrated = 0;
	for (const id of candidateIds) {
		if (!PROTO_TRACK_DIRS[id]) {
			// Unknown track id in the proto — skip unless it has a plan file.
			if (!planIds.includes(id)) continue;
		}
		const workDir = PROTO_TRACK_DIRS[id] ? join(repoPath, PROTO_TRACK_DIRS[id]) : "";
		const planText = readPlan(plansDir, id);
		const sessionMin = learner.session_length_min ?? DEFAULT_SESSION_MIN;

		if (await trackExists(id)) {
			const ok = await ctx.ui.confirm(
				"Track exists",
				`Track "${id}" already exists in ~/.pi/learn/. Overwrite from proto?`,
			);
			if (!ok) continue;
		}

		const edge = extractEdge(planText) ?? "(migrated — set a real edge with /learn-plan)";
		const next = extractNext(planText) ?? "(migrated — set a real next action with /learn-plan)";

		const track = freshTrack({
			id,
			label: TRACK_LABELS[id] ?? id,
			outcome_compass: extractOutcome(planText) ?? "",
			work_dir: workDir,
			verify_command: extractVerify(planText),
			process_contract: { cue: null, session_min: sessionMin, reward: "log + 5min decompression" },
			edge: { statement: edge, set_at: new Date().toISOString(), sessions_at_edge: 0 },
			next_action: next,
			next_action_set_at: new Date().toISOString(),
		});
		await saveTrack(track);
		migrated += 1;
		ctx.ui.notify(`Migrated ${id} → ~/.pi/learn/tracks/${id}.json`, "info");
	}

	ctx.ui.notify(
		`Migration done: ${migrated} track${migrated === 1 ? "" : "s"}. Run /learn-plan <track> edge|next to fill any placeholders, then /learn-start.`,
		"info",
	);
}

function readProtoLearner(path: string): ProtoLearnerState {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as ProtoLearnerState;
	} catch {
		return {};
	}
}

function listPlanIds(plansDir: string): string[] {
	try {
		return readdirSync(plansDir)
			.filter((f) => f.endsWith(".md"))
			.map((f) => f.slice(0, -3));
	} catch {
		return [];
	}
}

function readPlan(plansDir: string, id: string): string | null {
	const path = join(plansDir, `${id}.md`);
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/** Best-effort extraction helpers — look for common headings/labels in the freeform markdown. */
function extractEdge(plan: string | null): string | null {
	if (!plan) return null;
	const m = /(?:^|\n)#{1,6}\s*(?:current edge|edge)\s*:?\s*\n+([^\n#]+)/i.exec(plan)
		|| /(?:^|\n)[-*_]?\s*(?:current edge|edge)\s*:\s*([^\n]+)/i.exec(plan);
	return m ? m[1].trim() : null;
}

function extractNext(plan: string | null): string | null {
	if (!plan) return null;
	const m = /(?:^|\n)#{1,6}\s*(?:next(?: action)?|next step)\s*:?\s*\n+([^\n#]+)/i.exec(plan)
		|| /(?:^|\n)[-*_]?\s*(?:next(?: action)?|next step)\s*:\s*([^\n]+)/i.exec(plan);
	return m ? m[1].trim() : null;
}

function extractOutcome(plan: string | null): string | null {
	if (!plan) return null;
	const m = /(?:^|\n)#{1,6}\s*(?:outcome|vision|goal)\s*:?\s*\n+([^\n#]+)/i.exec(plan)
		|| /(?:^|\n)[-*_]?\s*(?:outcome|vision|goal)\s*:\s*([^\n]+)/i.exec(plan);
	return m ? m[1].trim() : null;
}

function extractVerify(plan: string | null): string | null {
	if (!plan) return null;
	const m = /(?:^|\n)[-*_]?\s*(?:verify|verifycommand|verify command)\s*:\s*([^\n]+)/i.exec(plan);
	return m ? m[1].trim() : null;
}
