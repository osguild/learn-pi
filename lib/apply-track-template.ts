/**
 * Apply a starter track template — shared by CLI and dashboard.
 *
 * Emits project skeleton (programming) or notes workspace (study), then writes
 * a fully seeded Track record with units, resources, and glossary.
 */

import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	emitGenericSkeleton,
	emitSkeleton,
	LANGUAGE_SKELETONS,
	loadManifest,
	resolveVariables,
	runGenericPostCreate,
	runPostCreate,
	type SkeletonFile,
} from "./scaffold";
import {
	APPROACHES,
	buildNotesWorkspace,
	buildRubric,
	emitNotesWorkspace,
	type DomainFamily,
	type NotesContext,
} from "./study-plan";
import {
	buildTrackSeedFromTemplate,
	getTrackTemplate,
	programmingDepthForTier,
	studyDepthForTier,
	type ProgrammingTrackTemplate,
	type StudyTrackTemplate,
	type TemplateScaffoldContext,
	type TrackTemplate,
} from "./track-templates";
import { freshTrack, saveTrack, type Track } from "./track";
import { slugify } from "./paths";

export interface ApplyTemplateInput {
	templateId: string;
	/** Programming: language key. Study: optional custom topic. */
	language?: string;
	topic?: string;
	targetDir?: string;
	trackId?: string;
}

export interface ApplyTemplateResult {
	track: Track;
	targetDir: string;
	filesWritten: number;
	warnings: string[];
}

function defaultTargetDir(template: TrackTemplate, topic?: string): string {
	const base = template.kind === "study" && topic ? slugify(topic) : template.default_dir_name;
	const suffix = template.kind === "study" ? "-notes" : "";
	return join(homedir(), "gitrepos", `${base}${suffix}`);
}

function resolveDir(arg: string | undefined, fallback: string): string {
	if (!arg?.trim()) return fallback;
	return resolve(arg.replace(/^~/, homedir()));
}

export async function applyTrackTemplate(input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
	const template = getTrackTemplate(input.templateId);
	if (!template) throw new Error(`Unknown template "${input.templateId}"`);

	if (template.kind === "study") {
		return applyStudyTemplate(template, input);
	}
	return applyProgrammingTemplate(template, input);
}

async function applyProgrammingTemplate(
	template: ProgrammingTrackTemplate,
	input: ApplyTemplateInput,
): Promise<ApplyTemplateResult> {
	const depth = programmingDepthForTier(template.tier);
	const goal = template.label;
	const targetDir = resolveDir(input.targetDir, defaultTargetDir(template));
	const trackId = input.trackId ?? slugify(template.id);
	const warnings: string[] = [];

	await mkdir(targetDir, { recursive: true });
	let filesWritten = 0;
	let verifyCommand: string | null = null;
	let recommended_stack: string[] = [];

	if (template.recipe) {
		const manifest = await loadManifest(template.recipe);
		if (!manifest) throw new Error(`Recipe "${template.recipe}" not found — run /learn-scaffold once to seed it.`);
		const vars = resolveVariables(manifest, {});
		const written = await emitSkeleton(template.recipe, targetDir, vars);
		filesWritten = written.length;
		try {
			runPostCreate(manifest, targetDir, vars);
		} catch (err) {
			warnings.push(`Post-create: ${(err as Error).message}`);
		}
		verifyCommand = manifest.verify_command;
		recommended_stack = [template.label];
	} else {
		const lang = input.language ?? template.languages[0];
		if (!lang || !LANGUAGE_SKELETONS[lang]) {
			throw new Error(
				template.languages.length > 0
					? `Language required. Pick one of: ${template.languages.join(", ")}`
					: "This template has no language scaffold.",
			);
		}
		if (!template.languages.includes(lang)) {
			throw new Error(`Language "${lang}" is not supported for template "${template.id}".`);
		}

		const framework = template.frameworkByLanguage?.[lang];
		const projectName = slugify(trackId).replace(/-/g, "_") || "learn";
		const sctx = { projectName, goal, depth, framework };
		const skel = LANGUAGE_SKELETONS[lang];

		let files: SkeletonFile[] = skel.files(sctx);
		if (template.extraSkeletonFiles) {
			const ctx: TemplateScaffoldContext = {
				template,
				language: lang,
				projectName,
				goal,
				depth,
				framework,
			};
			files = [...files, ...template.extraSkeletonFiles(ctx)];
		}

		const written = await emitGenericSkeleton(files, targetDir);
		filesWritten = written.length;
		warnings.push(...runGenericPostCreate(skel.postCreate(sctx), targetDir));

		verifyCommand = template.verifyCommand
			? template.verifyCommand({
					template,
					language: lang,
					projectName,
					goal,
					depth,
					framework,
				})
			: skel.verifyCommand(sctx);
		recommended_stack = framework ? [lang, framework] : [lang];
	}

	const seed = buildTrackSeedFromTemplate(template, {
		label: template.label,
		work_dir: targetDir,
		verify_command: verifyCommand,
		track_kind: "programming",
		depth,
		recommended_stack,
	});

	const track = freshTrack({ id: trackId, ...seed });
	await saveTrack(track);
	return { track, targetDir, filesWritten, warnings };
}

async function applyStudyTemplate(
	template: StudyTrackTemplate,
	input: ApplyTemplateInput,
): Promise<ApplyTemplateResult> {
	const topic = (input.topic?.trim() || template.default_topic).trim();
	if (!topic) throw new Error("Topic is required for this study template.");

	const study_depth = studyDepthForTier(template.tier);
	const approach = APPROACHES[template.domain_family];
	const targetDir = resolveDir(input.targetDir, defaultTargetDir(template, topic));
	const trackId = input.trackId ?? slugify(topic);
	const warnings: string[] = [];

	await mkdir(targetDir, { recursive: true });
	const notesCtx: NotesContext = { topic, goal: topic, depth: study_depth, approach };
	const written = await emitNotesWorkspace(buildNotesWorkspace(notesCtx), targetDir);

	const rubric = buildRubric(template.domain_family as DomainFamily, template.suggested_edge);
	const seed = buildTrackSeedFromTemplate(template, {
		label: topic,
		work_dir: targetDir,
		verify_command: null,
		track_kind: "study",
		study_depth,
		domain_family: template.domain_family,
		approach: approach.approach,
		rubric,
	});

	const track = freshTrack({ id: trackId, ...seed });
	await saveTrack(track);
	return { track, targetDir, filesWritten: written.length, warnings };
}

export function targetDirExists(path: string): boolean {
	return existsSync(path);
}

export { defaultTargetDir, resolveDir as resolveTemplateDir };
