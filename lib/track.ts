/**
 * Track record — the single source of truth for a learning track.
 *
 * Per DESIGN.md: every mechanism reads/writes one record. The integrity rules
 * are enforced here so no caller can produce an invalid Track:
 *   1. next_action is never empty for an active track.
 *   2. edge.statement and next_action update together in reflect.
 *   3. outcome_compass is never gated on (read-only visibility).
 *   4. stall_counter increments on a no-progress session, resets on progress.
 *
 * All writes are atomic (tmp + rename). No network, no cloud.
 */

import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	INDEX_FILE,
	LEARN_ROOT,
	SESSIONS_LOG,
	TRACKS_DIR,
	trackFile,
} from "./paths";
import { buildRubric } from "./study-plan";

// --- Types ------------------------------------------------------------------

export type Energy = "low" | "medium" | "high";

export interface CueConfig {
	/** "weekday" | "daily" | "once" — drives launchd calendar spec generation. */
	kind: "weekday" | "daily" | "once";
	/** "HH:MM" 24h, local time. */
	time: string;
	/** For "weekday": subset of mon..sun. */
	days?: string[];
	/** For "once": ISO date-time. */
	at?: string;
}

export interface ProcessContract {
	cue: CueConfig | null;
	session_min: number;
	reward: string;
}

export interface Edge {
	statement: string;
	set_at: string;
	sessions_at_edge: number;
}

export interface Yak {
	id: string;
	desc: string;
	added_at: string;
	resolved: boolean;
}

/**
 * A reading/viewing resource attached to a track or to a single material unit.
 * Track-level resources cover background reading not tied to any unit; unit-
 * level resources travel with their unit and surface when that unit is active.
 */
export type ResourceKind = "article" | "doc" | "video" | "book" | "paper" | "repo" | "other";

export interface Resource {
	id: string;
	title: string;
	url: string;
	kind?: ResourceKind;
	added_at: string;
	note?: string;
}

export interface MaterialUnit {
	id: string;
	title: string;
	prerequisites: string[];
	difficulty: "easy" | "medium" | "hard";
	status: "pending" | "active" | "done" | "skipped";
	notes?: string;
	/** Per-unit reading resources; travel with this unit. */
	resources?: Resource[];
}

export interface MaterialGraph {
	source: string | null;
	units: MaterialUnit[];
	revised_at: string | null;
}

/**
 * Track-level context captured at scaffold/plan time: learner background,
 * learning approach, and a high-level lesson plan. Visibility only — not
 * gated on progress (like outcome_compass).
 */
export interface TrackOverview {
	/** One-paragraph abstract: what this track is and what success looks like. */
	summary: string;
	/** Learner background and gaps that affect pacing. */
	learner_context?: string;
	/** How sessions should feel (code-first, theory interleaved, …). */
	approach?: string;
	/** High-level sequenced plan — complements material_graph.units. */
	learning_path?: string;
	set_at: string;
	revised_at?: string;
}

export interface SessionLogEntry {
	id: string;
	at: string;
	minutes: number;
	edge_before: string;
	edge_crossed: boolean;
	new_edge: string | null;
	next_action_after: string;
	outcome_compass_revised: boolean;
	yaks: string[];
	cued: boolean;
	note: string;
}

/**
 * Wizard-originated depth target. Set by `/learn-scaffold` (generic wizard path)
 * and surfaced by `/learn-status`. Not gated on; visibility only.
 *   - guided:      frameworks do the work, learner studies the concepts.
 *   - standard:    use frameworks, understand their internals.
 *   - from-scratch: build the primitive yourself, no high-level library.
 */
export type Depth = "guided" | "standard" | "from-scratch";

/**
 * Which scaffolder created the track. Older track files on disk that predate
 * this field load as `undefined` — readers should treat undefined as
 * `"programming"` (the original surface). `freshTrack` defaults it to
 * `"programming"` when omitted.
 */
export type TrackKind = "programming" | "study";

