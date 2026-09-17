/**
 * generation/ — LLM-backed stages.
 *
 * Phase 7: extractRequirements.
 * Phase 8: researchCompany (crawler + LLM). Question generation is later.
 */

export { generateWithLLM, createLlmRuntime } from "../llm";
export type { GenerateWithLlmArgs, LlmResult } from "../llm";
export { extractRequirements, toKitRequirement, REQUIREMENT_EXTRACTION_PROMPT } from "./extractRequirements";
export { researchCompany, RESEARCH_SYSTEM_PROMPT, wrapUntrustedPages } from "./researchCompany";
export type { CompanyInterviewResearch, ResearchCompanyOptions } from "./researchCompany";
