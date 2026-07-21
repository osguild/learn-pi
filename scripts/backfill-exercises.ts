/**
 * One-shot backfill: add exercise + reference blocks to existing tracks.
 * Preserves edge, log, stall_counter, and work_dir; overwrites unit exercise fields.
 *
 * Usage: node --import tsx/esm scripts/backfill-exercises.ts
 */

import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "os";
import { randomUUID } from "node:crypto";
import type { Exercise, ExerciseStatus, MaterialUnit, ReferenceMaterial, Track } from "../lib/track.ts";

const TRACKS_DIR = join(homedir(), ".pi", "learn", "tracks");

async function saveTrackDirect(track: Track): Promise<void> {
	const path = join(TRACKS_DIR, `${track.id}.json`);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(tmp, JSON.stringify(track, null, 2) + "\n", "utf8");
	await rename(tmp, path);
}

async function loadTrackDirect(id: string): Promise<Track> {
	const raw = await readFile(join(TRACKS_DIR, `${id}.json`), "utf8");
	return JSON.parse(raw) as Track;
}

function exerciseStatus(unit: MaterialUnit): ExerciseStatus {
	if (unit.status === "done") return "passing";
	if (unit.status === "active") return "in_progress";
	return "todo";
}

function fileUrlToPath(url: string): string | null {
	if (!url.startsWith("file://")) return null;
	return decodeURIComponent(url.replace(/^file:\/\//, ""));
}

function section(content: string, heading: string): string {
	const re = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
	const m = content.match(re);
	return m?.[1]?.trim() ?? "";
}

function firstCodeBlock(text: string): string {
	const m = text.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
	if (!m) return "";
	return m[1]
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"))
		.join(" && ");
}

function firstSrcPath(text: string): string | undefined {
	const m = text.match(/`((?:src|exercises)\/[^`]+)`/);
	return m?.[1];
}

function parseUnitGuide(content: string, unit: MaterialUnit, fallbackVerify: string): { exercise: Exercise; reference: ReferenceMaterial } | null {
	const know = section(content, "What you need to know") || section(content, "Claims & supporting resources");
	const verifySec = section(content, "Verify");
	const filesSec = section(content, "Files to work in");
	const testCommand = firstCodeBlock(verifySec) || fallbackVerify;
	const starter = firstSrcPath(filesSec) ?? firstSrcPath(content);
	const summary = know.split("\n").slice(0, 12).join("\n").trim() || unit.title;

	const sources: ReferenceMaterial["sources"] = [];
	for (const m of content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
		sources.push({ title: m[1], url: m[2] });
		if (sources.length >= 4) break;
	}

	return {
		reference: {
			summary: summary.slice(0, 1200),
			sources: sources.length ? sources : [{ title: "Unit guide", url: "file://local" }],
		},
		exercise: {
			spec: `Complete the hands-on work for **${unit.title}**. Follow the unit guide; implement by hand and run verify when ready.`,
			starter_path: starter,
			test_command: testCommand,
			test_path: undefined,
			status: exerciseStatus(unit),
		},
	};
}

const RAG_STEPS: Record<string, { starter?: string; test: string; spec: string }> = {
	"unit-step-0": {
		test: "cargo test && cargo run -- ingest",
		spec: "Read sample docs, run ingest, explain why RAG does not embed whole books as one vector.",
	},
	"unit-step-1": {
		starter: "src/chunk.rs",
		test: "cargo test chunk",
		spec: "Build chunk.rs — Chunk, ChunkError, TextChunker, chunk_file, chunk_text.",
	},
	"unit-step-2": {
		starter: "src/embed.rs",
		test: "cargo test embed",
		spec: "Create embed.rs — normalize, cosine_similarity, MockEmbedder.",
	},
	"unit-step-3": {
		starter: "src/store.rs",
		test: "cargo test store",
		spec: "Create store.rs — InMemoryVectorStore with from_chunks and search.",
	},
	"unit-step-4": {
		starter: "src/retrieve.rs",
		test: "cargo test retrieve",
		spec: "Create retrieve.rs and wire search command in main.rs.",
	},
	"unit-step-5": {
		starter: "src/rag.rs",
		test: "cargo test rag",
		spec: "Create rag.rs — build_prompt, RagPipeline, ask command.",
	},
	"unit-step-6": {
		starter: "src/store.rs",
		test: "cargo test",
		spec: "Stretch: traits + production vector DB integration.",
	},
	"unit-step-7": {
		starter: "src/",
		test: "cargo test",
		spec: "Stretch: evaluation harness for retrieval quality.",
	},
};

const C_EMULATOR: Record<string, { starter: string; ex: number }> = {
	"unit-ex01": { starter: "exercises/ex01_bytes.c", ex: 1 },
	"unit-ex02": { starter: "exercises/ex02_bits.c", ex: 2 },
	"unit-ex03": { starter: "exercises/ex03_file.c", ex: 3 },
	"unit-ex04": { starter: "exercises/ex04_cpu.c", ex: 4 },
	"unit-ex05": { starter: "exercises/ex05_fetch.c", ex: 5 },
	"unit-ex06": { starter: "exercises/ex06_step.c", ex: 6 },
	"unit-ex07": { starter: "exercises/ex06_step.c", ex: 7 },
	"unit-ex08": { starter: "exercises/ex08_run.c", ex: 8 },
	"unit-ex09": { starter: "exercises/ex09_ptr.c", ex: 9 },
	"unit-ex10": { starter: "exercises/ex10_heap.c", ex: 10 },
	"unit-ex11": { starter: "exercises/ex11_dynbuf.c", ex: 11 },
};

const WEBGPU_STEPS: Record<string, { starter?: string; test: string; spec: string }> = {
	"unit-phase-0": {
		starter: "src/webgpu_warmup.rs",
		test: "cargo test -p rust-webgpu webgpu_warmup",
		spec: "Complete WEBGPU_WARMUP Phase 0 — stubs in webgpu_warmup.rs.",
	},
	"unit-step-0": {
		test: "cargo run -p rust-webgpu",
		spec: "Read VISION + wgpu mental model; explain Device vs Queue vs Surface.",
	},
	"unit-step-1": {
		starter: "src/window.rs",
		test: "cargo test -p rust-webgpu",
		spec: "Window + GPU init + surface + clear-color frame.",
	},
	"unit-step-2": {
		starter: "src/render/",
		test: "cargo test -p rust-webgpu",
		spec: "Triangle → colored cube mesh (shader, pipeline, mesh).",
	},
	"unit-step-3": {
		test: "cargo test -p rust-webgpu",
		spec: "Depth buffer + perspective camera (static MVP).",
	},
	"unit-step-4": {
		test: "cargo test -p rust-webgpu",
		spec: "Game loop + input + fixed timestep.",
	},
	"unit-step-5": {
		test: "cargo test -p rust-webgpu",
		spec: "Camera as a game system (playfield view).",
	},
	"unit-step-6": {
		test: "cargo test -p rust-webgpu",
		spec: "World + AABB collision.",
	},
	"unit-step-7": {
		test: "cargo test -p rust-webgpu",
		spec: "Ship 3D Breakout + polish.",
	},
};

async function backfillUnit(track: Track, unit: MaterialUnit): Promise<MaterialUnit> {
	const verify = track.verify_command ?? "cargo test";
	const guideUrl = unit.resources?.find((r) => r.url.endsWith(".md"))?.url;
	const guidePath = guideUrl ? fileUrlToPath(guideUrl) : null;

	if (guidePath) {
		try {
			const content = await readFile(guidePath, "utf8");
			const parsed = parseUnitGuide(content, unit, verify);
			if (parsed) {
				return { ...unit, exercise: parsed.exercise, reference: parsed.reference };
			}
		} catch {
			// fall through to track-specific maps
		}
	}

	if (track.id === "rust-rag-learn" && RAG_STEPS[unit.id]) {
		const s = RAG_STEPS[unit.id];
		return {
			...unit,
			reference: {
				summary: s.spec,
				sources: [{ title: "STEPS.md", url: "file://" + join(track.work_dir, "docs/STEPS.md") }],
			},
			exercise: {
				spec: s.spec,
				starter_path: s.starter,
				test_command: s.test,
				status: exerciseStatus(unit),
			},
		};
	}

	if (track.id === "c-emulator" && C_EMULATOR[unit.id]) {
		const c = C_EMULATOR[unit.id];
		return {
			...unit,
			reference: {
				summary: unit.title,
				sources: [{ title: "TOPICS.md", url: "file://" + join(track.work_dir, "docs/TOPICS.md") }],
			},
			exercise: {
				spec: `Implement ${unit.title} in ${c.starter}.`,
				starter_path: c.starter,
				test_command: `make test EX=${String(c.ex).padStart(2, "0")}`,
				status: exerciseStatus(unit),
			},
		};
	}

	if (track.id === "rust-webgpu" && WEBGPU_STEPS[unit.id]) {
		const w = WEBGPU_STEPS[unit.id];
		return {
			...unit,
			reference: {
				summary: w.spec,
				sources: [{ title: "STEPS.md", url: "file://" + join(track.work_dir, "docs/STEPS.md") }],
			},
			exercise: {
				spec: w.spec,
				starter_path: w.starter,
				test_command: w.test,
				status: exerciseStatus(unit),
			},
		};
	}

	if (track.id === "context-engineering") {
		return {
			...unit,
			reference: {
				summary: unit.notes ?? unit.title,
				sources: (unit.resources ?? []).slice(0, 2).map((r) => ({ title: r.title, url: r.url })),
			},
			exercise: {
				spec: track.next_action || unit.title,
				starter_path: "src/context-window.ts",
				test_command: verify,
				status: exerciseStatus(unit),
			},
		};
	}

	return {
		...unit,
		exercise: {
			spec: unit.title,
			test_command: verify,
			status: exerciseStatus(unit),
		},
		reference: {
			summary: unit.notes ?? unit.title,
			sources: [],
		},
	};
}

async function backfillTrack(trackId: string): Promise<void> {
	const track = await loadTrackDirect(trackId);
	const units = await Promise.all(track.material_graph.units.map((u) => backfillUnit(track, u)));
	const updated: Track = {
		...track,
		material_graph: {
			...track.material_graph,
			units,
			revised_at: new Date().toISOString(),
		},
	};
	await saveTrackDirect(updated);
	const withEx = units.filter((u) => u.exercise).length;
	console.log(`${trackId}: ${withEx}/${units.length} units with exercises`);
}

async function main(): Promise<void> {
	const files = (await readdir(TRACKS_DIR)).filter((f) => f.endsWith(".json"));
	for (const f of files) {
		await backfillTrack(f.replace(/\.json$/, ""));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
