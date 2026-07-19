/**
 * Read local markdown files for the dashboard viewer.
 *
 * Only serves `.md` / `.markdown` paths under the track's work_dir, or paths
 * that exactly match a registered resource URL on that track.
 */

import { readFile } from "node:fs/promises";
import { basename, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Resource, Track } from "./track";

export interface MarkdownDocument {
	title: string;
	path: string;
	content: string;
}

const MARKDOWN_EXT = /\.(?:md|markdown)$/i;

export function fileUrlToPath(url: string): string | null {
	const trimmed = url.trim();
	if (!trimmed.startsWith("file://")) return null;
	try {
		return fileURLToPath(trimmed);
	} catch {
		return null;
	}
}

export function isLocalMarkdownUrl(url: string): boolean {
	const path = fileUrlToPath(url);
	return path !== null && MARKDOWN_EXT.test(path);
}

export function isPathUnderRoot(filePath: string, root: string): boolean {
	if (!root) return false;
	const absFile = normalize(resolve(filePath));
	const absRoot = normalize(resolve(root));
	return absFile === absRoot || absFile.startsWith(`${absRoot}/`);
}

function collectResourceUrls(track: Track): Resource[] {
	const out: Resource[] = [...(track.resources ?? [])];
	for (const unit of track.material_graph?.units ?? []) {
		if (unit.resources) out.push(...unit.resources);
	}
	return out;
}

function titleForPath(track: Track, filePath: string, urlHint: string): string {
	const normPath = normalize(resolve(filePath));
	for (const r of collectResourceUrls(track)) {
		const fromUrl = fileUrlToPath(r.url);
		if (fromUrl && normalize(resolve(fromUrl)) === normPath) return r.title;
	}
	if (urlHint.trim()) {
		for (const r of collectResourceUrls(track)) {
			if (r.url.trim() === urlHint.trim()) return r.title;
		}
	}
	return basename(filePath);
}

export async function readMarkdownForTrack(
	track: Track,
	urlOrPath: string,
): Promise<MarkdownDocument> {
	const fromUrl = fileUrlToPath(urlOrPath);
	const filePath = normalize(resolve(fromUrl ?? urlOrPath));

	if (!MARKDOWN_EXT.test(filePath)) {
		throw new Error("Only markdown files can be viewed");
	}

	const allowedByWorkDir = track.work_dir && isPathUnderRoot(filePath, track.work_dir);
	const allowedByResource = collectResourceUrls(track).some((r) => {
		const resourcePath = fileUrlToPath(r.url);
		if (!resourcePath) return r.url.trim() === urlOrPath.trim();
		return normalize(resolve(resourcePath)) === filePath;
	});

	if (!allowedByWorkDir && !allowedByResource) {
		throw new Error("Path is outside this track's allowed directories");
	}

	const content = await readFile(filePath, "utf8");
	return {
		title: titleForPath(track, filePath, urlOrPath),
		path: filePath,
		content,
	};
}
