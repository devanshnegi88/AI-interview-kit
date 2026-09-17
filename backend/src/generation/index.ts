/**
 * generation/ — LLM-backed stages.
 *
 * Phase 7: extractRequirements (JD → requirements[]).
 * Later: company brief, questions, flashcards — all via generateWithLLM.
 */

export { generateWithLLM, createLlmRuntime } from "../llm";
export type { GenerateWithLlmArgs, LlmResult } from "../llm";
export { extractRequirements, toKitRequirement, REQUIREMENT_EXTRACTION_PROMPT } from "./extractRequirements";
