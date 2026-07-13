/**
 * Socrates Plan — plan-mode progress updates
 *
 * Structured progress doc at `.pi/plans/<track>.md` syncs to PROGRESS.md + learner setup.
 *
 * Commands:
 *   /socrates-plan [track]   Edit progress plan → apply to PROGRESS.md + .pi/learner.json
 *   /socrates-plan-view      Show current plan (read-only)
 */

import { accessSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type TrackId = "rust-rag-learn" | "rust-webgpu" | "c";
type Energy = "low" | "medium" | "high";

interface TrackMeta {
	label: string;
	progressFile: string;
	verifyCommand: string;
}

interface LearnerState {
	track?: TrackId;
	current_focus?: string;
	session_length_min?: 25 | 45;
	energy?: Energy;
	updated_at?: string;
}

interface JournalTrackStatus {
	track: TrackId;
	phase: number | null;
	last_session_at: string;
	last_done: string;
	next_5min: string;
	last_fuzzy: string;
}

interface ProgressDraft {
	phase: string;
	lastSession: string;
	nextTask: string;
	fuzzy: string;
	checklist: string;
}

interface ParsedPlan {
	phase: string;
	context: string;
	lastSession: string;
	nextTask: string;
	fuzzy: string;
	checklist: string;
	verify: string;
}

const TRACK_META: Record<TrackId, TrackMeta> = {
	"rust-rag-learn": {
		label: "Rust RAG",
		progressFile: "rust-rag-learn/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-rag-learn",
	},
	"rust-webgpu": {
		label: "Rust WebGPU",
		progressFile: "rust-webgpu/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-webgpu",
	},
	c: {
		label: "C / TinyVM",
		progressFile: "c/docs/PROGRESS.md",
		verifyCommand: "make -C c test EX=01",
	},
};

const PLANS_DIR = join(".pi", "plans");
const LEARNER_STATE = join(".pi", "learner.json");
const JOURNAL_STATUS = join(".pi", "journal", "status.json");

const PLAN_MARKER = "Socrates plan v1";

export default function socratesPlan(pi: ExtensionAPI) {
	let repoRoot: string | null = null;

	pi.on("session_start", async (_event, ctx) => {
		repoRoot = findRepoRoot(ctx.cwd);
	});

	pi.registerCommand("socrates-plan", {
		description: "Plan-mode progress update — edit plan doc, sync PROGRESS.md + setup",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
			await runPlanUpdate(ctx, args.trim());
		},
	});

	pi.registerCommand("socrates-plan-view", {
		description: "View current progress plan for a track",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
			await runPlanView(ctx, args.trim());
		},
	});

	function ensureRepo(ctx: ExtensionCommandContext): boolean {
		repoRoot = repoRoot ?? findRepoRoot(ctx.cwd);
		if (!repoRoot) {
			ctx.ui.notify("Socrates plan only works inside socratic-playground", "warning");
			return false;
		}
		return true;
	}

	async function runPlanView(ctx: ExtensionCommandContext, args: string): Promise<void> {
		const track = await resolveTrack(ctx, args);
		if (!track) return;

		const planPath = planFilePath(repoRoot!, track);
		let content: string;
		try {
			content = await readFile(planPath, "utf8");
		} catch {
			content = await buildPlanDraft(repoRoot!, track);
		}

		await ctx.ui.editor(`Plan · ${TRACK_META[track].label}`, content);
	}

	async function runPlanUpdate(ctx: ExtensionCommandContext, args: string): Promise<void> {
		const track = await resolveTrack(ctx, args);
		if (!track) return;

		const meta = TRACK_META[track];
		const planPath = planFilePath(repoRoot!, track);
		let draft: string;

		try {
			draft = await readFile(planPath, "utf8");
		} catch {
			draft = await buildPlanDraft(repoRoot!, track);
		}

		const edited = await ctx.ui.editor(
			`Progress plan · ${meta.label}`,
			draft,
		);
		if (edited === undefined) {
			ctx.ui.notify("Plan cancelled", "info");
			return;
		}

		const parsed = parsePlanDocument(edited, meta.verifyCommand);
		if (!parsed.nextTask.trim()) {
			ctx.ui.notify("Next (5-min) is required — add one line under ## Next (5-min)", "warning");
			return;
		}
		if (!parsed.phase.trim()) {
			ctx.ui.notify("Phase is required — add one line under ## Phase", "warning");
			return;
		}

		const preview = await buildProgressPreview(repoRoot!, track, parsed);
		if (preview) {
			const applyProgress = await ctx.ui.confirm(
				"Update PROGRESS.md?",
				`Sync ${meta.progressFile} from this plan?`,
			);
			if (applyProgress) {
				const progressEdit = await ctx.ui.editor("PROGRESS.md preview (edit if needed):", preview);
				if (progressEdit !== undefined) {
					await writeProgressFile(repoRoot!, track, progressEdit);
				}
			}
		}

		await savePlanFile(repoRoot!, track, formatPlanDocument(track, parsed));
		await syncLearnerFromPlan(repoRoot!, track, parsed);
		await syncJournalStatus(repoRoot!, track, parsed);

		ctx.ui.notify(
			`Plan saved · ${track} · next: ${truncate(parsed.nextTask, 60)}`,
			"info",
		);
	}

	async function resolveTrack(ctx: ExtensionCommandContext, args: string): Promise<TrackId | null> {
		if (isTrackId(args)) return args;

		const learner = await loadLearnerState(repoRoot!);
		const defaultTrack = learner.track ?? detectTrack(ctx.cwd, repoRoot!);
		const labels = (Object.keys(TRACK_META) as TrackId[]).map(
			(t) => `${TRACK_META[t].label} (${t})`,
		);
		const picked = await ctx.ui.select("Which track?", labels);
		if (!picked) return null;
		const idx = labels.indexOf(picked);
		return idx >= 0 ? (Object.keys(TRACK_META) as TrackId[])[idx]! : defaultTrack;
	}
}

