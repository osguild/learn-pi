/**
 * Dashboard HTTP server — one Node process at runtime serves the built SPA
 * (dashboard/dist) and a small JSON API over ~/.pi/learn.
 *
 * No runtime deps. Vite is dev/build-only; the extension imports this module
 * and boots the server in-process when the learner runs /learn-dashboard.
 *
 * Routes:
 *   GET  /                       -> dashboard/dist/index.html
 *   GET  /api/index              -> TrackIndex
 *   GET  /api/tracks              -> Track[]
 *   GET  /api/tracks/:id          -> Track
 *   GET  /api/sessions            -> SessionLogLine[] (cross-track, newest last)
 *   GET  /api/timer               -> TimerState (best-effort; null if absent)
 *   GET  /api/markdown?track=&url= -> MarkdownDocument (local .md under work_dir)
 *   GET  /api/docs/:slug           -> DashboardDoc (bundled dashboard docs)
 *
 * Binds 127.0.0.1 only — localhost visualization, not a network service.
 */

import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	addResource,
	addUnit,
	addYak,
	loadIndex,
	loadTrack,
	loadTrackOrThrow,
	listTrackIds,
	reviseCompass,
	resolveYak,
	saveTrack,
	setEdge,
	setNextAction,
	setOverview,
	setSessionMin,
	setVerifyCommand,
	updateUnit,
	type MaterialUnit,
	type ResourceKind,
	type SessionLogEntry,
	type Track,
	type TrackIndex,
	type TrackOverview,
} from "./track";
import { LEARN_ROOT, SESSIONS_LOG } from "./paths";
import { readMarkdownForTrack } from "./markdown-serve";
import { readDashboardDoc } from "./docs-serve";

export interface DashboardServerOptions {
	port?: number;
	host?: string;
	/** Filesystem dir containing the built SPA (dashboard/dist). */
	staticDir?: string;
	/** When the preferred port is busy, try successive ports up to this many attempts. */
	portScanLimit?: number;
}

export interface DashboardServer {
	server: Server;
	port: number;
	host: string;
	url: string;
	close(): Promise<void>;
}

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".map": "application/json; charset=utf-8",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

const REPO_ROOT = resolveRepoRoot();

function resolveRepoRoot(): string {
	// lib/dashboard.ts -> repo root is two levels up.
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..");
}

function defaultStaticDir(): string {
	return join(REPO_ROOT, "dashboard", "dist");
}

const DEFAULT_PORT = 7331;
const DEFAULT_PORT_SCAN_LIMIT = 20;

export function isAddrInUseError(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as NodeJS.ErrnoException).code === "EADDRINUSE"
	);
}

function resolvePreferredPort(port?: number): number {
	if (port !== undefined) return port;
	const envPort = Number(process.env.LEARN_DASHBOARD_PORT);
	return Number.isFinite(envPort) ? envPort : DEFAULT_PORT;
}

async function listenDashboardServer(
	host: string,
	port: number,
	staticDir: string,
): Promise<Server> {
	const server = createServer((req, res) => {
		void handle(req, res, staticDir);
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.removeListener("error", reject);
			resolve();
		});
	});

	return server;
}

export async function createDashboardServer(
	opts: DashboardServerOptions = {},
): Promise<DashboardServer> {
	const host = opts.host ?? "127.0.0.1";
	const startPort = resolvePreferredPort(opts.port);
	const staticDir = normalize(opts.staticDir ?? defaultStaticDir());
	const scanLimit = opts.portScanLimit ?? DEFAULT_PORT_SCAN_LIMIT;

	let lastError: unknown;
	for (let attempt = 0; attempt < scanLimit; attempt++) {
		const port = startPort + attempt;
		try {
			const httpServer = await listenDashboardServer(host, port, staticDir);
			return {
				server: httpServer,
				port,
				host,
				url: `http://${host}:${port}`,
				close: () =>
					new Promise<void>((resolve) => {
						httpServer.close(() => resolve());
					}),
			};
		} catch (err) {
			if (!isAddrInUseError(err)) throw err;
			lastError = err;
		}
	}

	const msg =
		lastError instanceof Error
			? lastError.message
			: `No free port in ${startPort}–${startPort + scanLimit - 1}`;
	throw new Error(msg);
}

