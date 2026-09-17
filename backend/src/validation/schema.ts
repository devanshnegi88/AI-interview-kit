import { z } from "zod";
import { STABLE_ID_PATTERN } from "./ids";

const stableId = z.string().regex(STABLE_ID_PATTERN, "expected a stable id (req_|q_|fc_ + 8–64 [a-z0-9])");

export const QuestionTypeSchema = z.enum([
  "behavioral",
  "technical",
  "system_design",
  "company",
  "role",
]);

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const RequirementPrioritySchema = z.enum(["must_have", "nice_to_have"]);

export const KitSourceSchema = z
  .object({
    job_description: z.string().trim().min(20, "job description is too short"),
    company_url: z.string().url().refine((u) => /^https?:\/\//i.test(u), "company_url must be http(s)"),
    days_available: z.number().int().min(1).max(60),
    hours_per_day: z.number().min(0.5).max(16),
  })
  .strict();

export const CitationSchema = z
  .object({
    url: z.string().url(),
    title: z.string().trim().min(1),
    snippet: z.string().trim().min(1),
  })
  .strict();

export const CompanyBriefSchema = z
  .object({
    name: z.string().trim().min(1),
    one_liner: z.string().trim().min(1),
    products: z.array(z.string().trim().min(1)),
    culture: z.array(z.string().trim().min(1)),
    interview_process: z.array(z.string().trim().min(1)),
    recent_news: z.array(z.string().trim().min(1)),
    citations: z.array(CitationSchema),
  })
  .strict();

export const RequirementSchema = z
  .object({
    id: stableId,
    text: z.string().trim().min(1),
    priority: RequirementPrioritySchema,
  })
  .strict();

export const RoleSchema = z
  .object({
    title: z.string().trim().min(1),
    level: z.string().trim().min(1),
    team: z.string().trim().min(1).optional(),
    requirements: z.array(RequirementSchema).min(1),
    responsibilities: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const QuestionSchema = z
  .object({
    id: stableId,
    type: QuestionTypeSchema,
    difficulty: DifficultySchema,
    prompt: z.string().trim().min(8),
    why_asked: z.string().trim().min(1),
    requirement_ids: z.array(z.string()).min(1),
    tags: z.array(z.string().trim().min(1)).min(1),
    answer_outline: z.array(z.string().trim().min(1)).min(1),
    follow_ups: z.array(z.string().trim().min(1)),
    estimated_minutes: z.number().int().min(5).max(180),
  })
  .strict();

export const FlashcardSchema = z
  .object({
    id: stableId,
    front: z.string().trim().min(1),
    back: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).min(1),
    question_ids: z.array(z.string()).min(1),
  })
  .strict();

export const ScheduleItemSchema = z
  .object({
    kind: z.enum(["question", "flashcard", "review"]),
    ref_id: z.string().min(1),
    minutes: z.number().int().min(1).max(180),
  })
  .strict();

export const ScheduleDaySchema = z
  .object({
    day: z.number().int().min(1),
    theme: z.string().trim().min(1),
    items: z.array(ScheduleItemSchema).min(1),
    total_minutes: z.number().int().min(0),
  })
  .strict();

export const CoverageGapSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["error", "warning"]),
    message: z.string().min(1),
    requirement_id: z.string().optional(),
    question_type: QuestionTypeSchema.optional(),
  })
  .strict();

export const CoverageReportSchema = z
  .object({
    passed: z.boolean(),
    score: z.number().min(0).max(1),
    must_requirement_ids: z.array(z.string()),
    referenced_requirement_ids: z.array(z.string()),
    covered_requirement_ids: z.array(z.string()),
    uncovered_requirement_ids: z.array(z.string()),
    must_have_covered: z.array(z.string()),
    must_have_missing: z.array(z.string()),
    nice_to_have_covered: z.array(z.string()),
    counts_by_type: z.object({
      behavioral: z.number().int().min(0),
      technical: z.number().int().min(0),
      system_design: z.number().int().min(0),
      company: z.number().int().min(0),
      role: z.number().int().min(0),
    }),
    min_counts_by_type: z.object({
      behavioral: z.number().int().min(0),
      technical: z.number().int().min(0),
      system_design: z.number().int().min(0),
      company: z.number().int().min(0),
      role: z.number().int().min(0),
    }),
    flashcard_count: z.number().int().min(0),
    min_flashcards: z.number().int().min(0),
    gaps: z.array(CoverageGapSchema),
  })
  .strict();

export const InterviewKitSchema = z
  .object({
    version: z.literal("1.0"),
    source: KitSourceSchema,
    company_brief: CompanyBriefSchema,
    role: RoleSchema,
    questions: z.array(QuestionSchema).min(1),
    flashcards: z.array(FlashcardSchema).min(1),
    schedule: z.array(ScheduleDaySchema).min(1),
    coverage: CoverageReportSchema,
  })
  .strict();

export type ParsedInterviewKit = z.infer<typeof InterviewKitSchema>;
