/**
 * validation/ — Phase 2 deterministic core.
 *
 * None of these steps are LLM jobs. Generation (later) must run output
 * through `assembleKit` / `validateKit`; it must not invent coverage,
 * a schedule, ids, or structural validity.
 *
 * 1. Exact Appendix A Zod schema     schema.ts
 * 2. Requirement validation          requirements.ts
 * 3. Question validation             questions.ts
 * 4. Flashcard validation            flashcards.ts
 * 5. Schedule validation             scheduleCheck.ts
 * 6. Stable ID validation            ids.ts
 * 7. Referential-integrity           integrity.ts
 * 8. Coverage checker                coverage.ts
 * 9. Deterministic schedule allocator (scheduling/schedule.ts)
 */

export { assembleKit, validateKit } from "./assemble";
export type { KitValidationResult } from "./assemble";
export {
  calculateUncoveredIds,
  collectMustRequirementIds,
  collectReferencedRequirementIds,
  computeCoverage,
  minCountsByType,
  minFlashcards,
  COVERAGE_CODES,
} from "./coverage";
export { validateFlashcards, FLASHCARD_CODES } from "./flashcards";
export {
  ensureId,
  flashcardId,
  isFlashcardId,
  isQuestionId,
  isRequirementId,
  isStableId,
  questionId,
  requirementId,
  stableId,
  validateStableIds,
  STABLE_ID_PATTERN,
  ID_CODES,
} from "./ids";
export { collectIntegrityIssues, INTEGRITY_CODES } from "./integrity";
export type { KitValidationIssue } from "./issues";
export { validateQuestions, QUESTION_CODES } from "./questions";
export { validateRequirements, REQUIREMENT_CODES } from "./requirements";
export { validateSchedule, SCHEDULE_CODES } from "./scheduleCheck";
export {
  CompanyBriefSchema,
  CoverageReportSchema,
  FlashcardSchema,
  InterviewKitSchema,
  KitSourceSchema,
  QuestionSchema,
  RequirementSchema,
  RoleSchema,
  ScheduleDaySchema,
} from "./schema";
