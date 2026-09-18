/**
 * Shared types for the AI Interview Prep Kit.
 *
 * Phase 1 types (API envelope, health, user) live alongside the Phase 2
 * Appendix A kit schema. The runtime Zod validator that matches this shape
 * lives in `backend/src/validation/schema.ts` — keep the two in lockstep.
 */

/** MongoDB ObjectId serialized as a string over the wire. */
export type Id = string;

/** Standard envelope every API response is wrapped in. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Minimal authenticated-user shape exposed to the frontend. */
export interface UserSummary {
  id: Id;
  email: string;
}

/** Health check payload returned by GET /health. */
export interface HealthStatus {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  db: "connected" | "connecting" | "disconnected" | "unknown";
  timestamp: string;
}

/** Schema version of a generated interview kit. */
export type KitVersion = "1.0";

export type QuestionType =
  | "behavioral"
  | "technical"
  | "system_design"
  | "company"
  | "role";

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";

export type QuestionDifficultyLevel = 1 | 2 | 3;

/** Phase 9 generation output. */
export interface GeneratedQuestion {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string[];
  difficulty: QuestionDifficultyLevel;
}

export type RequirementPriority = "must_have" | "nice_to_have";

export type RequirementKind = "technical" | "behavioural" | "domain";

export type ExtractedPriority = "must" | "nice";

export type ScheduleItemKind = "question" | "flashcard" | "review";

export type CoverageGapSeverity = "error" | "warning";

export type ItemEditState = "generated" | "edited" | "pinned";

/**
 * Inputs the user provides to generate a kit. Later phases fill the rest
 * of the kit from these three fields.
 */
export interface KitSource {
  job_description: string;
  company_url: string;
  days_available: number;
  hours_per_day: number;
}

export interface Citation {
  url: string;
  title: string;
  snippet: string;
}

export interface CompanyBrief {
  name: string;
  one_liner: string;
  products: string[];
  culture: string[];
  interview_process: string[];
  recent_news: string[];
  citations: Citation[];
  state?: ItemEditState;
}

export interface Requirement {
  id: string;
  text: string;
  priority: RequirementPriority;
  kind?: RequirementKind;
}

/** Phase 7 extraction output. priority is must/nice; kit mapping uses must_have/nice_to_have. */
export interface ExtractedRequirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: ExtractedPriority;
}

export interface Role {
  title: string;
  level: string;
  team?: string;
  requirements: Requirement[];
  responsibilities: string[];
}

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  why_asked: string;
  requirement_ids: string[];
  tags: string[];
  answer_outline: string[];
  follow_ups: string[];
  estimated_minutes: number;
  state?: ItemEditState;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  /** @deprecated compatibility alias retained while older phases still emit question_ids. */
  question_ids?: string[];
  /** @deprecated compatibility alias retained while older phases still emit tags. */
  tags?: string[];
  state?: ItemEditState;
}

export interface ScheduleItem {
  kind: ScheduleItemKind;
  ref_id: string;
  minutes: number;
}

export interface ScheduleDay {
  day: number;
  theme: string;
  items: ScheduleItem[];
  total_minutes: number;
}

export interface CoverageGap {
  code: string;
  severity: CoverageGapSeverity;
  message: string;
  requirement_id?: string;
  question_type?: QuestionType;
}

/**
 * Deterministic coverage report. Always recomputed from kit contents —
 * never trusted from a model.
 */
export interface CoverageReport {
  passed: boolean;
  /** Covered must-haves / total must-haves. 0 when the role has none. */
  score: number;
  /** Every must_have requirement id, collected before any covering check. */
  must_requirement_ids: string[];
  /** Requirement IDs referenced by any question.requirement_ids. */
  referenced_requirement_ids: string[];
  covered_requirement_ids: string[];
  uncovered_requirement_ids: string[];
  must_have_covered: string[];
  must_have_missing: string[];
  nice_to_have_covered: string[];
  counts_by_type: Record<QuestionType, number>;
  min_counts_by_type: Record<QuestionType, number>;
  flashcard_count: number;
  min_flashcards: number;
  gaps: CoverageGap[];
}

/** Full Appendix A kit. */
export interface InterviewKit {
  version: KitVersion;
  source: KitSource;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: ScheduleDay[];
  coverage: CoverageReport;
}

export type RequirementDraft = Omit<Requirement, "id"> & { id?: string };
export type QuestionDraft = Omit<Question, "id"> & { id?: string };
export type FlashcardDraft = Omit<Flashcard, "id"> & { id?: string };

export interface RoleDraft extends Omit<Role, "requirements"> {
  requirements: RequirementDraft[];
}

/** Content that the assembler turns into a complete, validated kit. */
export interface KitDraft {
  source: KitSource;
  company_brief: CompanyBrief;
  role: RoleDraft;
  questions: QuestionDraft[];
  flashcards: FlashcardDraft[];
}

export const QUESTION_TYPES: readonly QuestionType[] = [
  "behavioral",
  "technical",
  "system_design",
  "company",
  "role",
] as const;

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"] as const;

export type KitStatus = "pending" | "researching" | "generating" | "ready" | "failed";

export type KitStageState = "pending" | "in_progress" | "done" | "failed";

export interface KitFieldState {
  input: KitStageState;
  research: KitStageState;
  requirements: KitStageState;
  questions: KitStageState;
  flashcards: KitStageState;
  schedule: KitStageState;
  validation: KitStageState;
}

export interface KitPracticeState {
  mode: "off" | "review";
  currentDay: number | null;
  currentItemId: string | null;
  completedCount: number;
  startedAt?: string | null;
  updatedAt?: string | null;
}

export interface KitError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface StoredKit {
  id: Id;
  ownerId: Id;
  status: KitStatus;
  input: Record<string, unknown>;
  source?: KitSource | null;
  company_brief?: CompanyBrief | Partial<CompanyBrief> | null;
  role?: Role | Partial<Role> | null;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: ScheduleDay[];
  coverage?: CoverageReport | null;
  fieldState: KitFieldState;
  practiceState: KitPracticeState;
  error?: KitError | null;
  createdAt: string;
  updatedAt: string;
}