/**
 * Study-track depth (the non-coding analog of `Depth`). Set by `/learn-study`.
 *   - appreciation: follow along, understand the shape of the field, no production.
 *   - practitioner: do the thing competently (play songs, hold conversations).
 *   - mastery:      deep/original work (compose, fluent+idiomatic, synthesize an argument).
 */
export type StudyDepth = "appreciation" | "practitioner" | "mastery";

export interface Track {
	id: string;
	label: string;
	outcome_compass: string;
	outcome_compass_revised_at: string;
	/** Learner context + high-level lesson plan (set at scaffold/plan time). */
	overview?: TrackOverview | null;
	process_contract: ProcessContract;
	work_dir: string;
	verify_command: string | null;
	edge: Edge;
	next_action: string;
	next_action_set_at: string;
	deferred_yaks: Yak[];
	/** Track-level reading resources not tied to a specific material unit. */
	resources: Resource[];
	material_graph: MaterialGraph;
	log: SessionLogEntry[];
	stall_counter: number;
	last_session_at: string | null;
	created_at: string;
	/** "active" | "paused" | "archived" — learner-facing state, never gated on. */
	status: "active" | "paused" | "archived";
	/** Wizard depth target (optional; recipe-scaffolded tracks leave this unset). */
	depth?: Depth;
	/** Wizard-recommended stack, e.g. ["python", "pytorch"]. Visibility only. */
	recommended_stack?: string[];
	/**
	 * True when `edge.statement` was set by the wizard as a *suggestion* the
	 * learner has not yet accepted. `/learn-plan edge` clears it. Lets
	 * `/learn-plan show` prompt "accept / revise / replace?" without
	 * short-circuiting the forethought step.
	 */
	edge_suggested?: boolean;
	/** Which scaffolder created the track. Undefined on old files = "programming". */
	track_kind?: TrackKind;
	/** Study-track depth (set by `/learn-study`; programming tracks leave unset). */
	study_depth?: StudyDepth;
	/** Domain family for study tracks (drives rubric regeneration on edge change). */
	domain_family?: "language" | "music" | "history" | "math" | "science";
	/** Recommended learning approach for study tracks (visibility only). */
	approach?: string;
	/**
	 * Self-assessment rubric for the CURRENT edge (study tracks only). 2–3
	 * questions answered on a 0–2 scale during `/learn-reflect`, feeding
	 * stall_counter the same way a failing `verify_command` would for a
	 * programming track. Regenerated whenever the edge changes.
	 */
	rubric?: string[];
}

export interface TrackIndex {
	active_track_id: string | null;
	tracks: Array<{ id: string; label: string; last_session_at: string | null; status: Track["status"] }>;
}

// --- Defaults ---------------------------------------------------------------

export function emptyProcessContract(): ProcessContract {
	return { cue: null, session_min: 45, reward: "log + 5min decompression" };
}

export function freshTrack(partial: Partial<Track> & Pick<Track, "id" | "label">): Track {
	const now = new Date().toISOString();
	const placeholder = "(not set — run /learn-plan to set the current edge)";
	return {
		outcome_compass: partial.outcome_compass ?? "",
		outcome_compass_revised_at: partial.outcome_compass_revised_at ?? now,
		overview: partial.overview ?? null,
		process_contract: partial.process_contract ?? emptyProcessContract(),
		work_dir: partial.work_dir ?? "",
		verify_command: partial.verify_command ?? null,
		edge: partial.edge ?? { statement: placeholder, set_at: now, sessions_at_edge: 0 },
		next_action: partial.next_action ?? "(not set — run /learn-plan to set the next concrete action)",
		next_action_set_at: partial.next_action_set_at ?? now,
		deferred_yaks: partial.deferred_yaks ?? [],
		resources: partial.resources ?? [],
		material_graph: partial.material_graph ?? { source: null, units: [], revised_at: null },
		log: partial.log ?? [],
		stall_counter: partial.stall_counter ?? 0,
		last_session_at: partial.last_session_at ?? null,
		created_at: partial.created_at ?? now,
		status: partial.status ?? "active",
		depth: partial.depth,
		recommended_stack: partial.recommended_stack,
		edge_suggested: partial.edge_suggested ?? false,
		track_kind: partial.track_kind ?? "programming",
		study_depth: partial.study_depth,
		domain_family: partial.domain_family,
		approach: partial.approach,
		rubric: partial.rubric,
		...partial,
	} as Track;
}

