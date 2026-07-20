/**
 * Scan track and unit resources for glossary terms in local markdown docs.
 *
 * Targets unit-guide style docs: bold terms, colon/em-dash definitions, and
 * numbered claim bullets in "What you need to know" (and math appendix).
 */

import { readMarkdownForTrack } from "./markdown-serve";
import { addGlossaryEntry, type GlossaryEntry, type Resource, type Track } from "./track";

export interface ScannedGlossaryCandidate {
	term: string;
	definition: string;
	source: string;
	unit_id?: string;
}

export interface GlossaryScanResult {
	track: Track;
	added: GlossaryEntry[];
	skipped: { term: string; reason: string }[];
	scanned_resources: number;
}

const SKIP_TERM = /^(material unit|difficulty|prerequisites|further reading|optional)$/i;
const METADATA_LINE = /^\*\*(Material unit|Difficulty|Prerequisites):/i;

function normalizeTermKey(term: string): string {
	return term.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripMarkdownLinks(text: string): string {
	return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function cleanDefinition(text: string): string {
	let def = stripMarkdownLinks(text)
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/\s+/g, " ")
		.trim();
	def = def.replace(/^[—–-]\s*/, "").replace(/\.$/, "");
	if (def.length > 320) def = `${def.slice(0, 317).trim()}…`;
	return def;
}

function cleanTerm(text: string): string {
	const term = stripMarkdownLinks(text).replace(/\*\*/g, "").replace(/`/g, "").trim();
	return term.replace(/[.:]$/, "");
}

function isValidTerm(term: string): boolean {
	if (!term || SKIP_TERM.test(term)) return false;
	if (/^[,;:.]|[,;]$/.test(term)) return false;
	if (term.includes("|")) return false;
	if (/^https?:\/\//i.test(term)) return false;
	if (term.length < 2 && !/[|⟨⟩]/.test(term)) return false;
	if (term.length < 3 && !/^(H|X|Z|Y|\|0⟩|\|1⟩|\|ψ⟩)$/.test(term)) return false;
	if (/^\d/.test(term) && !/^P\(/.test(term)) return false;
	return true;
}

function isValidDefinition(definition: string): boolean {
	if (definition.length < 12) return false;
	if (definition.includes("| ") && definition.includes(" | ")) return false;
	if (/^-\s/.test(definition)) return false;
	return true;
}

function pushCandidate(
	out: ScannedGlossaryCandidate[],
	seen: Set<string>,
	term: string,
	definition: string,
	source: string,
	unit_id?: string,
): void {
	const cleanedTerm = cleanTerm(term);
	const cleanedDef = cleanDefinition(definition);
	if (!isValidTerm(cleanedTerm) || !isValidDefinition(cleanedDef)) return;
	const key = normalizeTermKey(cleanedTerm.replace(/\.$/, ""));
	if (seen.has(key)) return;
	seen.add(key);
	out.push({ term: cleanedTerm, definition: cleanedDef, source, unit_id });
}

function sectionSlice(content: string, heading: string): string {
	const re = new RegExp(`^## ${heading}\\s*$`, "im");
	const match = re.exec(content);
	if (!match) return "";
	const start = match.index + match[0].length;
	const rest = content.slice(start);
	const next = rest.search(/^## /m);
	return next === -1 ? rest : rest.slice(0, next);
}

function stripCodeBlocks(text: string): string {
	return text.replace(/```[\s\S]*?```/g, "\n");
}

function extractFromLine(
	line: string,
	source: string,
	unit_id: string | undefined,
	out: ScannedGlossaryCandidate[],
	seen: Set<string>,
): void {
	const trimmed = line.trim();
	if (!trimmed || METADATA_LINE.test(trimmed) || trimmed.startsWith("|")) return;

	// **Term.** definition (math appendix style)
	const dotLead = trimmed.match(/^\*\*([^*]+)\.\*\*\s*(.+)$/);
	if (dotLead) {
		pushCandidate(out, seen, dotLead[1], dotLead[2], source, unit_id);
		return;
	}

	// **Term:** definition (colon inside or outside bold)
	const colon = trimmed.match(/^\*\*([^*]+?):?\*\*\s*(.+)$/);
	if (colon) {
		pushCandidate(out, seen, colon[1], colon[2], source, unit_id);
		return;
	}

	// **Term** — definition  (or hyphen)
	const dash = trimmed.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/);
	if (dash) {
		pushCandidate(out, seen, dash[1], dash[2], source, unit_id);
		return;
	}

	// 1. **Term (qualifier):** definition
	const numbered = trimmed.match(/^\d+\.\s+\*\*([^*]+)\*\*:?\s*(.+)$/);
	if (numbered) {
		pushCandidate(out, seen, numbered[1], numbered[2], source, unit_id);
		return;
	}

	// **Term** is/are/was ... (sentence lead)
	const lead = trimmed.match(/^\*\*([^*]+)\*\*\s+(is|are|was|were|means|creates|puts|does|can|will|has|have)\b(.+)$/i);
	if (lead) {
		const sentence = `${lead[1]} ${lead[2]}${lead[3]}`.replace(/\s+/g, " ").trim();
		pushCandidate(out, seen, lead[1], sentence, source, unit_id);
		return;
	}

	// Mid-line **term** is … (e.g. "A **qubit** is the basic unit")
	const midIs = trimmed.match(/(?:^|\s)([A-Za-z]*)?\s*\*\*([^*]+)\*\*\s+is\b(.+)$/i);
	if (midIs) {
		const prefix = midIs[1] ? `${midIs[1]} ` : "";
		const sentence = `${prefix}${midIs[2]} is${midIs[3]}`.replace(/\s+/g, " ").trim();
		pushCandidate(out, seen, midIs[2], sentence, source, unit_id);
	}
}

function extractFromParagraph(
	paragraph: string,
	source: string,
	unit_id: string | undefined,
	out: ScannedGlossaryCandidate[],
	seen: Set<string>,
): void {
	for (const line of paragraph.split("\n")) {
		extractFromLine(line, source, unit_id, out, seen);
	}
}

export function extractGlossaryFromMarkdown(
	content: string,
	source: string,
	unit_id?: string,
): ScannedGlossaryCandidate[] {
	const out: ScannedGlossaryCandidate[] = [];
	const seen = new Set<string>();

	const sections = [
		sectionSlice(content, "What you need to know"),
		sectionSlice(content, "Math appendix"),
	].filter(Boolean);

	const body = sections.length > 0 ? sections.join("\n\n") : content;
	const stripped = stripCodeBlocks(body);

	for (const block of stripped.split(/\n\s*\n/)) {
		extractFromParagraph(block.trim(), source, unit_id, out, seen);
	}

	return out;
}

interface ResourceRef {
	resource: Resource;
	unit_id?: string;
}

function collectMarkdownResources(track: Track): ResourceRef[] {
	const out: ResourceRef[] = [];
	for (const r of track.resources ?? []) {
		if (r.url.startsWith("file://") && /\.(?:md|markdown)$/i.test(r.url)) {
			out.push({ resource: r });
		}
	}
	for (const unit of track.material_graph?.units ?? []) {
		for (const r of unit.resources ?? []) {
			if (r.url.startsWith("file://") && /\.(?:md|markdown)$/i.test(r.url)) {
				out.push({ resource: r, unit_id: unit.id });
			}
		}
	}
	return out;
}

export async function scanTrackGlossaryCandidates(track: Track): Promise<ScannedGlossaryCandidate[]> {
	const refs = collectMarkdownResources(track);
	const globalSeen = new Set<string>();
	const all: ScannedGlossaryCandidate[] = [];

	// Unit guides first — primary vocabulary source
	const sorted = [...refs].sort((a, b) => {
		const aGuide = a.resource.title.toLowerCase().includes("unit guide") ? 0 : 1;
		const bGuide = b.resource.title.toLowerCase().includes("unit guide") ? 0 : 1;
		return aGuide - bGuide;
	});

	for (const { resource, unit_id } of sorted) {
		try {
			const doc = await readMarkdownForTrack(track, resource.url);
			const candidates = extractGlossaryFromMarkdown(doc.content, resource.url, unit_id);
			for (const c of candidates) {
				const key = normalizeTermKey(c.term);
				if (globalSeen.has(key)) continue;
				globalSeen.add(key);
				all.push(c);
			}
		} catch {
			// Skip unreadable paths
		}
	}

	return all.sort((a, b) => a.term.localeCompare(b.term));
}

export function mergeScannedGlossary(
	track: Track,
	candidates: ScannedGlossaryCandidate[],
	now: string,
): GlossaryScanResult {
	const existing = new Set((track.glossary ?? []).map((e) => normalizeTermKey(e.term)));
	const added: GlossaryEntry[] = [];
	const skipped: { term: string; reason: string }[] = [];
	let updated = track;

	for (const c of candidates) {
		const key = normalizeTermKey(c.term);
		if (existing.has(key)) {
			skipped.push({ term: c.term, reason: "already in glossary" });
			continue;
		}
		updated = addGlossaryEntry(updated, c.term, c.definition, now, {
			source: c.source,
			unit_id: c.unit_id,
		});
		const entry = updated.glossary[updated.glossary.length - 1];
		added.push(entry);
		existing.add(key);
	}

	return {
		track: updated,
		added,
		skipped,
		scanned_resources: collectMarkdownResources(track).length,
	};
}