async function buildPlanDraft(repoRoot: string, track: TrackId): Promise<string> {
	const meta = TRACK_META[track];
	const progressPath = join(repoRoot, meta.progressFile);
	const learner = await loadLearnerState(repoRoot);
	const journal = await loadJournalForTrack(repoRoot, track);

	let progressContent = "";
	try {
		progressContent = readFileSync(progressPath, "utf8");
	} catch {
		progressContent = "";
	}

	const draft: ProgressDraft = {
		phase: extractTableField(progressContent, "Phase") ?? "—",
		lastSession:
			extractTableField(progressContent, "Last session") ||
			journal?.last_done?.trim() ||
			"",
		nextTask:
			extractTableField(progressContent, "Next 5-min task") ||
			journal?.next_5min?.trim() ||
			(learner.track === track ? learner.current_focus?.trim() : undefined) ||
			"",
		fuzzy: journal?.last_fuzzy?.trim() || "",
		checklist: extractChecklistSection(progressContent),
	};

	return formatPlanDocument(track, {
		phase: draft.phase,
		context: buildContextHint(track, draft.phase),
		lastSession: draft.lastSession,
		nextTask: draft.nextTask,
		fuzzy: draft.fuzzy,
		checklist: draft.checklist,
		verify: meta.verifyCommand,
	});
}

function formatPlanDocument(track: TrackId, plan: ParsedPlan): string {
	const lines = [
		`# Progress plan · ${track}`,
		"",
		`> ${PLAN_MARKER} — edit sections below. Saves to .pi/plans/${track}.md and syncs PROGRESS.md + setup.`,
		"",
		"## Phase",
		plan.phase.trim() || "—",
		"",
		"## Context",
		plan.context.trim() || "(where you are in the roadmap — optional)",
		"",
		"## Last session",
		plan.lastSession.trim() || "(what passed / what you did)",
		"",
		"## Next (5-min)",
		plan.nextTask.trim() || "(one concrete action)",
		"",
		"## Still fuzzy",
		plan.fuzzy.trim() || "(optional — concepts still unclear)",
		"",
		"## Checklist",
		plan.checklist.trim() || "- [ ] (copy checklist items from PROGRESS.md)",
		"",
		"---",
		`**Verify:** \`${plan.verify.trim() || TRACK_META[track].verifyCommand}\``,
		"",
	];

	return lines.join("\n");
}

function parsePlanDocument(content: string, defaultVerify: string): ParsedPlan {
	return {
		phase: extractPlanSection(content, "Phase"),
		context: extractPlanSection(content, "Context"),
		lastSession: extractPlanSection(content, "Last session"),
		nextTask: extractPlanSection(content, "Next (5-min)"),
		fuzzy: extractPlanSection(content, "Still fuzzy"),
		checklist: extractPlanSection(content, "Checklist"),
		verify: extractVerifyCommand(content) || defaultVerify,
	};
}