async function handle(
	req: IncomingMessage,
	res: ServerResponse,
	staticDir: string,
): Promise<void> {
	const url = new URL(req.url ?? "/", "http://localhost");
	const pathname = url.pathname;

	try {
		if (pathname.startsWith("/api/")) {
			await apiRoute(req, pathname, url.searchParams, res);
			return;
		}
		await staticRoute(pathname, res, staticDir);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		sendJson(res, 500, { error: msg });
	}
}

// --- API --------------------------------------------------------------------

async function apiRoute(
	req: IncomingMessage,
	pathname: string,
	searchParams: URLSearchParams,
	res: ServerResponse,
): Promise<void> {
	if (pathname === "/api/index") {
		const idx = await loadIndex();
		sendJson(res, 200, idx);
		return;
	}
	if (pathname === "/api/tracks") {
		const ids = await listTrackIds();
		const tracks: Track[] = [];
		for (const id of ids) {
			const t = await loadTrack(id);
			if (t) tracks.push(t);
		}
		sendJson(res, 200, tracks);
		return;
	}
	const trackMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
	if (trackMatch) {
		const id = decodeURIComponent(trackMatch[1]);
		if (req.method === "PATCH") {
			await handlePatchTrack(id, req, res);
			return;
		}
		const t = await loadTrack(id);
		if (!t) {
			sendJson(res, 404, { error: `Track "${id}" not found` });
			return;
		}
		sendJson(res, 200, t);
		return;
	}
	if (pathname === "/api/sessions") {
		const lines = await readSessionsLog();
		sendJson(res, 200, lines);
		return;
	}
	if (pathname === "/api/timer") {
		const state = await readTimerState();
		if (!state) {
			sendJson(res, 200, null);
			return;
		}
		sendJson(res, 200, state);
		return;
	}
	if (pathname === "/api/markdown") {
		const trackId = searchParams.get("track");
		const url = searchParams.get("url");
		if (!trackId || !url) {
			sendJson(res, 400, { error: "Query params track and url are required" });
			return;
		}
		const track = await loadTrack(trackId);
		if (!track) {
			sendJson(res, 404, { error: `Track "${trackId}" not found` });
			return;
		}
		try {
			const doc = await readMarkdownForTrack(track, url);
			sendJson(res, 200, doc);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			sendJson(res, 403, { error: msg });
		}
		return;
	}
	const docMatch = pathname.match(/^\/api\/docs\/([^/]+)$/);
	if (docMatch) {
		const slug = decodeURIComponent(docMatch[1]).replace(/\.md$/, "");
		try {
			const doc = await readDashboardDoc(slug);
			sendJson(res, 200, doc);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const status = msg.includes("ENOENT") ? 404 : 400;
			sendJson(res, status, { error: msg });
		}
		return;
	}
	sendJson(res, 404, { error: `Unknown route ${pathname}` });
}

// --- PATCH /api/tracks/:id (writable dashboard) -----------------------------
//
// Generic patch endpoint for the dashboard. Body is a partial Track for
// scalar fields plus explicit op keys for collections. Only fields on the
// editable allowlist are honored; everything else is rejected with 400 so
// the dashboard can't accidentally (or be tricked into) writing computed
// fields like `log`, `stall_counter`, `id`, or `created_at`.
//
// All field updates go through the mutators in lib/track.ts, which are the
// single source of truth for per-field integrity rules — same path the CLI
// uses. We only persist via saveTrack (atomic tmp+rename), so a validation
// failure leaves the on-disk record untouched.

const MAX_PATCH_BODY_BYTES = 64 * 1024;

type UnitPatch = Partial<Pick<MaterialUnit, "title" | "status" | "difficulty" | "notes" | "prerequisites">>;

interface PatchTrackBody {
	// Scalar field replacements.
	edge?: { statement: string };
	next_action?: string;
	outcome_compass?: string;
	verify_command?: string | null;
	session_min?: number;
	overview?: TrackOverview;
	// Collection operations (applied in this order).
	add_unit?: { title: string };
	update_unit?: { id: string; patch: UnitPatch };
	add_resource?: { title: string; url: string; kind?: ResourceKind };
	add_yak?: { desc: string };
	resolve_yak?: { id: string };
}

const RESOURCE_KINDS: readonly ResourceKind[] = ["article", "doc", "video", "book", "paper", "repo", "other"];
const UNIT_STATUSES: readonly MaterialUnit["status"][] = ["pending", "active", "done", "skipped"];
const UNIT_DIFFICULTIES: readonly MaterialUnit["difficulty"][] = ["easy", "medium", "hard"];

