/**
 * Socrates Start — Socratic learning dashboard (fresh sessions)
 *
 * Designed for low cognitive load: short recap, new session, energy-tailored scope.
 *
 * Commands:
 *   /socrates-start         Pick track + energy → lightweight recap → fresh session prompt
 *                           Quick: /socrates-start rust-rag-learn low
 *   /socrates-status        Quick overview of all tracks (when you want the big picture)
 *   /socrates-setup         Set default learner state (track, energy, session length, focus)
 *   /socrates-plan          Plan-mode progress update (see socrates-plan.ts)
 *
 * Data priority for recap: PROGRESS.md → plan → journal → learner setup
 */

import { accessSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type TrackId = "rust-rag-learn" | "rust-webgpu" | "c";
type Energy = "low" | "medium" | "high";

interface TrackStatus {
	track: TrackId;
	phase: number | null;
	last_session_at: string;
	last_done: string;
	next_5min: string;
	last_fuzzy: string;
}

interface JournalStatus {
	tracks: Partial<Record<TrackId | "monorepo", TrackStatus>>;
}

interface ProgressSnapshot {
	phase: string;
	nextTask: string;
	lastSession: string;
	lastUpdated: string;
	uncheckedCount: number;
	totalCount: number;
}

interface LearnerState {
	track?: TrackId;
	current_focus?: string;
	session_length_min?: 25 | 45;
	energy?: Energy;
	updated_at?: string;
}

interface PlanSnapshot {
	phase: string;
	nextTask: string;
	lastSession: string;
	fuzzy: string;
}

interface TrackOverview {
	track: TrackId;
	label: string;
	progress: ProgressSnapshot;
	journal?: TrackStatus;
	plan?: PlanSnapshot;
	verifyCommand: string;
	workDir: string;
}

const TRACKS: TrackId[] = ["rust-rag-learn", "rust-webgpu", "c"];

const TRACK_META: Record<
	TrackId,
	{ label: string; progressFile: string; verifyCommand: string; workDir: string }
> = {
	"rust-rag-learn": {
		label: "Rust RAG",
		progressFile: "rust-rag-learn/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-rag-learn",
		workDir: "rust-rag-learn",
	},
	"rust-webgpu": {
		label: "Rust WebGPU",
		progressFile: "rust-webgpu/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-webgpu",
		workDir: "rust-webgpu",
	},
	c: {
		label: "C / TinyVM",
		progressFile: "c/docs/PROGRESS.md",
		verifyCommand: "make -C c test EX=01",
		workDir: "c",
	},
};

const JOURNAL_STATUS = join(".pi", "journal", "status.json");
const LEARNER_STATE = join(".pi", "learner.json");
const PLANS_DIR = join(".pi", "plans");

export default function socratesStart(pi: ExtensionAPI) {
	let repoRoot: string | null = null;

	pi.on("session_start", async (_event, ctx) => {
		repoRoot = findRepoRoot(ctx.cwd);
	});

	pi.registerCommand("socrates-start", {
		description: "Fresh session — pick track, set energy, get a short recap + starter prompt",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
			await runFreshSession(ctx, args.trim());
		},
	});

	pi.registerCommand("socrates-status", {
		description: "Quick overview of all learning tracks",
		handler: async (_args, ctx) => {
			if (!ensureRepo(ctx)) return;
			const overviews = await loadAllTrackOverviews(repoRoot!);
			const learner = await loadLearnerState(repoRoot!);
			ctx.ui.notify(formatStatusBoard(overviews, learner), "info");
		},
	});

	pi.registerCommand("socrates-setup", {
		description: "Set learner state: /socrates-setup [track] or interactive",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
			await runSetupCommand(ctx, args.trim());
		},
	});

	function ensureRepo(ctx: ExtensionCommandContext): boolean {
		repoRoot = repoRoot ?? findRepoRoot(ctx.cwd);
		if (!repoRoot) {
			ctx.ui.notify("Not in socratic-playground repo", "warning");
			return false;
		}
		return true;
	}

	async function runFreshSession(ctx: ExtensionCommandContext, args: string): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify(
				"/socrates-start needs pi TUI. Quick start: /socrates-start rust-rag-learn low",
				"warning",
			);
			return;
		}

		await ctx.waitForIdle();

		const overviews = await loadAllTrackOverviews(repoRoot!);
		const learner = await loadLearnerState(repoRoot!);
		const argParts = args.split(/\s+/).filter(Boolean);

		let track: TrackId | null =
			argParts[0] && isTrackId(argParts[0]) ? argParts[0] : learner.track ?? null;
		if (!track) {
			track = await pickTrack(ctx, overviews, learner);
			if (!track) {
				ctx.ui.notify("Start cancelled", "info");
				return;
			}
		}

		const overview = overviews.find((o) => o.track === track);
		if (!overview) return;

		let energy: Energy | null =
			argParts[1] && isEnergy(argParts[1]) ? argParts[1] : learner.energy ?? null;
		if (!energy) {
			energy = await pickEnergy(ctx);
			if (!energy) {
				ctx.ui.notify("Start cancelled", "info");
				return;
			}
		}

		const length = energy === "low" ? 25 : learner.session_length_min ?? (energy === "high" ? 45 : 25);

		ctx.ui.notify(formatRecap(overview, learner, energy), "info");
		ctx.ui.pasteToEditor(buildFreshSessionPrompt(overview, learner, energy, length));
		ctx.ui.notify(`Fresh session ready · ${length}m · ${overview.verifyCommand}`, "info");

		try {
			pi.events.emit("socrates:timer:start", { minutes: length, track });
		} catch {
			// timer extension not loaded — ignore
		}
	}

	async function runSetupCommand(ctx: ExtensionCommandContext, args: string): Promise<void> {
		const learner = await loadLearnerState(repoRoot!);
		const overviews = await loadAllTrackOverviews(repoRoot!);

		let track = isTrackId(args) ? args : learner.track ?? detectTrack(ctx.cwd, repoRoot!);
		if (!args) {
			const picked = await pickTrack(ctx, overviews, learner);
			if (!picked) return;
			track = picked;
		} else if (!isTrackId(args)) {
			ctx.ui.notify(`Unknown track "${args}". Use rust-rag-learn, rust-webgpu, or c`, "warning");
			return;
		}

		const currentFocus =
			(await ctx.ui.input("Current focus", learner.current_focus ?? "e.g. store.rs search()")) ??
			learner.current_focus ??
			"";

		const energyChoice = await ctx.ui.select("Energy", ["low", "medium", "high"], {
			signal: undefined,
		});
		const energy = (energyChoice as Energy | undefined) ?? learner.energy ?? "medium";

		const lengthChoice = await ctx.ui.select("Session length (min)", ["25", "45"]);
		const sessionLength = lengthChoice === "45" ? 45 : 25;

		const next: LearnerState = {
			track,
			current_focus: currentFocus.trim() || undefined,
			session_length_min: sessionLength,
			energy,
			updated_at: new Date().toISOString(),
		};
		await saveLearnerState(repoRoot!, next);
		ctx.ui.notify(
			`Setup saved: ${track}${next.current_focus ? ` · ${next.current_focus}` : ""} · ${energy} · ${sessionLength}m`,
			"info",
		);
	}
}

