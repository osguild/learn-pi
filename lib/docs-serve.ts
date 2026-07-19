/**
 * Serve bundled dashboard docs (markdown files shipped with learn-pi).
 */

import { readFile } from "node:fs/promises";
import { basename, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export interface DashboardDoc {
	title: string;
	slug: string;
	path: string;
	content: string;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(REPO_ROOT, "dashboard", "docs");

const SLUG_RE = /^[a-z0-9-]+$/;

function titleFromMarkdown(content: string, fallback: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : fallback;
}

export async function readDashboardDoc(slug: string): Promise<DashboardDoc> {
	if (!SLUG_RE.test(slug)) {
		throw new Error("Invalid doc slug");
	}

	const filePath = normalize(resolve(DOCS_DIR, `${slug}.md`));
	if (!filePath.startsWith(normalize(DOCS_DIR))) {
		throw new Error("Invalid doc path");
	}

	const content = await readFile(filePath, "utf8");
	return {
		title: titleFromMarkdown(content, basename(filePath, ".md")),
		slug,
		path: filePath,
		content,
	};
}