function extractPlanSection(content: string, heading: string): string {
	const pattern = new RegExp(
		`^## ${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=^## |^---|\\z)`,
		"m",
	);
	const match = content.match(pattern);
	if (!match?.[1]) return "";
	return stripPlaceholderLines(match[1].trim());
}

function stripPlaceholderLines(text: string): string {
	return text
		.split("\n")
		.filter((line) => !/^\(.+\)$/.test(line.trim()))
		.join("\n")
		.trim();
}

function extractVerifyCommand(content: string): string | undefined {
	const match = content.match(/\*\*Verify:\*\*\s*`([^`]+)`/);
	return match?.[1]?.trim();
}

function buildContextHint(track: TrackId, phase: string): string {
	if (track === "rust-rag-learn") {
		if (/2|embed|store/i.test(phase)) {
			return "STEPS.md Step 2–3 — embed.rs + store.rs (InMemoryVectorStore)";
		}
		if (/1|chunk/i.test(phase)) {
			return "STEPS.md Step 1 — chunk.rs";
		}
		if (/3|retriev/i.test(phase)) {
			return "STEPS.md Step 4 — retrieve.rs + search CLI";
		}
		return "See rust-rag-learn/docs/STEPS.md for current step";
	}
	if (track === "rust-webgpu") {
		return "See rust-webgpu/docs/STEPS.md";
	}
	return "See c/docs/EMULATOR.md + exercises/";
}

function extractChecklistSection(progressContent: string): string {
	const header = progressContent.match(/^## Phase checklist/m)
		? "## Phase checklist"
		: progressContent.match(/^## Exercise checklist/m)
			? "## Exercise checklist"
			: null;
	if (!header) {
		const boxes = progressContent.match(/^- \[[ x]\].+$/gm) ?? [];
		return boxes.join("\n");
	}

	const start = progressContent.indexOf(header);
	const rest = progressContent.slice(start + header.length);
	const end = rest.search(/^## /m);
	const section = end >= 0 ? rest.slice(0, end) : rest;
	const boxes = section.match(/^- \[[ x]\].+$/gm) ?? [];
	return boxes.join("\n");
}

async function buildProgressPreview(
	repoRoot: string,
	track: TrackId,
	plan: ParsedPlan,
): Promise<string | null> {
	const path = join(repoRoot, TRACK_META[track].progressFile);
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return null;
	}

	const dateStr = formatProgressDate(new Date().toISOString());
	const lastSession = truncate(plan.lastSession.replace(/\n/g, " "), 120);
	const nextTask = plan.nextTask.trim();
	const phaseDisplay = plan.phase.trim();

	content = content.replace(
		/(\|\s*\*\*Last updated\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${dateStr.trim()}`,
	);
	content = content.replace(
		/(\|\s*\*\*Last session\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${lastSession || "—"}`,
	);
	content = content.replace(
		/(\|\s*\*\*Next 5-min task\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${nextTask}`,
	);
	content = content.replace(
		/(\|\s*\*\*Phase\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${phaseDisplay}`,
	);

	content = mergeChecklistIntoProgress(content, plan.checklist);

	const logRow = `| ${dateStr} | ${phaseDisplay} | ${lastSession || "—"} | ${nextTask} |`;
	const logHeader = "| Date | Phase | Done | Next 5-min task |";
	const headerIdx = content.indexOf(logHeader);
	if (headerIdx >= 0) {
		const dividerIdx = content.indexOf("|------|", headerIdx);
		const insertAt = content.indexOf("\n", dividerIdx) + 1;
		content = content.slice(0, insertAt) + logRow + "\n" + content.slice(insertAt);
	}

	return content;
}

function mergeChecklistIntoProgress(progressContent: string, planChecklist: string): string {
	const planLines = planChecklist.match(/^- \[[ x]\].+$/gm) ?? [];
	if (planLines.length === 0) return progressContent;

	let result = progressContent;
	for (const planLine of planLines) {
		const checked = planLine.startsWith("- [x]");
		const text = planLine.replace(/^- \[[ x]\]\s*/, "").trim();
		if (!text) continue;

		const pattern = new RegExp(
			`^- \\[[ x]\\]\\s*${escapeRegex(text)}\\s*$`,
			"m",
		);
		if (pattern.test(result)) {
			result = result.replace(pattern, `- [${checked ? "x" : " "}] ${text}`);
		}
	}
	return result;
}

async function savePlanFile(repoRoot: string, track: TrackId, content: string): Promise<void> {
	const dir = join(repoRoot, PLANS_DIR);
	await mkdir(dir, { recursive: true });
	const path = planFilePath(repoRoot, track);
	const tmp = `${path}.tmp`;
	await writeFile(tmp, content, "utf8");
	await rename(tmp, path);
}

async function writeProgressFile(repoRoot: string, track: TrackId, content: string): Promise<void> {
	const path = join(repoRoot, TRACK_META[track].progressFile);
	const tmp = `${path}.tmp`;
	await writeFile(tmp, content, "utf8");
	await rename(tmp, path);
}

async function syncLearnerFromPlan(repoRoot: string, track: TrackId, plan: ParsedPlan): Promise<void> {
	const learner = await loadLearnerState(repoRoot);
	const next: LearnerState = {
		...learner,
		track,
		current_focus: plan.nextTask.trim(),
		updated_at: new Date().toISOString(),
	};
	await saveLearnerState(repoRoot, next);
}

async function syncJournalStatus(repoRoot: string, track: TrackId, plan: ParsedPlan): Promise<void> {
	const status = await loadJournalStatus(repoRoot);
	status.tracks[track] = {
		track,
		phase: parsePhaseNumber(plan.phase),
		last_session_at: new Date().toISOString(),
		last_done: plan.lastSession.trim(),
		next_5min: plan.nextTask.trim(),
		last_fuzzy: plan.fuzzy.trim(),
	};
	await saveJournalStatus(repoRoot, status);
}

function parsePhaseNumber(phase: string): number | null {
	const match = phase.match(/^(\d+)/);
	return match ? Number(match[1]) : null;
}

function planFilePath(repoRoot: string, track: TrackId): string {
	return join(repoRoot, PLANS_DIR, `${track}.md`);
}

function formatProgressDate(iso: string): string {
	const d = new Date(iso);
	return `_${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}_`;
}

function extractTableField(content: string, field: string): string | undefined {
	const pattern = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*([^|\\n]+)`);
	const match = content.match(pattern);
	if (!match?.[1]) return undefined;
	const value = match[1].trim();
	if (!value || /^_/.test(value) || value === "_(set date when you edit)_" || value === "_(what you did)_") {
		return undefined;
	}
	return value;
}

async function loadLearnerState(repoRoot: string): Promise<LearnerState> {
	try {
		const raw = await readFile(join(repoRoot, LEARNER_STATE), "utf8");
		return JSON.parse(raw) as LearnerState;
	} catch {
		return {};
	}
}

async function saveLearnerState(repoRoot: string, state: LearnerState): Promise<void> {
	const path = join(repoRoot, LEARNER_STATE);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
	await rename(tmp, path);
}

interface JournalStatus {
	tracks: Partial<Record<TrackId | "monorepo", JournalTrackStatus>>;
}

async function loadJournalStatus(repoRoot: string): Promise<JournalStatus> {
	try {
		const raw = await readFile(join(repoRoot, JOURNAL_STATUS), "utf8");
		return JSON.parse(raw) as JournalStatus;
	} catch {
		return { tracks: {} };
	}
}

async function saveJournalStatus(repoRoot: string, status: JournalStatus): Promise<void> {
	const path = join(repoRoot, JOURNAL_STATUS);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(status, null, 2), "utf8");
	await rename(tmp, path);
}

async function loadJournalForTrack(
	repoRoot: string,
	track: TrackId,
): Promise<JournalTrackStatus | undefined> {
	const status = await loadJournalStatus(repoRoot);
	return status.tracks[track];
}

function findRepoRoot(cwd: string): string | null {
	let dir = resolve(cwd);
	for (let i = 0; i < 8; i++) {
		const rag = join(dir, "rust-rag-learn");
		const webgpu = join(dir, "rust-webgpu");
		const agents = join(dir, "AGENTS.md");
		if (pathExists(agents) && pathExists(rag) && pathExists(webgpu)) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function pathExists(path: string): boolean {
	try {
		accessSync(path);
		return true;
	} catch {
		return false;
	}
}

function detectTrack(cwd: string, repoRoot: string): TrackId {
	const rel = relative(repoRoot, resolve(cwd));
	if (rel.startsWith("rust-rag-learn")) return "rust-rag-learn";
	if (rel.startsWith("rust-webgpu")) return "rust-webgpu";
	if (rel === "c" || rel.startsWith("c/")) return "c";
	return "rust-rag-learn";
}

function isTrackId(value: string): value is TrackId {
	return value === "rust-rag-learn" || value === "rust-webgpu" || value === "c";
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}
