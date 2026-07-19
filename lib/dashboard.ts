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
	loadIndex,
	loadTrack,
	listTrackIds,
	type Track,
	type TrackIndex,
	type SessionLogEntry,
} from "./track";
import { LEARN_ROOT, SESSIONS_LOG } from "./paths";

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
			await apiRoute(pathname, res);
			return;
		}
		await staticRoute(pathname, res, staticDir);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		sendJson(res, 500, { error: msg });
	}
}

// --- API --------------------------------------------------------------------

async function apiRoute(pathname: string, res: ServerResponse): Promise<void> {
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
	sendJson(res, 404, { error: `Unknown route ${pathname}` });
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