// --- I/O --------------------------------------------------------------------

export async function ensureLearnRoot(): Promise<void> {
	await mkdir(TRACKS_DIR, { recursive: true });
	await mkdir(dirname(SESSIONS_LOG), { recursive: true });
	await mkdir(dirname(INDEX_FILE), { recursive: true });
}

async function atomicWrite(path: string, contents: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, contents, "utf8");
	await rename(tmp, path);
}

export async function trackExists(trackId: string): Promise<boolean> {
	try {
		await access(trackFile(trackId));
		return true;
	} catch {
		return false;
	}
}

export async function loadTrack(trackId: string): Promise<Track | null> {
	try {
		const raw = await readFile(trackFile(trackId), "utf8");
		return JSON.parse(raw) as Track;
	} catch {
		return null;
	}
}

export async function loadTrackOrThrow(trackId: string): Promise<Track> {
	const t = await loadTrack(trackId);
	if (!t) throw new Error(`Track "${trackId}" not found at ${trackFile(trackId)}`);
	return t;
}

/**
 * Persist a Track atomically and update the index summary.
 * Does NOT enforce integrity rules beyond shape — callers (learn-plan, learn-reflect)
 * are responsible for the semantic rules. This function is the single write path.
 */
export async function saveTrack(track: Track): Promise<void> {
	await ensureLearnRoot();
	await atomicWrite(trackFile(track.id), JSON.stringify(track, null, 2) + "\n");
	await upsertIndex(track);
}

export async function listTrackIds(): Promise<string[]> {
	const index = await loadIndex();
	return index.tracks.map((t) => t.id);
}

export async function loadIndex(): Promise<TrackIndex> {
	try {
		const raw = await readFile(INDEX_FILE, "utf8");
		return JSON.parse(raw) as TrackIndex;
	} catch {
		return { active_track_id: null, tracks: [] };
	}
}

export async function saveIndex(index: TrackIndex): Promise<void> {
	await ensureLearnRoot();
	await atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2) + "\n");
}

async function upsertIndex(track: Track): Promise<void> {
	const index = await loadIndex();
	const rest = index.tracks.filter((t) => t.id !== track.id);
	index.tracks = [
		...rest,
		{
			id: track.id,
			label: track.label,
			last_session_at: track.last_session_at,
			status: track.status,
		},
	].sort((a, b) => a.label.localeCompare(b.label));
	await saveIndex(index);
}

export async function setActiveTrack(trackId: string): Promise<void> {
	const index = await loadIndex();
	index.active_track_id = trackId;
	await saveIndex(index);
}

export async function getActiveTrack(): Promise<Track | null> {
	const index = await loadIndex();
	if (!index.active_track_id) return null;
	return loadTrack(index.active_track_id);
}

// --- Append-only session log (mirror of Track.log for cross-track queries) --

export async function appendSessionLog(entry: SessionLogEntry, trackId: string): Promise<void> {
	await ensureLearnRoot();
	const line = JSON.stringify({ ...entry, track_id: trackId }) + "\n";
	await mkdir(dirname(SESSIONS_LOG), { recursive: true });
	// appendFile is atomic for small writes on local FS.
	const { appendFile } = await import("node:fs/promises");
	await appendFile(SESSIONS_LOG, line, "utf8");
}

// --- Mutations (the canonical update helpers) -------------------------------

export function newYak(desc: string): Yak {
	return { id: `yak-${randomUUID().slice(0, 8)}`, desc, added_at: new Date().toISOString(), resolved: false };
}

export function newResource(title: string, url: string, kind?: ResourceKind): Resource {
	return {
		id: `res-${randomUUID().slice(0, 8)}`,
		title,
		url,
		kind,
		added_at: new Date().toISOString(),
	};
}