async function readBody(req: IncomingMessage, limitBytes: number): Promise<string> {
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of req) {
		total += chunk.length;
		if (total > limitBytes) {
			throw new Error(`request body exceeds ${limitBytes} bytes`);
		}
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function isString(v: unknown): v is string {
	return typeof v === "string";
}
function isStringOrNull(v: unknown): v is string | null {
	return v === null || typeof v === "string";
}
function isNumber(v: unknown): v is number {
	return typeof v === "number" && Number.isFinite(v);
}
function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Validate the parsed body. Returns the coerced PatchTrackBody or throws. */
function validatePatchBody(raw: unknown): PatchTrackBody {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new Error("PATCH body must be a JSON object");
	}
	const obj = raw as Record<string, unknown>;
	const out: PatchTrackBody = {};
	const known = new Set([
		"edge", "next_action", "outcome_compass", "verify_command", "session_min", "overview",
		"add_unit", "update_unit", "add_resource", "add_yak", "resolve_yak",
	]);
	for (const key of Object.keys(obj)) {
		if (!known.has(key)) {
			throw new Error(`unknown field "${key}"; allowed: ${[...known].join(", ")}`);
		}
	}
	if ("edge" in obj) {
		const e = obj.edge;
		if (typeof e !== "object" || e === null || !isString((e as Record<string, unknown>).statement)) {
			throw new Error("edge must be { statement: string }");
		}
		out.edge = { statement: (e as { statement: string }).statement };
	}
	if ("next_action" in obj) {
		if (!isString(obj.next_action)) throw new Error("next_action must be a string");
		out.next_action = obj.next_action;
	}
	if ("outcome_compass" in obj) {
		if (!isString(obj.outcome_compass)) throw new Error("outcome_compass must be a string");
		out.outcome_compass = obj.outcome_compass;
	}
	if ("verify_command" in obj) {
		if (!isStringOrNull(obj.verify_command)) throw new Error("verify_command must be a string or null");
		out.verify_command = obj.verify_command;
	}
	if ("session_min" in obj) {
		if (!isNumber(obj.session_min) || obj.session_min <= 0) {
			throw new Error("session_min must be a positive number");
		}
		out.session_min = obj.session_min;
	}
	if ("overview" in obj) {
		const o = obj.overview;
		if (typeof o !== "object" || o === null || Array.isArray(o)) {
			throw new Error("overview must be an object");
		}
		const ov = o as Record<string, unknown>;
		if (!isString(ov.summary)) throw new Error("overview.summary must be a string");
		if (ov.learner_context !== undefined && !isString(ov.learner_context)) {
			throw new Error("overview.learner_context must be a string");
		}
		if (ov.approach !== undefined && !isString(ov.approach)) {
			throw new Error("overview.approach must be a string");
		}
		if (ov.learning_path !== undefined && !isString(ov.learning_path)) {
			throw new Error("overview.learning_path must be a string");
		}
		if (ov.set_at !== undefined && !isString(ov.set_at)) {
			throw new Error("overview.set_at must be a string");
		}
		if (ov.revised_at !== undefined && !isString(ov.revised_at)) {
			throw new Error("overview.revised_at must be a string");
		}
		const overview: TrackOverview = {
			summary: ov.summary,
			// setOverview prefers the existing track's set_at; this is just a
			// required placeholder for the TrackOverview type when the client omits it.
			set_at: isString(ov.set_at) ? ov.set_at : new Date().toISOString(),
		};
		if (isString(ov.learner_context)) overview.learner_context = ov.learner_context;
		if (isString(ov.approach)) overview.approach = ov.approach;
		if (isString(ov.learning_path)) overview.learning_path = ov.learning_path;
		if (isString(ov.revised_at)) overview.revised_at = ov.revised_at;
		out.overview = overview;
	}
	if ("add_unit" in obj) {
		const a = obj.add_unit;
		if (typeof a !== "object" || a === null || !isString((a as Record<string, unknown>).title)) {
			throw new Error("add_unit must be { title: string }");
		}
		out.add_unit = { title: (a as { title: string }).title };
	}
	if ("update_unit" in obj) {
		const u = obj.update_unit;
		if (typeof u !== "object" || u === null || !isString((u as Record<string, unknown>).id)) {
			throw new Error("update_unit must be { id: string, patch: ... }");
		}
		const ur = u as Record<string, unknown>;
		const patchRaw = ur.patch;
		if (typeof patchRaw !== "object" || patchRaw === null || Array.isArray(patchRaw)) {
			throw new Error("update_unit.patch must be an object");
		}
		const p = patchRaw as Record<string, unknown>;
		const patch: UnitPatch = {};
		if (p.title !== undefined) {
			if (!isString(p.title)) throw new Error("update_unit.patch.title must be a string");
			patch.title = p.title;
		}
		if (p.status !== undefined) {
			if (!isString(p.status) || !UNIT_STATUSES.includes(p.status as MaterialUnit["status"])) {
				throw new Error(`update_unit.patch.status must be one of ${UNIT_STATUSES.join(", ")}`);
			}
			patch.status = p.status as MaterialUnit["status"];
		}
		if (p.difficulty !== undefined) {
			if (!isString(p.difficulty) || !UNIT_DIFFICULTIES.includes(p.difficulty as MaterialUnit["difficulty"])) {
				throw new Error(`update_unit.patch.difficulty must be one of ${UNIT_DIFFICULTIES.join(", ")}`);
			}
			patch.difficulty = p.difficulty as MaterialUnit["difficulty"];
		}
		if (p.notes !== undefined) {
			if (!isString(p.notes)) throw new Error("update_unit.patch.notes must be a string");
			patch.notes = p.notes;
		}
		if (p.prerequisites !== undefined) {
			if (!isStringArray(p.prerequisites)) throw new Error("update_unit.patch.prerequisites must be a string[]");
			patch.prerequisites = p.prerequisites;
		}
		out.update_unit = { id: ur.id as string, patch };
	}
	if ("add_resource" in obj) {
		const a = obj.add_resource;
		if (typeof a !== "object" || a === null) throw new Error("add_resource must be an object");
		const ar = a as Record<string, unknown>;
		if (!isString(ar.title) || !isString(ar.url)) {
			throw new Error("add_resource must be { title: string, url: string, kind? }");
		}
		if (ar.kind !== undefined && (!isString(ar.kind) || !RESOURCE_KINDS.includes(ar.kind as ResourceKind))) {
			throw new Error(`add_resource.kind must be one of ${RESOURCE_KINDS.join(", ")}`);
		}
		out.add_resource = {
			title: ar.title,
			url: ar.url,
			kind: ar.kind as ResourceKind | undefined,
		};
	}
	if ("add_yak" in obj) {
		const a = obj.add_yak;
		if (typeof a !== "object" || a === null || !isString((a as Record<string, unknown>).desc)) {
			throw new Error("add_yak must be { desc: string }");
		}
		out.add_yak = { desc: (a as { desc: string }).desc };
	}
	if ("resolve_yak" in obj) {
		const r = obj.resolve_yak;
		if (typeof r !== "object" || r === null || !isString((r as Record<string, unknown>).id)) {
			throw new Error("resolve_yak must be { id: string }");
		}
		out.resolve_yak = { id: (r as { id: string }).id };
	}
	return out;
}

