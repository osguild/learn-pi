/**
 * Socrates Journal — session debrief for socratic-playground
 *
 * Commands:
 *   /socrates-journal       End-of-session debrief (saves .md + auto-syncs PROGRESS.md + plan)
 *   /socrates-journal-last  Show last entry for current track
 *   /socrates-journal-today List today's entries
 *   /socrates-journal-all   Browse all entries (optional track filter)
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, isBashToolResult } from "@earendil-works/pi-coding-agent";
import { Box, Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

type TrackId = "rust-rag-learn" | "rust-webgpu" | "c" | "monorepo";

interface JournalEntry {
	id: string;
	started_at: string;
	ended_at: string;
	duration_min: number;
	track: TrackId;
	phase: number | null;
	phase_label: string;
	done: string;
	fuzzy: string;
	next_5min: string;
	tests_suggested?: string;
	tests_confirmed?: string;
	pi_session_id: string;
	pi_session_file?: string;
	git_sha?: string;
	cwd: string;
	session_file?: string;
}

interface TrackStatus {
	track: TrackId;
	phase: number | null;
	last_session_at: string;
	last_done: string;
	next_5min: string;
	last_fuzzy: string;
}

interface JournalStatus {
	tracks: Partial<Record<TrackId, TrackStatus>>;
}

interface TrackConfig {
	progressFile: string;
	verifyCommand: string;
}

const TRACK_CONFIG: Record<Exclude<TrackId, "monorepo">, TrackConfig> = {
	"rust-rag-learn": {
		progressFile: "rust-rag-learn/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-rag-learn",
	},
	"rust-webgpu": {
		progressFile: "rust-webgpu/docs/PROGRESS.md",
		verifyCommand: "cargo test -p rust-webgpu",
	},
	c: {
		progressFile: "c/docs/PROGRESS.md",
		verifyCommand: "make -C c test EX=01",
	},
};

const JOURNAL_DIR = join(".pi", "journal");
const SESSIONS_FILE = join(JOURNAL_DIR, "sessions.jsonl");
const SESSIONS_MD_DIR = join(JOURNAL_DIR, "sessions");
const STATUS_FILE = join(JOURNAL_DIR, "status.json");
const PLANS_DIR = join(".pi", "plans");
const LEARNER_STATE = join(".pi", "learner.json");
const JOURNAL_MARKER = "Socrates journal v1";
const PLAN_MARKER = "Socrates plan v1";

export default function socratesJournal(pi: ExtensionAPI) {
	let repoRoot: string | null = null;
	let sessionStartedAt: number | null = null;
	let lastTestOutput: string | undefined;
	let journalSavedThisSession = false;

	pi.on("session_start", async (_event, ctx) => {
		repoRoot = findRepoRoot(ctx.cwd);
		if (!repoRoot) return;

		sessionStartedAt = Date.now();
		journalSavedThisSession = false;
		lastTestOutput = undefined;
	});

	pi.on("tool_result", async (event) => {
		if (!repoRoot || !isBashToolResult(event)) return;
		const command = typeof event.input.command === "string" ? event.input.command : "";
		if (!/(cargo test|make -C c test)/.test(command)) return;

		const text = event.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");
		if (text.trim()) {
			lastTestOutput = truncate(text, 400);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!repoRoot || !ctx.hasUI || journalSavedThisSession) return;

		const save = await ctx.ui.confirm(
			"Socrates Journal",
			"Save a session debrief before quitting?",
			{ timeout: 5000 },
		);
		if (save) {
			await runJournal(ctx);
		}
	});

	pi.registerEntryRenderer("socrates-journal", renderJournalCard);
	pi.registerEntryRenderer("playground-journal", renderJournalCard);

	function renderJournalCard(
		entry: { data?: unknown },
		{ expanded }: { expanded: boolean },
		theme: Parameters<Parameters<ExtensionAPI["registerEntryRenderer"]>[1]>[2],
	) {
		const data = entry.data as JournalEntry | undefined;
		if (!data) return new Text("Journal entry", 0, 0);

		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		const header = `${theme.fg("accent", "📓 Journal")} · ${data.track} · ${data.duration_min}m · phase ${data.phase_label}`;
		box.addChild(new Text(header, 0, 0));
		box.addChild(new Text(theme.fg("dim", `Done: ${truncate(data.done, 80)}`), 0, 0));
		box.addChild(new Text(theme.fg("dim", `Next: ${truncate(data.next_5min, 80)}`), 0, 0));
		if (expanded && data.fuzzy) {
			box.addChild(new Text(theme.fg("dim", `Fuzzy: ${data.fuzzy}`), 0, 0));
		}
		return box;
	}

	pi.registerCommand("socrates-journal", {
		description: "End-of-session debrief — save journal entry",
		handler: async (_args, ctx) => {
			await runJournal(ctx);
		},
	});

	pi.registerCommand("socrates-journal-last", {
		description: "Show the last journal entry for the current track",
		handler: async (_args, ctx) => {
			if (!ensureRepo(ctx)) return;
			const track = detectTrack(ctx.cwd, repoRoot!);
			const entry = await loadLastEntryForTrack(repoRoot!, track);
			if (!entry) {
				ctx.ui.notify(`No journal entries for ${track}`, "info");
				return;
			}
			showEntrySummary(ctx, entry);
		},
	});

	pi.registerCommand("socrates-journal-today", {
		description: "List today's journal entries",
		handler: async (_args, ctx) => {
			if (!ensureRepo(ctx)) return;
			const entries = await loadTodayEntries(repoRoot!);
			if (entries.length === 0) {
				ctx.ui.notify("No journal entries today", "info");
				return;
			}
			const lines = entries.map(
				(e) => `${formatClock(e.ended_at)} · ${e.track} · p${e.phase_label} · ${truncate(e.done, 50)}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("socrates-journal-all", {
		description: "Browse all journal entries in detail (optional: track filter)",
		handler: async (args, ctx) => {
			if (!ensureRepo(ctx)) return;
			await browseJournalEntries(ctx, args.trim());
		},
	});

	async function runJournal(ctx: ExtensionCommandContext): Promise<void> {
		if (!ensureRepo(ctx)) return;

		const track = detectTrack(ctx.cwd, repoRoot!);
		const status = await loadStatus(repoRoot!);
		const startedAt = sessionStartedAt ?? inferSessionStart(ctx);
		const endedAt = Date.now();
		const durationMin = Math.max(1, Math.round((endedAt - startedAt) / 60_000));

		const inferred = inferPhase(track, lastTestOutput, status.tracks[track]?.phase ?? null);
		const testsSuggested = lastTestOutput;

		const doneDefault = testsSuggested
			? `Tests:\n${testsSuggested}\n\n(Summarize what you accomplished)`
			: status.tracks[track]?.last_done
				? `(Previous: ${status.tracks[track]!.last_done})\n\nWhat passed / what you did today?`
				: "What passed / what you did?";

		const done = await ctx.ui.editor("What passed / what you did:", doneDefault);
		if (done === undefined) {
			ctx.ui.notify("Journal cancelled", "info");
			return;
		}

		const fuzzy = (await ctx.ui.input("Still fuzzy (optional):", status.tracks[track]?.last_fuzzy ?? "")) ?? "";

		const nextDefault = status.tracks[track]?.next_5min ?? "";
		const next5 = await ctx.ui.input("Next 5-min task:", nextDefault);
		if (next5 === undefined || !next5.trim()) {
			ctx.ui.notify("Next 5-min task is required", "warning");
			return;
		}

		const phaseChoices = buildPhaseChoices(inferred);
		const phasePick = await ctx.ui.select(
			`Phase (inferred: ${inferred.label})`,
			phaseChoices.map((p) => p.label),
		);
		const picked = phaseChoices.find((p) => p.label === phasePick) ?? inferred;

		const entry: JournalEntry = {
			id: randomUUID(),
			started_at: new Date(startedAt).toISOString(),
			ended_at: new Date(endedAt).toISOString(),
			duration_min: durationMin,
			track,
			phase: picked.phase,
			phase_label: picked.label,
			done: done.trim(),
			fuzzy: fuzzy.trim(),
			next_5min: next5.trim(),
			tests_suggested: testsSuggested,
			tests_confirmed: testsSuggested,
			pi_session_id: ctx.sessionManager.getSessionId(),
			pi_session_file: ctx.sessionManager.getSessionFile() ?? undefined,
			git_sha: await readGitSha(repoRoot!),
			cwd: ctx.cwd,
		};

		const verifyCommand =
			track !== "monorepo" ? TRACK_CONFIG[track].verifyCommand : "cargo test --workspace";
		entry.session_file = await writeSessionMarkdown(repoRoot!, entry, verifyCommand);

		if (track !== "monorepo") {
			const preview = buildProgressPreview(repoRoot!, entry);
			if (preview) {
				await applyProgressExport(repoRoot!, track, preview);
			}
			await syncPlanFromJournal(repoRoot!, track, entry);
			await syncLearnerFromJournal(repoRoot!, track, entry);
		}

		await saveJournalEntry(repoRoot!, entry);
		pi.appendEntry("socrates-journal", entry);
		journalSavedThisSession = true;

		const syncNote = track !== "monorepo" ? " · synced PROGRESS.md + plan" : "";
		ctx.ui.notify(`Journal saved · ${track} · ${durationMin}m · phase ${picked.label}${syncNote}`, "info");
	}

	function ensureRepo(ctx: ExtensionCommandContext): boolean {
		repoRoot = findRepoRoot(ctx.cwd);
		if (!repoRoot) {
			ctx.ui.notify("Socrates journal only works inside socratic-playground", "warning");
			return false;
		}
		return true;
	}

	function showEntrySummary(ctx: ExtensionCommandContext, entry: JournalEntry): void {
		formatEntryContent(repoRoot!, entry).then((content) => ctx.ui.notify(content, "info"));
	}

	async function browseJournalEntries(ctx: ExtensionCommandContext, trackFilter: string): Promise<void> {
		let entries = await loadAllEntries(repoRoot!);

		if (trackFilter) {
			if (!isTrackId(trackFilter)) {
				ctx.ui.notify(
					`Unknown track "${trackFilter}". Use rust-rag-learn, rust-webgpu, c, or monorepo`,
					"warning",
				);
				return;
			}
			entries = entries.filter((e) => e.track === trackFilter);
		}

		entries.sort((a, b) => b.ended_at.localeCompare(a.ended_at));

		if (entries.length === 0) {
			ctx.ui.notify(
				trackFilter ? `No journal entries for ${trackFilter}` : "No journal entries yet",
				"info",
			);
			return;
		}

		if (ctx.mode !== "tui") {
			const blocks = await Promise.all(entries.map((e) => formatEntryContent(repoRoot!, e)));
			await ctx.ui.editor(
				trackFilter ? `Journal · ${trackFilter}` : "Journal · all entries",
				blocks.join("\n\n---\n\n"),
			);
			return;
		}

		while (true) {
			const selected = await pickJournalEntry(ctx, entries);
			if (!selected) return;

			await ctx.ui.editor(
				`Journal · ${selected.track} · ${formatEntryWhen(selected.ended_at)}`,
				await formatEntryContent(repoRoot!, selected),
			);
		}
	}

	async function pickJournalEntry(
		ctx: ExtensionCommandContext,
		entries: JournalEntry[],
	): Promise<JournalEntry | null> {
		const items: SelectItem[] = entries.map((entry) => ({
			value: entry.id,
			label: formatEntryListLabel(entry),
			description: truncate(entry.next_5min, 60),
		}));

		const selectedId = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Journal entries (newest first)"))));

			const selectList = new SelectList(items, Math.min(items.length, 12), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});

			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);

			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter view • esc exit")));
			container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selectedId) return null;
		return entries.find((entry) => entry.id === selectedId) ?? null;
	}
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
	return "monorepo";
}

function inferSessionStart(ctx: ExtensionCommandContext): number {
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "user") {
			return entry.message.timestamp;
		}
	}
	return Date.now();
}

interface PhaseGuess {
	phase: number | null;
	label: string;
}

function inferPhase(track: TrackId, testOutput: string | undefined, fallback: number | null): PhaseGuess {
	const hay = (testOutput ?? "").toLowerCase();

	if (track === "rust-rag-learn") {
		if (/rust_warmup|exercise_\d/.test(hay)) return { phase: 0, label: "0 — Warm-up" };
		if (/\bchunk\b/.test(hay)) return { phase: 1, label: "1 — Chunking" };
		if (/\b(embed|store)\b/.test(hay)) return { phase: 2, label: "2 — Embeddings & store" };
		if (/\bretrieve\b/.test(hay)) return { phase: 3, label: "3 — Retrieval CLI" };
		if (/\b(rag|ask)\b/.test(hay)) return { phase: 4, label: "4 — RAG + Ollama" };
		if (/qdrant/.test(hay)) return { phase: 5, label: "5 — Traits + Qdrant" };
		if (fallback !== null) return { phase: fallback, label: `${fallback} — (from last session)` };
		return { phase: 1, label: "1 — Chunking" };
	}

	if (track === "rust-webgpu") {
		if (/webgpu_warmup|exercise_\d/.test(hay)) return { phase: 0, label: "0 — Warm-up" };
		if (/cargo run/.test(hay)) return { phase: 1, label: "1 — Window + clear" };
		if (fallback !== null) return { phase: fallback, label: `${fallback} — (from last session)` };
		return { phase: 0, label: "0 — Warm-up" };
	}

	if (track === "c") {
		if (/make -C c test/.test(hay)) return { phase: fallback ?? 0, label: `${fallback ?? 0} — C exercises` };
		return { phase: fallback ?? 0, label: `${fallback ?? 0} — C track` };
	}

	return { phase: fallback, label: fallback === null ? "—" : `${fallback}` };
}

function buildPhaseChoices(inferred: PhaseGuess): PhaseGuess[] {
	const base: PhaseGuess[] = [
		{ phase: 0, label: "0 — Warm-up" },
		{ phase: 1, label: "1 — Chunking / Window" },
		{ phase: 2, label: "2 — Embeddings / Triangle" },
		{ phase: 3, label: "3 — Retrieval / Depth" },
		{ phase: 4, label: "4 — RAG / Game loop" },
		{ phase: 5, label: "5 — Qdrant / Camera" },
		{ phase: null, label: "— Unsure" },
	];
	if (!base.some((p) => p.label === inferred.label)) {
		base.unshift(inferred);
	}
	return base;
}

async function loadStatus(repoRoot: string): Promise<JournalStatus> {
	try {
		const raw = await readFile(join(repoRoot, STATUS_FILE), "utf8");
		return JSON.parse(raw) as JournalStatus;
	} catch {
		return { tracks: {} };
	}
}

async function saveStatus(repoRoot: string, status: JournalStatus): Promise<void> {
	const path = join(repoRoot, STATUS_FILE);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(status, null, 2), "utf8");
	await rename(tmp, path);
}

async function saveJournalEntry(repoRoot: string, entry: JournalEntry): Promise<void> {
	const dir = join(repoRoot, JOURNAL_DIR);
	await mkdir(dir, { recursive: true });
	await appendFile(join(repoRoot, SESSIONS_FILE), `${JSON.stringify(entry)}\n`, "utf8");

	const status = await loadStatus(repoRoot);
	status.tracks[entry.track] = {
		track: entry.track,
		phase: entry.phase,
		last_session_at: entry.ended_at,
		last_done: entry.done,
		next_5min: entry.next_5min,
		last_fuzzy: entry.fuzzy,
	};
	await saveStatus(repoRoot, status);
}

async function loadAllEntries(repoRoot: string): Promise<JournalEntry[]> {
	try {
		const raw = await readFile(join(repoRoot, SESSIONS_FILE), "utf8");
		return raw
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as JournalEntry);
	} catch {
		return [];
	}
}

async function loadLastEntryForTrack(repoRoot: string, track: TrackId): Promise<JournalEntry | undefined> {
	const entries = await loadAllEntries(repoRoot);
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i]!.track === track) return entries[i];
	}
	return undefined;
}

async function loadTodayEntries(repoRoot: string): Promise<JournalEntry[]> {
	const today = new Date().toISOString().slice(0, 10);
	const entries = await loadAllEntries(repoRoot);
	return entries.filter((e) => e.ended_at.startsWith(today));
}

async function readGitSha(repoRoot: string): Promise<string | undefined> {
	try {
		return execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
	} catch {
		return undefined;
	}
}

function formatProgressDate(iso: string): string {
	const d = new Date(iso);
	return `_${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}_`;
}

function buildProgressPreview(repoRoot: string, entry: JournalEntry): string | null {
	if (entry.track === "monorepo") return null;
	const config = TRACK_CONFIG[entry.track];
	if (!config) return null;

	const path = join(repoRoot, config.progressFile);
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return null;
	}

	const dateStr = formatProgressDate(entry.ended_at);
	const lastSession = truncate(entry.done.replace(/\n/g, " "), 120);
	const nextTask = entry.next_5min;
	const phaseDisplay = entry.phase ?? "—";

	content = content.replace(
		/(\|\s*\*\*Last updated\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${dateStr.trim()}`,
	);
	content = content.replace(
		/(\|\s*\*\*Last session\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${lastSession}`,
	);
	content = content.replace(
		/(\|\s*\*\*Next 5-min task\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${nextTask}`,
	);
	content = content.replace(
		/(\|\s*\*\*Phase\*\*\s*\|\s*).*(?=\s*\|)/,
		`$1${entry.phase_label}`,
	);

	const logRow = `| ${dateStr} | ${phaseDisplay} | ${lastSession} | ${nextTask} |`;
	const logHeader = "| Date | Phase | Done | Next 5-min task |";
	const headerIdx = content.indexOf(logHeader);
	if (headerIdx >= 0) {
		const dividerIdx = content.indexOf("|------|", headerIdx);
		const insertAt = content.indexOf("\n", dividerIdx) + 1;
		content = content.slice(0, insertAt) + logRow + "\n" + content.slice(insertAt);
	}

	return content;
}

async function applyProgressExport(repoRoot: string, track: TrackId, content: string): Promise<void> {
	if (track === "monorepo") return;
	const config = TRACK_CONFIG[track];
	if (!config) return;
	const path = join(repoRoot, config.progressFile);
	const tmp = `${path}.tmp`;
	await writeFile(tmp, content, "utf8");
	await rename(tmp, path);
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

function formatClock(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatEntryWhen(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatEntryListLabel(entry: JournalEntry): string {
	return `${formatEntryWhen(entry.ended_at)} · ${entry.track} · p${entry.phase_label} · ${truncate(entry.done.replace(/\n/g, " "), 40)}`;
}

function formatEntryDetail(entry: JournalEntry): string {
	const lines = [
		`${entry.track} · ${entry.duration_min}m · phase ${entry.phase_label}`,
		`Ended: ${new Date(entry.ended_at).toLocaleString()}`,
		entry.git_sha ? `Git: ${entry.git_sha}` : null,
		"",
		"Done:",
		entry.done,
		"",
		entry.fuzzy ? "Still fuzzy:" : null,
		entry.fuzzy || null,
		entry.fuzzy ? "" : null,
		"Next 5-min:",
		entry.next_5min,
	];

	if (entry.tests_confirmed) {
		lines.push("", "Tests:", entry.tests_confirmed);
	}

	return lines.filter((line) => line !== null).join("\n");
}

function isTrackId(value: string): value is TrackId {
	return value === "rust-rag-learn" || value === "rust-webgpu" || value === "c" || value === "monorepo";
}

function sessionMarkdownPath(repoRoot: string, entry: JournalEntry): string {
	const ended = new Date(entry.ended_at);
	const date = ended.toISOString().slice(0, 10);
	const time = ended.toISOString().slice(11, 16).replace(":", "");
	return join(repoRoot, SESSIONS_MD_DIR, entry.track, `${date}_${time}.md`);
}

function formatSessionMarkdown(entry: JournalEntry, verifyCommand: string): string {
	const lines = [
		`# Session · ${entry.track}`,
		"",
		`> ${JOURNAL_MARKER} · ${entry.ended_at} · ${entry.duration_min}m`,
		"",
		"## Phase",
		entry.phase_label,
		"",
		"## Done",
		entry.done,
		"",
	];

	if (entry.fuzzy.trim()) {
		lines.push("## Still fuzzy", entry.fuzzy, "");
	}

	lines.push("## Next (5-min)", entry.next_5min, "");

	if (entry.tests_confirmed?.trim()) {
		lines.push("## Tests", "```", entry.tests_confirmed, "```", "");
	}

	lines.push("---");
	lines.push(`**Verify:** \`${verifyCommand}\``);
	if (entry.git_sha) {
		lines.push(`**Git:** \`${entry.git_sha}\``);
	}
	lines.push("");

	return lines.join("\n");
}

async function writeSessionMarkdown(
	repoRoot: string,
	entry: JournalEntry,
	verifyCommand: string,
): Promise<string> {
	const path = sessionMarkdownPath(repoRoot, entry);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	const content = formatSessionMarkdown(entry, verifyCommand);
	await writeFile(tmp, content, "utf8");
	await rename(tmp, path);
	return relative(repoRoot, path);
}

async function formatEntryContent(repoRoot: string, entry: JournalEntry): Promise<string> {
	if (entry.session_file) {
		try {
			return await readFile(join(repoRoot, entry.session_file), "utf8");
		} catch {
			// fall through to legacy detail
		}
	}
	const guessed = sessionMarkdownPath(repoRoot, entry);
	try {
		return await readFile(guessed, "utf8");
	} catch {
		return formatEntryDetail(entry);
	}
}

async function syncPlanFromJournal(
	repoRoot: string,
	track: Exclude<TrackId, "monorepo">,
	entry: JournalEntry,
): Promise<void> {
	const config = TRACK_CONFIG[track];
	const planPath = join(repoRoot, PLANS_DIR, `${track}.md`);

	let existingContext = "";
	let existingChecklist = "";
	let existingVerify = config.verifyCommand;

	try {
		const existing = await readFile(planPath, "utf8");
		existingContext = extractPlanSection(existing, "Context");
		existingChecklist = extractPlanSection(existing, "Checklist");
		existingVerify = extractVerifyCommand(existing) || config.verifyCommand;
	} catch {
		try {
			existingChecklist = extractChecklistSection(readFileSync(join(repoRoot, config.progressFile), "utf8"));
		} catch {
			existingChecklist = "";
		}
	}

	const planContent = formatPlanDocument(track, {
		phase: entry.phase_label,
		context: existingContext || buildContextHint(track, entry.phase_label),
		lastSession: entry.done,
		nextTask: entry.next_5min,
		fuzzy: entry.fuzzy,
		checklist: existingChecklist,
		verify: existingVerify,
	});

	const dir = join(repoRoot, PLANS_DIR);
	await mkdir(dir, { recursive: true });
	const tmp = `${planPath}.tmp`;
	await writeFile(tmp, planContent, "utf8");
	await rename(tmp, planPath);
}

async function syncLearnerFromJournal(
	repoRoot: string,
	track: Exclude<TrackId, "monorepo">,
	entry: JournalEntry,
): Promise<void> {
	const learner = await loadLearnerState(repoRoot);
	const next = {
		...learner,
		track,
		current_focus: entry.next_5min,
		updated_at: new Date().toISOString(),
	};
	await saveLearnerState(repoRoot, next);
}

interface LearnerState {
	track?: Exclude<TrackId, "monorepo">;
	current_focus?: string;
	session_length_min?: 25 | 45;
	energy?: "low" | "medium" | "high";
	updated_at?: string;
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

function formatPlanDocument(track: Exclude<TrackId, "monorepo">, plan: ParsedPlan): string {
	return [
		`# Progress plan · ${track}`,
		"",
		`> ${PLAN_MARKER} — auto-synced from journal. Edit via /socrates-plan or journal save.`,
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
		`**Verify:** \`${plan.verify.trim()}\``,
		"",
	].join("\n");
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

function buildContextHint(track: Exclude<TrackId, "monorepo">, phase: string): string {
	if (track === "rust-rag-learn") {
		if (/2|embed|store/i.test(phase)) return "STEPS.md Step 2–3 — embed.rs + store.rs (InMemoryVectorStore)";
		if (/1|chunk/i.test(phase)) return "STEPS.md Step 1 — chunk.rs";
		if (/3|retriev/i.test(phase)) return "STEPS.md Step 4 — retrieve.rs + search CLI";
		return "See rust-rag-learn/docs/STEPS.md for current step";
	}
	if (track === "rust-webgpu") return "See rust-webgpu/docs/STEPS.md";
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

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