export function newUnit(title: string): MaterialUnit {
	return {
		id: `unit-${randomUUID().slice(0, 8)}`,
		title,
		prerequisites: [],
		difficulty: "medium",
		status: "pending",
	};
}

/**
 * Record a session's reflection outcome. Enforces integrity rules 1, 2, 4.
 * Returns the updated Track. Caller is responsible for persisting via saveTrack.
 */
export function applyReflection(
	track: Track,
	input: {
		minutes: number;
		edgeBefore: string;
		edgeCrossed: boolean;
		newEdge: string | null;
		nextActionAfter: string;
		outcomeCompassRevised: boolean;
		newOutcomeCompass: string | null;
		yaksResolved: string[];
		yaksAdded: Yak[];
		cued: boolean;
		note: string;
	},
): Track {
	const now = new Date().toISOString();
	const nextAction = input.nextActionAfter.trim() || track.next_action; // rule 1: never empty

	// rule 4: stall counter — progress = edge crossed OR a yak resolved.
	const progressed = input.edgeCrossed || input.yaksResolved.length > 0;
	const stallCounter = progressed ? 0 : track.stall_counter + 1;

	// rule 2: edge + next_action move together.
	const edge: Edge = input.edgeCrossed && input.newEdge
		? { statement: input.newEdge, set_at: now, sessions_at_edge: 0 }
		: { ...track.edge, sessions_at_edge: track.edge.sessions_at_edge + 1 };

	const resolvedSet = new Set(input.yaksResolved);
	const deferred_yaks = [
		...track.deferred_yaks.map((y) => (resolvedSet.has(y.id) ? { ...y, resolved: true } : y)),
		...input.yaksAdded,
	];

	const outcome_compass = input.outcomeCompassRevised && input.newOutcomeCompass
		? input.newOutcomeCompass
		: track.outcome_compass;
	const outcome_compass_revised_at = input.outcomeCompassRevised ? now : track.outcome_compass_revised_at;

	const entry: SessionLogEntry = {
		id: `sess-${randomUUID().slice(0, 8)}`,
		at: now,
		minutes: input.minutes,
		edge_before: input.edgeBefore,
		edge_crossed: input.edgeCrossed,
		new_edge: input.newEdge,
		next_action_after: nextAction,
		outcome_compass_revised: input.outcomeCompassRevised,
		yaks: [...input.yaksResolved, ...input.yaksAdded.map((y) => y.id)],
		cued: input.cued,
		note: input.note,
	};

	return {
		...track,
		edge,
		next_action: nextAction,
		next_action_set_at: now,
		deferred_yaks,
		outcome_compass,
		outcome_compass_revised_at,
		stall_counter: stallCounter,
		last_session_at: now,
		log: [...track.log, entry],
	};
}

/** Threshold for the double-loop (Argyris) question in /learn-reflect. */
export const STALL_THRESHOLD = 3;

/**
 * Read `track_kind` treating undefined (old track files) as "programming".
 * Use this everywhere a reader branches on track kind.
 */
export function trackKind(track: Track): TrackKind {
	return track.track_kind ?? "programming";
}

// --- Field mutators (shared by CLI extensions and the dashboard API) --------
//
// These encapsulate the per-field integrity rules so `/learn-plan` and the
// dashboard's `PATCH /api/tracks/:id` route cannot drift. Each returns a new
// Track; callers persist via `saveTrack`. Pure (no I/O; `now` is passed in
// so tests are deterministic).
//
// Rule reminder (from DESIGN.md):
//   1. next_action is never empty for an active track.
//   2. edge.statement and next_action update together in `applyReflection` —
//      but a standalone edge edit (CLI or dashboard) is NOT a reflection; it
//      resets `sessions_at_edge`, clears `edge_suggested`, and leaves
//      `next_action` alone (the learner sets it separately).
//   4. stall_counter is computed in `applyReflection`, never here.

