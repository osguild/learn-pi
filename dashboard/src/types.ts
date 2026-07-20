// Track types mirrored from lib/track.ts. Duplicated (not imported) so the
// dashboard builds standalone under Vite without crossing the lib's
// node-only imports. Keep in sync with lib/track.ts.

export type Energy = "low" | "medium" | "high";

export interface CueConfig {
  kind: "weekday" | "daily" | "once";
  time: string;
  days?: string[];
  at?: string;
}

export interface ProcessContract {
  cue: CueConfig | null;
  session_min: number;
  reward: string;
}

export interface Edge {
  statement: string;
  set_at: string;
  sessions_at_edge: number;
}

export interface Yak {
  id: string;
  desc: string;
  added_at: string;
  resolved: boolean;
}

export type ResourceKind =
  | "article"
  | "doc"
  | "video"
  | "book"
  | "paper"
  | "repo"
  | "other";

export interface Resource {
  id: string;
  title: string;
  url: string;
  kind?: ResourceKind;
  added_at: string;
  note?: string;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  source?: string;
  unit_id?: string;
  added_at: string;
  revised_at?: string;
}

export interface MaterialUnit {
  id: string;
  title: string;
  prerequisites: string[];
  difficulty: "easy" | "medium" | "hard";
  status: "pending" | "active" | "done" | "skipped";
  notes?: string;
  resources?: Resource[];
}

export interface MaterialGraph {
  source: string | null;
  units: MaterialUnit[];
  revised_at: string | null;
}

export interface TrackOverview {
  summary: string;
  learner_context?: string;
  approach?: string;
  learning_path?: string;
  set_at: string;
  revised_at?: string;
}

export interface SessionLogEntry {
  id: string;
  at: string;
  minutes: number;
  edge_before: string;
  edge_crossed: boolean;
  new_edge: string | null;
  next_action_after: string;
  outcome_compass_revised: boolean;
  yaks: string[];
  cued: boolean;
  note: string;
}

export type Depth = "guided" | "standard" | "from-scratch";
export type TrackKind = "programming" | "study";
export type StudyDepth = "appreciation" | "practitioner" | "mastery";

export interface Track {
  id: string;
  label: string;
  outcome_compass: string;
  outcome_compass_revised_at: string;
  overview?: TrackOverview | null;
  process_contract: ProcessContract;
  work_dir: string;
  verify_command: string | null;
  edge: Edge;
  next_action: string;
  next_action_set_at: string;
  deferred_yaks: Yak[];
  resources: Resource[];
  glossary: GlossaryEntry[];
  material_graph: MaterialGraph;
  log: SessionLogEntry[];
  stall_counter: number;
  last_session_at: string | null;
  created_at: string;
  status: "active" | "paused" | "archived";
  depth?: Depth;
  recommended_stack?: string[];
  edge_suggested?: boolean;
  track_kind?: TrackKind;
  study_depth?: StudyDepth;
  domain_family?: "language" | "music" | "history" | "math" | "science";
  approach?: string;
  rubric?: string[];
}

export interface TrackIndex {
  active_track_id: string | null;
  tracks: Array<{
    id: string;
    label: string;
    last_session_at: string | null;
    status: Track["status"];
  }>;
}

export interface TimerState {
  mode: "idle" | "work" | "break";
  paused: boolean;
  totalSec: number;
  startedAt: string | null;
  pausedAt: string | null;
  track: string | null;
  cyclesToday: number;
  cycleDate: string;
}

export interface SessionLogLine extends SessionLogEntry {
  track_id: string;
}

export interface MarkdownDocument {
  title: string;
  path: string;
  content: string;
}

export interface DashboardDoc {
  title: string;
  slug: string;
  path: string;
  content: string;
}
