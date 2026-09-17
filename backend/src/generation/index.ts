/**
 * generation/ — LLM-backed stages (later).
 *
 * Requirement extraction, company brief, questions, and flashcards must
 * call `generateWithLLM` from `../llm`. Do not call a vendor SDK here.
 * Coverage, scheduling, IDs, and structure stay in validation/.
 */

export { generateWithLLM, createLlmRuntime } from "../llm";
export type { GenerateWithLlmArgs, LlmResult } from "../llm";
