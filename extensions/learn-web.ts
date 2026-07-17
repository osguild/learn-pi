/**
 * learn-web — registers web_search + web_fetch as LLM-callable tools, plus a
 * /learn-web status command.
 *
 * Why these are core (not optional): the package's research phase showed that
 * grounding the plan + the personalized-curriculum ingestion (#11) in CURRENT
 * material — not the model's training corpus — is a load-bearing requirement.
 * The 2026 PathBuilder paper (see research.md literature verification) makes
 * RAG-grounded decomposition a research-backed constraint for /learn-ingest.
 * web_fetch is the fetch half of that RAG path; web_search is the discovery
 * half. Both are exposed as tools so the agent can use them during research,
 * /learn-ingest, and any time the learner asks "what does current research
 * say about X."
 *
 * Backend: Brave Search API when BRAVE_API_KEY is set (primary); DuckDuckGo
 * Instant Answer API as a zero-config fallback. See lib/web.ts.
 *
 * Deferral: tool registration is deferred to session_start, where we check
 * pi.getAllTools() for an existing web_search / fetch_content / webfetch
 * registered by another extension (e.g. pi-web-access, the de-facto standard
 * with ~29K weekly downloads). If present, we skip our own tool registration
 * to avoid name collisions and let the richer surface own the web. The
 * /learn-web command is always registered (our own namespaced name) and its
 * search/fetch subcommands call lib/web.ts directly, so the human-facing
 * zero-config fallback still works even when we deferred the LLM tools.
 *
 * Commands:
 *   /learn-web           Show active backend + deferral state + a connectivity check
 *   /learn-web search <query>   Run a search from the command line (non-LLM path)
 *   /learn-web fetch <url>      Fetch + extract text from a URL (non-LLM path)
 *
 * Tools registered (LLM-callable, unless deferred):
 *   web_search   — query, count → results[{title,url,snippet,source}]
 *   web_fetch    — url → {url,contentType,text,truncated}
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	activeSearchBackend,
	braveKeyAvailable,
	webFetch,
	webSearch,
} from "../lib/web";

// Tool names that, if already registered by another extension, mean a richer
// web surface (e.g. pi-web-access) is present and we should defer our own
// tool registration to avoid collisions. We keep /learn-web (our command)
// either way — it calls lib/web.ts directly, not the LLM tool surface.
const DEFERRED_TOOL_NAMES = ["web_search", "fetch_content", "webfetch"] as const;

// Module-level deferral state, set on the first session_start. The /learn-web
// status command reads this to report whether we deferred.
let deferredTo: string | null = null;
let registeredOurTools = false;

function findExistingWebTool(pi: ExtensionAPI): string | null {
	const tools = pi.getAllTools();
	for (const name of DEFERRED_TOOL_NAMES) {
		if (tools.some((t) => t.name === name)) return name;
	}
	return null;
}

function registerLearnWebTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web for current information. Returns titles, URLs, and snippets. Use this when the learner asks about current research, when /learn-ingest needs to find source material, or when the answer depends on information newer than the training corpus. Backend is Brave Search if BRAVE_API_KEY is set, else DuckDuckGo Instant Answers.",
		promptSnippet: "Search the web for current information (Brave if key set, else DuckDuckGo)",
		promptGuidelines: [
			"Use web_search when the learner asks about current research, current best practices, or anything that may have changed since training — prefer it over relying on memory for time-sensitive facts.",
			"Use web_search before web_fetch when you don't already have a URL — search first, then fetch the most relevant result.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "The search query." }),
			count: Type.Optional(Type.Number({ description: "Max results to return (1-20, default 8)." })),
		}),
		async execute(_toolCallId, params, signal) {
			const query = String(params.query ?? "").trim();
			if (!query) throw new Error("web_search requires a non-empty 'query'");
			const count = typeof params.count === "number" ? params.count : undefined;
			const results = await webSearch(query, { count, signal: signal ?? undefined });
			const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`);
			const text = results.length === 0
				? `No results for "${query}" (backend: ${activeSearchBackend()}).`
				: `Web search (${activeSearchBackend()}) for "${query}" — ${results.length} result(s):\n\n${lines.join("\n\n")}`;
			return {
				content: [{ type: "text", text }],
				details: { query, backend: activeSearchBackend(), results },
			};
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch a URL and return extracted text (HTML stripped, ~32KB cap). Use after web_search to read a specific result, or when the learner gives a URL directly. Use for /learn-ingest source material, research lookups, or reading docs. Only http(s).",
		promptSnippet: "Fetch a URL and return extracted text (HTML→text, ~32KB cap)",
		promptGuidelines: [
			"Use web_fetch to read a specific URL from a web_search result or from the learner — do not fetch URLs you have not been asked to read.",
			"Prefer web_fetch over bash+curl for URLs: it extracts text, caps size, and respects timeouts cleanly.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "The absolute http(s) URL to fetch." }),
			maxChars: Type.Optional(Type.Number({ description: "Max characters of extracted text (default 32000)." })),
		}),
		async execute(_toolCallId, params, signal) {
			const url = String(params.url ?? "").trim();
			if (!url) throw new Error("web_fetch requires a non-empty 'url'");
			const maxChars = typeof params.maxChars === "number" ? params.maxChars : undefined;
			const result = await webFetch(url, { signal: signal ?? undefined, maxChars });
			const header = `Fetched ${result.url} (${result.contentType})${result.truncated ? " — TRUNCATED" : ""}:\n\n`;
			return {
				content: [{ type: "text", text: header + result.text }],
				details: result,
			};
		},
	});
}

export default function learnWeb(pi: ExtensionAPI) {
	// /learn-web command — always registered. Our own namespaced command name,
	// no collision risk. The search/fetch subcommands call lib/web.ts directly
	// so they work whether or not we deferred the LLM tools.
	pi.registerCommand("learn-web", {
		description: "Web tools status + direct search/fetch: /learn-web [search <q> | fetch <url>]",
		handler: async (args, ctx) => {
			await runCommand(args, ctx);
		},
	});

	// Tool registration is deferred to session_start so we can detect whether
	// another extension (e.g. pi-web-access) already registers web_search /
	// fetch_content / webfetch. If so, we skip our own to avoid tool-name
	// collisions and let the richer surface own the web. registerTool is
	// explicitly valid inside session_start (docs §pi.registerTool) and new
	// tools are refreshed immediately in the same session.
	pi.on("session_start", async () => {
		if (registeredOurTools) return;
		const existing = findExistingWebTool(pi);
		if (existing) {
			deferredTo = existing;
			return;
		}
		registerLearnWebTools(pi);
		registeredOurTools = true;
	});
}

async function runCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const sub = tokens[0] ?? "status";

	if (sub === "status") {
		const backend = activeSearchBackend();
		const brave = braveKeyAvailable();
		const toolLine = deferredTo
			? `  LLM tools: deferred to existing "${deferredTo}" (registered by another extension)`
			: "  LLM tools: web_search, web_fetch (registered by learn-pi)";
		const lines = [
			"learn-pi web tools",
			`  active search backend: ${backend}`,
			`  BRAVE_API_KEY: ${brave ? "set (Brave primary)" : "not set (using DuckDuckGo fallback)"}`,
			toolLine,
			"  /learn-web search|fetch: always available (calls lib/web.ts directly)",
			"",
			"To enable Brave Search: set BRAVE_API_KEY in your environment before starting pi.",
			"  export BRAVE_API_KEY=...  (or add to ~/.pi/agent/settings.json env)",
		];
		ctx.ui.notify(lines.join("\n"), "info");
		return;
	}

	if (sub === "search") {
		const query = tokens.slice(1).join(" ").trim();
		if (!query) {
			ctx.ui.notify("Usage: /learn-web search <query>", "warning");
			return;
		}
		ctx.ui.setStatus("learn-web", `Searching: ${query.slice(0, 40)}…`);
		try {
			const results = await webSearch(query, { count: 8 });
			ctx.ui.setStatus("learn-web", undefined);
			if (results.length === 0) {
				ctx.ui.notify(`No results for "${query}" (backend: ${activeSearchBackend()}).`, "info");
				return;
			}
			const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`);
			ctx.ui.notify(`Search (${activeSearchBackend()}): ${results.length} result(s)\n\n${lines.join("\n\n")}`, "info");
		} catch (err) {
			ctx.ui.setStatus("learn-web", undefined);
			ctx.ui.notify(`Search failed: ${(err as Error).message}`, "error");
		}
		return;
	}

	if (sub === "fetch") {
		const url = tokens[1];
		if (!url) {
			ctx.ui.notify("Usage: /learn-web fetch <url>", "warning");
			return;
		}
		ctx.ui.setStatus("learn-web", `Fetching: ${url.slice(0, 50)}…`);
		try {
			const result = await webFetch(url);
			ctx.ui.setStatus("learn-web", undefined);
			const header = `${result.url} (${result.contentType})${result.truncated ? " — truncated" : ""}`;
			ctx.ui.notify(`${header}\n\n${result.text.slice(0, 4000)}${result.text.length > 4000 ? "\n\n…(use the web_fetch tool for the full text)…" : ""}`, "info");
		} catch (err) {
			ctx.ui.setStatus("learn-web", undefined);
			ctx.ui.notify(`Fetch failed: ${(err as Error).message}`, "error");
		}
		return;
	}

	ctx.ui.notify(`Unknown subcommand "${sub}". Try: status, search <q>, fetch <url>`, "warning");
}