async function loadAllTrackOverviews(repoRoot: string): Promise<TrackOverview[]> {
	const journalStatus = await loadJournalStatus(repoRoot);

	return TRACKS.map((track) => {
		const meta = TRACK_META[track];
		const progress = parseProgressSnapshot(meta.progressFile, repoRoot);
		return {
			track,
			label: meta.label,
			progress,
			journal: journalStatus.tracks[track],
			plan: loadPlanSnapshot(repoRoot, track),
			verifyCommand: meta.verifyCommand,
			workDir: meta.workDir,
		};
	});
}

async function pickTrack(
	ctx: ExtensionCommandContext,
	overviews: TrackOverview[],
	learner: LearnerState = {},
): Promise<TrackId | null> {
	const options = overviews.map(
		(overview) => `${overview.label} — ${truncate(pickNextTask(overview, learner), 50)}`,
	);
	const picked = await ctx.ui.select("Where do you want to work?", options);
	if (!picked) return null;
	const idx = options.indexOf(picked);
	return idx >= 0 ? overviews[idx]!.track : null;
}

async function pickEnergy(ctx: ExtensionCommandContext): Promise<Energy | null> {
	const options = [
		"Low — one small win · 25m · minimal context",
		"Medium — steady progress · short recap",
		"High — deeper session · include fuzzy concepts",
	];
	const picked = await ctx.ui.select("Energy today?", options);
	if (!picked) return null;
	if (picked.startsWith("Low")) return "low";
	if (picked.startsWith("High")) return "high";
	if (picked.startsWith("Medium")) return "medium";
	return null;
}

function formatRecap(overview: TrackOverview, learner: LearnerState, energy: Energy): string {
	const next = pickNextTask(overview, learner);
	const phase = pickPhase(overview);
	const lines = [`${overview.label} · ${phase}`, `Next: ${next}`];

	if (energy !== "low") {
		const last = pickLastDone(overview, learner);
		if (last) lines.splice(1, 0, `Last: ${truncate(last.replace(/\n/g, " "), 80)}`);
	}

	return lines.join("\n");
}

