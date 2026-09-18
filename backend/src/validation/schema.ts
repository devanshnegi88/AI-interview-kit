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

export const RequirementKindSchema = z.enum(["technical", "behavioural", "domain"]);

export const ExtractedPrioritySchema = z.enum(["must", "nice"]);

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
    state: z.enum(["generated", "edited", "pinned"]).optional(),
  })
  .strict();

/** Appendix A company_brief (Phase 8 research output). */
export const ResearchSourceSchema = z
  .object({
    url: z.string().url(),
    title: z.string(),
  })
  .strict();

export const AppendixCompanyBriefSchema = z
  .object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(ResearchSourceSchema),
  })
  .strict();

export const ProcessResearchSchema = z
  .object({
    found: z.boolean(),
    summary: z.string(),
    sources: z.array(ResearchSourceSchema),
  })
  .strict();

export const CompanyInterviewLlmSchema = z
  .object({
    company_brief: AppendixCompanyBriefSchema,
    hiring_process: ProcessResearchSchema,
    interview_process: ProcessResearchSchema,
  })
  .strict();

export const RequirementSchema = z
  .object({
    id: stableId,
    text: z.string().trim().min(1),
    priority: RequirementPrioritySchema,
    kind: RequirementKindSchema.optional(),
  })
  .strict();

/** LLM draft — ids are assigned after parse, never trusted from the model. */
export const RequirementDraftSchema = z
  .object({
    text: z.string().trim().min(1),
    kind: z
      .string()
      .trim()
      .toLowerCase()
      .transform((k) => (k === "behavioral" ? "behavioural" : k))
      .pipe(RequirementKindSchema),
    priority: ExtractedPrioritySchema,
  })
  .strict();

export const RequirementExtractionSchema = z
  .object({
    requirements: z.array(RequirementDraftSchema),
  })
  .strict();

export const ExtractedRequirementSchema = z
  .object({
    id: stableId,
    text: z.string().trim().min(1),
    kind: RequirementKindSchema,
    priority: ExtractedPrioritySchema,
  })
  .strict();

export const ExtractedRequirementsSchema = z
  .object({
    requirements: z.array(ExtractedRequirementSchema),
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
    state: z.enum(["generated", "edited", "pinned"]).optional(),
  })
  .strict();

/** LLM draft — ids and type are assigned/forced by the stage, not trusted from the model. */
export const QuestionDraftSchema = z
  .object({
    difficulty: DifficultySchema,
    prompt: z.string().trim().min(8),
    why_asked: z.string().trim().min(1),
    requirement_ids: z.array(z.string()).default([]),
    tags: z.array(z.string().trim().min(1)).min(1),
    answer_outline: z.array(z.string().trim().min(1)).min(1),
    follow_ups: z.array(z.string().trim().min(1)).default([]),
    estimated_minutes: z.number().int().min(5).max(180),
  })
  .strict();

export const QuestionBatchSchema = z
  .object({
    questions: z.array(QuestionDraftSchema),
  })
  .strict();

export const QuestionCategorySchema = z.enum(["technical", "behavioural", "system-design", "company-fit"]);

export const QuestionDifficultyLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** LLM draft for Phase 9 — no id, no category (the stage supplies those). */
export const GeneratedQuestionDraftSchema = z
  .object({
    requirement_ids: z.array(z.string()).min(1),
    prompt: z.string().trim().min(8),
    answer_outline: z.array(z.string().trim().min(1)).min(1),
    difficulty: QuestionDifficultyLevelSchema,
  })
  .strict();

export const GeneratedQuestionSchema = z
  .object({
    id: stableId,
    requirement_ids: z.array(z.string()).min(1),
    category: QuestionCategorySchema,
    prompt: z.string().trim().min(8),
    answer_outline: z.array(z.string().trim().min(1)).min(1),
    difficulty: QuestionDifficultyLevelSchema,
  })
  .strict();

export function generatedQuestionBatchSchema(allowedRequirementIds: Set<string>) {
  return z
    .object({
      questions: z.array(GeneratedQuestionDraftSchema),
    })
    .strict()
    .superRefine((value, ctx) => {
      value.questions.forEach((q, i) => {
        q.requirement_ids.forEach((rid, j) => {
          if (!allowedRequirementIds.has(rid)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `requirement_ids contains unknown id ${rid}`,
              path: ["questions", i, "requirement_ids", j],
            });
          }
        });
      });
    });
}

export const FlashcardSchema = z
  .object({
    id: stableId,
    front: z.string().trim().min(1),
    back: z.string().trim().min(1),
    requirement_ids: z.array(z.string()).min(1),
    question_ids: z.array(z.string()).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    state: z.enum(["generated", "edited", "pinned"]).optional(),
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