async function handlePatchTrack(
	id: string,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	let raw: string;
	try {
		raw = await readBody(req, MAX_PATCH_BODY_BYTES);
	} catch (err) {
		sendJson(res, 413, { error: err instanceof Error ? err.message : String(err) });
		return;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		sendJson(res, 400, { error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` });
		return;
	}
	let body: PatchTrackBody;
	try {
		body = validatePatchBody(parsed);
	} catch (err) {
		sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
		return;
	}

	let track: Track;
	try {
		track = await loadTrackOrThrow(id);
	} catch (err) {
		sendJson(res, 404, { error: err instanceof Error ? err.message : String(err) });
		return;
	}

	const now = new Date().toISOString();
	try {
		// Scalars first, then collections. Mutators throw on invalid input;
		// we don't save until all ops succeed, so a throw leaves the file unchanged.
		if (body.edge) track = setEdge(track, body.edge.statement, now);
		if (body.next_action !== undefined) track = setNextAction(track, body.next_action, now);
		if (body.outcome_compass !== undefined) track = reviseCompass(track, body.outcome_compass, now);
		if (body.verify_command !== undefined) track = setVerifyCommand(track, body.verify_command);
		if (body.session_min !== undefined) track = setSessionMin(track, body.session_min);
		if (body.overview) track = setOverview(track, body.overview, now);
		if (body.add_unit) track = addUnit(track, body.add_unit.title, now);
		if (body.update_unit) track = updateUnit(track, body.update_unit.id, body.update_unit.patch, now);
		if (body.add_resource) track = addResource(track, body.add_resource.title, body.add_resource.url, body.add_resource.kind);
		if (body.add_yak) track = addYak(track, body.add_yak.desc);
		if (body.resolve_yak) track = resolveYak(track, body.resolve_yak.id);
	} catch (err) {
		sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
		return;
	}

	await saveTrack(track);
	sendJson(res, 200, track);
}

async function readSessionsLog(): Promise<Array<SessionLogEntry & { track_id: string }>> {
	let raw: string;
	try {
		raw = await readFile(SESSIONS_LOG, "utf8");
	} catch {
		return [];
	}
	const out: Array<SessionLogEntry & { track_id: string }> = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			out.push(JSON.parse(trimmed) as SessionLogEntry & { track_id: string });
		} catch {
			// Skip malformed lines; the log is append-only and should be tolerant.
		}
	}
	return out;
}

async function readTimerState(): Promise<unknown | null> {
	// Timer state lives at ~/.pi/learn/timer/state.json (see extensions/learn-timer.ts).
	// We read it directly rather than importing the timer module, which keeps
	// its own in-memory state and ticks via setInterval — not what we want here.
	const stateFile = join(LEARN_ROOT, "timer", "state.json");
	try {
		const raw = await readFile(stateFile, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

// --- Static -----------------------------------------------------------------

async function staticRoute(
	pathname: string,
	res: ServerResponse,
	staticDir: string,
): Promise<void> {
	const safe = sanitizePath(pathname);
	let filePath = join(staticDir, safe);

	// If the path is a directory, serve index.html inside it (SPA fallback).
	try {
		const s = await stat(filePath);
		if (s.isDirectory()) {
			filePath = join(filePath, "index.html");
		}
	} catch {
		// Path doesn't exist; fall through to SPA index.html for client routing.
		filePath = join(staticDir, "index.html");
	}

	// If index.html itself is missing (dashboard not built yet), return a
	// helpful message instead of a 404 loop.
	try {
		await stat(filePath);
	} catch {
		res.statusCode = 503;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(missingBuildPage());
		return;
	}

	const mime = MIME[extname(filePath)] ?? "application/octet-stream";
	res.setHeader("Content-Type", mime);
	const stream = createReadStream(filePath);
	stream.on("error", () => {
		res.statusCode = 500;
		res.end("Internal error");
	});
	stream.pipe(res);
}

function sanitizePath(p: string): string {
	// Strip leading slash, prevent traversal.
	const stripped = p.replace(/^\/+/, "");
	const norm = normalize(stripped).replace(/^(\.\.[/\\])+/, "");
	return norm || "index.html";
}

function extname(p: string): string {
	const i = p.lastIndexOf(".");
	return i >= 0 ? p.slice(i) : "";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
}

function missingBuildPage(): string {
	return `<!doctype html><meta charset="utf-8"><title>learn-pi dashboard</title>
	<style>body{background:#0e1116;color:#e6edf3;font-family:system-ui;padding:40px;line-height:1.5}code{background:#1c232c;padding:2px 6px;border-radius:4px}</style>
	<h1>Dashboard not built yet</h1>
	<p>Run <code>pnpm dashboard:build</code> from the repo root, then restart <code>/learn-dashboard</code>.</p>`;
}

// --- Standalone entry (for dev: `tsx lib/dashboard.ts`) ---------------------

async function main(): Promise<void> {
	const envPort = Number(process.env.LEARN_DASHBOARD_PORT);
	const port = Number.isFinite(envPort) ? envPort : 7331;
	const srv = await createDashboardServer({ port });
	process.stderr.write(`learn-pi dashboard API on ${srv.url}\n`);
	const shutdown = async () => {
		await srv.close();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

const invokedDirectly =
	import.meta.url === `file://${process.argv[1]}` ||
	(import.meta.url.endsWith("/lib/dashboard.ts") && process.argv[1]?.endsWith("dashboard.ts"));

if (invokedDirectly) {
	void main();
}