/** Optional hook: for study tracks, regenerate the rubric when the edge changes. */
export type RubricRegenerator = (domainFamily: string, edge: string) => string[] | undefined;

export function setEdge(
	track: Track,
	statement: string,
	now: string,
	regenerateRubric?: RubricRegenerator,
): Track {
	const trimmed = statement.trim();
	if (!trimmed) throw new Error("edge statement must be non-empty");
	const updated: Track = {
		...track,
		edge: { statement: trimmed, set_at: now, sessions_at_edge: 0 },
		edge_suggested: false,
	};
	// Study tracks: regenerate the rubric for the new edge (the rubric is the
	// study-track analog of verify_command — it must track the edge). Callers
	// may override the regenerator (e.g. tests); default is `buildRubric`.
	if (trackKind(track) === "study" && track.domain_family) {
		const rubric = regenerateRubric
			? regenerateRubric(track.domain_family, trimmed)
			: buildRubric(track.domain_family, trimmed);
		if (rubric) return { ...updated, rubric };
	}
	return updated;
}

export function setNextAction(track: Track, action: string, now: string): Track {
	const trimmed = action.trim();
	if (track.status === "active" && !trimmed) {
		throw new Error("next_action cannot be empty for an active track");
	}
	return { ...track, next_action: trimmed, next_action_set_at: now };
}

export function reviseCompass(track: Track, text: string, now: string): Track {
	return { ...track, outcome_compass: text, outcome_compass_revised_at: now };
}

export function setVerifyCommand(track: Track, command: string | null): Track {
	return { ...track, verify_command: command };
}

export function setSessionMin(track: Track, minutes: number): Track {
	if (!Number.isFinite(minutes) || minutes <= 0) {
		throw new Error(`session_min must be a positive number, got ${minutes}`);
	}
	return {
		...track,
		process_contract: { ...track.process_contract, session_min: Math.floor(minutes) },
	};
}

export function setOverview(track: Track, overview: TrackOverview, now: string): Track {
	const wasSet = Boolean(track.overview);
	return {
		...track,
		overview: {
			...overview,
			set_at: track.overview?.set_at ?? overview.set_at ?? now,
			revised_at: wasSet ? now : overview.revised_at,
		},
	};
}

export function addUnit(track: Track, title: string, now: string): Track {
	const trimmed = title.trim();
	if (!trimmed) throw new Error("unit title must be non-empty");
	const unit = newUnit(trimmed);
	return {
		...track,
		material_graph: {
			...track.material_graph,
			units: [...track.material_graph.units, unit],
			revised_at: now,
		},
	};
}

export function updateUnit(
	track: Track,
	unitId: string,
	patch: Partial<Pick<MaterialUnit, "title" | "status" | "difficulty" | "notes" | "prerequisites">>,
	now: string,
): Track {
	let found = false;
	const units = track.material_graph.units.map((u) => {
		if (u.id !== unitId) return u;
		found = true;
		return { ...u, ...patch };
	});
	if (!found) throw new Error(`unit "${unitId}" not found`);
	return {
		...track,
		material_graph: { ...track.material_graph, units, revised_at: now },
	};
}

export function addResource(track: Track, title: string, url: string, kind?: ResourceKind): Track {
	const t = title.trim();
	const u = url.trim();
	if (!t || !u) throw new Error("resource title and url are required");
	const resource = newResource(t, u, kind);
	return { ...track, resources: [...track.resources, resource] };
}

export function addYak(track: Track, desc: string): Track {
	const d = desc.trim();
	if (!d) throw new Error("yak description must be non-empty");
	const yak = newYak(d);
	return { ...track, deferred_yaks: [...track.deferred_yaks, yak] };
}

export function resolveYak(track: Track, yakId: string): Track {
	let found = false;
	const deferred_yaks = track.deferred_yaks.map((y) => {
		if (y.id !== yakId) return y;
		found = true;
		return { ...y, resolved: true };
	});
	if (!found) throw new Error(`yak "${yakId}" not found`);
	return { ...track, deferred_yaks };
}
