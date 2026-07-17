/**
 * Web search + fetch helpers for learn-pi.
 *
 * Two backends for search, selected automatically:
 *   1. Brave Search API  — when BRAVE_API_KEY is set (primary; pi's canonical
 *      example; free tier ~2000 queries/mo). Returns true web search results.
 *   2. DuckDuckGo Instant Answer API — zero-config fallback (no key). Returns
 *      abstract/related-topic results; lower coverage than Brave but works
 *      the moment the package is installed.
 *
 * web_fetch is a direct fetch() with a timeout, size cap, and minimal
 * HTML→text extraction (strip script/style/svg, strip tags, collapse
 * whitespace). No DOM dep — keeps the package dep-free.
 *
 * Secrets: the Brave key is read from process.env.BRAVE_API_KEY only. It is
 * never written to disk, never logged, never stored in a Track record.
 */

import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_FETCH_BYTES = 256 * 1024; // 256KB raw cap before text extraction
const MAX_TEXT_CHARS = 32_000; // cap extracted text so tool results stay sane
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DDG_ENDPOINT = "https://api.duckduckgo.com/";

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	source: "brave" | "duckduckgo";
}

export interface SearchOptions {
	count?: number; // desired result count (capped at 20)
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface FetchOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
	maxChars?: number;
}

export function braveKeyAvailable(): boolean {
	return typeof process.env.BRAVE_API_KEY === "string" && process.env.BRAVE_API_KEY.length > 0;
}

export function activeSearchBackend(): "brave" | "duckduckgo" {
	return braveKeyAvailable() ? "brave" : "duckduckgo";
}

/** Run a web search via the active backend. Throws on network/HTTP failure. */
export async function webSearch(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
	const count = Math.min(Math.max(opts.count ?? 8, 1), 20);
	if (braveKeyAvailable()) {
		return braveSearch(query, count, opts);
	}
	return duckDuckGoSearch(query, count, opts);
}

