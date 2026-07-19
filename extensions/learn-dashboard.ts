/**
 * learn-dashboard — local visualization of learn-pi state.
 *
 * Boots a single Node http server (lib/dashboard.ts) that serves the built
 * SPA (dashboard/dist) plus a JSON API over ~/.pi/learn. Vite is dev/build-
 * only; at runtime there are no extra deps.
 *
 * Commands:
 *   /learn-dashboard [start [port]]   Boot the server and open the browser.
 *   /learn-dashboard stop             Stop the running server.
 *   /learn-dashboard status            Show whether the server is running.
 *   /learn-dashboard open              Open the browser for a running server.
 *
 * Defaults:
 *   port: LEARN_DASHBOARD_PORT env or 7331
 *   bind: 127.0.0.1 (localhost only)
 *
 * If the preferred port is busy, start scans upward (7331 → 7332 → …).
 * Running start again without an explicit port closes the in-process server
 * and restarts on the next free port (previous port + 1, then scan).
 *
 * If dashboard/dist is missing, the server still starts but the root page
 * shows a "build first" message; the JSON API works regardless.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createDashboardServer, type DashboardServer } from "../lib/dashboard";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(REPO_ROOT, "dashboard", "dist");

let server: DashboardServer | null = null;

export default function learnDashboard(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-dashboard", {
		description: "Local dashboard: /learn-dashboard [start|stop|status|open] [port]",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "start";
	const portArg = tokens[1];

	switch (sub) {
		case "start":
			await cmdStart(portArg, ctx);
			break;
		case "stop":
			await cmdStop(ctx);
			break;
		case "status":
			cmdStatus(ctx);
			break;
		case "open":
			await cmdOpen(ctx);
			break;
		default:
			ctx.ui.notify(
				`Unknown subcommand "${sub}". Usage: /learn-dashboard [start|stop|status|open] [port]`,
				"error",
			);
	}
}

async function cmdStart(portArg: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
	let preferredPort: number | undefined;
	if (portArg) {
		preferredPort = Number(portArg);
	} else {
		const envPort = Number(process.env.LEARN_DASHBOARD_PORT);
		preferredPort = Number.isFinite(envPort) ? envPort : 7331;
	}

	if (server) {
		if (!portArg) {
			preferredPort = server.port + 1;
		}
		await server.close();
		server = null;
	}

	if (!existsSync(DIST_DIR)) {
		ctx.ui.notify(
			[
				"Dashboard not built yet. Run from the repo root:",
				"  pnpm dashboard:build",
				"then /learn-dashboard start again.",
				"(The JSON API will still work in dev via pnpm dashboard:dev.)",
			].join("\n"),
			"warning",
		);
	}
	if (!Number.isFinite(preferredPort) || preferredPort <= 0 || preferredPort > 65535) {
		ctx.ui.notify(`Invalid port "${portArg}".`, "error");
		return;
	}
	const requestedPort = preferredPort;
	try {
		server = await createDashboardServer({ port: preferredPort });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`Failed to start dashboard: ${msg}`, "error");
		return;
	}
	if (server.port !== requestedPort) {
		ctx.ui.notify(
			`Port ${requestedPort} in use — learn-pi dashboard: ${server.url}`,
			"info",
		);
	} else {
		ctx.ui.notify(`learn-pi dashboard: ${server.url}`, "info");
	}
	openBrowser(server.url);
}

async function cmdStop(ctx: ExtensionCommandContext): Promise<void> {
	if (!server) {
		ctx.ui.notify("Dashboard not running.", "info");
		return;
	}
	await server.close();
	server = null;
	ctx.ui.notify("Dashboard stopped.", "info");
}

function cmdStatus(ctx: ExtensionCommandContext): void {
	if (server) {
		ctx.ui.notify(`Dashboard running at ${server.url}`, "info");
	} else {
		ctx.ui.notify("Dashboard not running.", "info");
	}
}

async function cmdOpen(ctx: ExtensionCommandContext): Promise<void> {
	if (!server) {
		ctx.ui.notify("Dashboard not running. Start it with /learn-dashboard start.", "info");
		return;
	}
	openBrowser(server.url);
	ctx.ui.notify(`Opening ${server.url}`, "info");
}

function openBrowser(url: string): void {
	// Best-effort; non-fatal if it fails (headless, non-darwin, etc.).
	try {
		if (process.platform === "darwin") {
			spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
		} else if (process.platform === "linux") {
			spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
		} else if (process.platform === "win32") {
			spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
		}
	} catch {
		// The URL is already printed; the learner can open it manually.
	}
}
