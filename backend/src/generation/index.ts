/**
 * generation/ — LLM-backed stages.
 *
 * Phase 7: extractRequirements.
 * Phase 8: researchCompany.
 * Phase 9: independent question categories.
 * Phase 10: coverage loop (deterministic checker + missing-question fill).
 */

export { generateWithLLM, createLlmRuntime } from "../llm";
export type { GenerateWithLlmArgs, LlmResult } from "../llm";
export { extractRequirements, toKitRequirement, REQUIREMENT_EXTRACTION_PROMPT } from "./extractRequirements";
export { researchCompany, RESEARCH_SYSTEM_PROMPT, wrapUntrustedPages } from "./researchCompany";
export type { CompanyInterviewResearch, ResearchCompanyOptions } from "./researchCompany";
export {
  generateAllQuestions,
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
  QUESTION_CATEGORIES,
} from "./questions";
export type { QuestionGenContext, QuestionGenerationBundle } from "./questions";
export { runCoverageLoop, MAX_COVERAGE_PASSES } from "./coverageLoop";
export type { CoverageLoopResult, CoverageLoopOptions } from "./coverageLoop";
export { generateMissingQuestions } from "./questions/missing";