function buildFreshSessionPrompt(
	overview: TrackOverview,
	learner: LearnerState,
	energy: Energy,
	length: number,
): string {
	const next = pickNextTask(overview, learner);
	const lines: string[] = [];

	if (energy === "low") {
		lines.push(
			`Fresh session — ${overview.track}`,
			`Next: ${next}`,
			`Verify: ${overview.verifyCommand}`,
			"",
			`Socratic tutor: one question at a time. ~${length}m, low energy — keep scope tiny.`,
		);
		return lines.join("\n");
	}

	lines.push(`Fresh session — ${overview.track} · ${pickPhase(overview)}`);
	lines.push(`Next: ${next}`);

	const last = pickLastDone(overview, learner);
	if (last) {
		lines.push(`Last: ${truncate(last.replace(/\n/g, " "), energy === "high" ? 120 : 80)}`);
	}

	if (energy === "high") {
		const fuzzy = pickFuzzy(overview);
		if (fuzzy) lines.push(`Fuzzy: ${fuzzy}`);
	}

	lines.push(
		`Verify: ${overview.verifyCommand}`,
		"",
		`Socratic tutor: ask what I've tried before hinting. ~${length}m session.`,
	);

	return lines.join("\n");
}

function formatStatusBoard(overviews: TrackOverview[], learner: LearnerState = {}): string {
	return overviews.map((o) => formatTrackLine(o, learner)).join("\n\n");
}

function formatTrackLine(overview: TrackOverview, learner: LearnerState = {}): string {
	const next = pickNextTask(overview, learner);
	const when = overview.journal?.last_session_at
		? formatRelative(overview.journal.last_session_at)
		: "no journal yet";
	const checklist = `${overview.progress.totalCount - overview.progress.uncheckedCount}/${overview.progress.totalCount} checklist`;
	const phase = pickPhase(overview);
	return `${overview.label} · ${phase}\n  Last: ${when} · ${checklist}\n  Next: ${next}`;
}

function pickPhase(overview: TrackOverview): string {
	return overview.progress.phase || overview.plan?.phase?.trim() || "unknown";
}

function pickNextTask(overview: TrackOverview, learner: LearnerState = {}): string {
	return (
		overview.progress.nextTask ||
		overview.plan?.nextTask?.trim() ||
		overview.journal?.next_5min?.trim() ||
		(learner.track === overview.track ? learner.current_focus?.trim() : undefined) ||
		"(not set)"
	);
}

function pickLastDone(overview: TrackOverview, _learner: LearnerState = {}): string | undefined {
	return (
		overview.progress.lastSession?.trim() ||
		overview.plan?.lastSession?.trim() ||
		overview.journal?.last_done?.trim() ||
		undefined
	);
}

function pickFuzzy(overview: TrackOverview): string | undefined {
	return overview.plan?.fuzzy?.trim() || overview.journal?.last_fuzzy?.trim() || undefined;
}

function loadPlanSnapshot(repoRoot: string, track: TrackId): PlanSnapshot | undefined {
	try {
		const content = readFileSync(join(repoRoot, PLANS_DIR, `${track}.md`), "utf8");
		return {
			phase: extractPlanSection(content, "Phase"),
			nextTask: extractPlanSection(content, "Next (5-min)"),
			lastSession: extractPlanSection(content, "Last session"),
			fuzzy: extractPlanSection(content, "Still fuzzy"),
		};
	} catch {
		return undefined;
	}
}

function extractPlanSection(content: string, heading: string): string {
	const pattern = new RegExp(
		`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=^## |^---|\\z)`,
		"m",
	);
	const match = content.match(pattern);
	if (!match?.[1]) return "";
	return match[1]
		.trim()
		.split("\n")
		.filter((line) => !/^\(.+\)$/.test(line.trim()))
		.join("\n")
		.trim();
}

function parseProgressSnapshot(progressFile: string, repoRoot: string): ProgressSnapshot {
	const fallback: ProgressSnapshot = {
		phase: "unknown",
		nextTask: "(open PROGRESS.md)",
		lastSession: "",
		lastUpdated: "",
		uncheckedCount: 0,
		totalCount: 0,
	};

	try {
		const content = readFileSync(join(repoRoot, progressFile), "utf8");
		const phase = extractTableField(content, "Phase") ?? fallback.phase;
		const nextTask = extractTableField(content, "Next 5-min task") ?? fallback.nextTask;
		const lastSession = extractTableField(content, "Last session") ?? "";
		const lastUpdated = extractTableField(content, "Last updated") ?? "";
		const { unchecked, total } = countChecklist(content);
		return { phase, nextTask, lastSession, lastUpdated, uncheckedCount: unchecked, totalCount: total };
	} catch {
		return fallback;
	}
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

function countChecklist(content: string): { unchecked: number; total: number } {
	const boxes = content.match(/^- \[[ x]\]/gm) ?? [];
	const total = boxes.length;
	const unchecked = boxes.filter((line) => line.includes("[ ]")).length;
	return { unchecked, total };
}

async function loadJournalStatus(repoRoot: string): Promise<JournalStatus> {
	try {
		const raw = await readFile(join(repoRoot, JOURNAL_STATUS), "utf8");
		return JSON.parse(raw) as JournalStatus;
	} catch {
		return { tracks: {} };
	}
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
	const { mkdir, writeFile, rename } = await import("node:fs/promises");
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
	await rename(tmp, path);
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

function isEnergy(value: string): value is Energy {
	return value === "low" || value === "medium" || value === "high";
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

function formatRelative(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