async function braveSearch(query: string, count: number, opts: SearchOptions): Promise<SearchResult[]> {
	const url = new URL(BRAVE_ENDPOINT);
	url.searchParams.set("q", query);
	url.searchParams.set("count", String(count));
	url.searchParams.set("country", "us");
	url.searchParams.set("safesearch", "moderate");

	const res = await fetchWithTimeout(url.toString(), {
		method: "GET",
		headers: {
			"Accept": "application/json",
			"Accept-Encoding": "gzip",
			"X-Subscription-Token": process.env.BRAVE_API_KEY ?? "",
		},
		signal: opts.signal,
		timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	if (!res.ok) {
		throw new Error(`Brave Search HTTP ${res.status}: ${await safeReadText(res)}`);
	}
	const data = (await res.json()) as BraveResponse;
	const results = data.web?.results ?? [];
	return results.slice(0, count).map((r) => ({
		title: r.title ?? "",
		url: r.url ?? "",
		snippet: r.description ?? r.meta_url?.op ?? "",
		source: "brave" as const,
	}));
}

async function duckDuckGoSearch(query: string, count: number, opts: SearchOptions): Promise<SearchResult[]> {
	const url = new URL(DDG_ENDPOINT);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	url.searchParams.set("no_html", "1");
	url.searchParams.set("skip_disambig", "1");

	const res = await fetchWithTimeout(url.toString(), {
		method: "GET",
		headers: { "Accept": "application/json" },
		signal: opts.signal,
		timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	if (!res.ok) {
		throw new Error(`DuckDuckGo HTTP ${res.status}: ${await safeReadText(res)}`);
	}
	const data = (await res.json()) as DDGResponse;
	const out: SearchResult[] = [];
	if (data.AbstractText && data.AbstractURL) {
		out.push({
			title: data.Heading || query,
			url: data.AbstractURL,
			snippet: data.AbstractText,
			source: "duckduckgo",
		});
	}
	for (const t of data.RelatedTopics ?? []) {
		if (out.length >= count) break;
		if (typeof t === "string") continue;
		if (t.Topics) {
			for (const sub of t.Topics) {
				if (out.length >= count) break;
				if (sub.Text && sub.FirstURL) {
					out.push({
						title: sub.Text.split(" - ")[0] ?? sub.Text,
						url: sub.FirstURL,
						snippet: sub.Text,
						source: "duckduckgo",
					});
				}
			}
		} else if (t.Text && t.FirstURL) {
			out.push({
				title: t.Text.split(" - ")[0] ?? t.Text,
				url: t.FirstURL,
				snippet: t.Text,
				source: "duckduckgo",
			});
		}
	}
	return out;
}

/** Fetch a URL and return extracted text. Throws on network/HTTP failure. */
export async function webFetch(url: string, opts: FetchOptions = {}): Promise<{ url: string; contentType: string; text: string; truncated: boolean }> {
	if (!/^https?:\/\//i.test(url)) {
		throw new Error(`web_fetch only supports http(s) URLs; got "${url}"`);
	}
	const res = await fetchWithTimeout(url, {
		method: "GET",
		headers: {
			"Accept": "text/html,application/json,text/plain,*/*",
			"User-Agent": "learn-pi/0.1 (https://github.com/osguild/learn-pi)",
		},
		signal: opts.signal,
		timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	if (!res.ok) {
		throw new Error(`web_fetch HTTP ${res.status} for ${url}`);
	}
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	const buf = await res.arrayBuffer();
	if (buf.byteLength > MAX_FETCH_BYTES) {
		// Still process it, but flag and cap the input first.
		const capped = Buffer.from(buf.slice(0, MAX_FETCH_BYTES)).toString("utf8");
		const { text, truncated } = extractText(capped, contentType, opts.maxChars ?? MAX_TEXT_CHARS);
		return { url, contentType, text, truncated: true || truncated };
	}
	const raw = Buffer.from(buf).toString("utf8");
	const { text, truncated } = extractText(raw, contentType, opts.maxChars ?? MAX_TEXT_CHARS);
	return { url, contentType, text, truncated };
}

/** Minimal HTML→text. No DOM dep. JSON passes through. */
export function extractText(raw: string, contentType: string, maxChars: number): { text: string; truncated: boolean } {
	const isJson = /json/i.test(contentType);
	if (isJson) {
		const text = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
		return { text, truncated: raw.length > maxChars };
	}
	const isHtml = /html/i.test(contentType) || /^\s*<(?:!doctype|html|head|body|div|p|h[1-6]|script|svg)/i.test(raw);
	if (!isHtml) {
		const text = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
		return { text, truncated: raw.length > maxChars };
	}
	// Drop script/style/svg/noscript blocks entirely.
	let s = raw.replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
	// Drop comments.
	s = s.replace(/<!--[\s\S]*?-->/g, " ");
	// Convert block-closing tags to newlines so text doesn't run together.
	s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|ul|ol|blockquote|pre)>/gi, "\n");
	s = s.replace(/<br\s*\/?>/gi, "\n");
	// Strip remaining tags.
	s = s.replace(/<[^>]+>/g, " ");
	// Decode the handful of HTML entities that matter for readability.
	s = decodeEntities(s);
	// Collapse whitespace per line, drop blank runs.
	s = s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").trim();
	const truncated = s.length > maxChars;
	return { text: truncated ? s.slice(0, maxChars) : s, truncated };
}

function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
	const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	const onParentAbort = () => ctrl.abort();
	if (init.signal) {
		if (init.signal.aborted) ctrl.abort();
		else init.signal.addEventListener("abort", onParentAbort, { once: true });
	}
	try {
		return await fetch(url, { ...init, signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
		if (init.signal) init.signal.removeEventListener("abort", onParentAbort);
	}
}

async function safeReadText(res: Response): Promise<string> {
	try {
		const t = await res.text();
		return t.length > 500 ? t.slice(0, 500) + "…" : t;
	} catch {
		return "(no body)";
	}
}

// Keep the delay import live for callers that want a polite pause between paged searches.
void delay;

// --- Backend response shapes (minimal, only fields used) -------------------

interface BraveResult {
	title?: string;
	url?: string;
	description?: string;
	meta_url?: { op?: string };
}
interface BraveResponse {
	web?: { results?: BraveResult[] };
}

interface DDGTopic {
	Text?: string;
	FirstURL?: string;
	Topics?: DDGTopic[];
}
interface DDGResponse {
	Heading?: string;
	AbstractText?: string;
	AbstractURL?: string;
	RelatedTopics?: (DDGTopic | string)[];
}
