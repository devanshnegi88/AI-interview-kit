/**
 * llm/ — Phase 6 provider abstraction.
 *
 * Every later generation stage must call `generateWithLLM`. Do not scatter
 * vendor SDKs or raw fetch calls. Output is parsed and Zod-validated;
 * the model is never trusted directly.
 *
 * Default provider: Groq (OpenAI-compatible, genuine free tier).
 */

export { generateWithLLM, createLlmRuntime, getDefaultLlmRuntime, resetDefaultLlmRuntime } from "./generate";
export type { GenerateWithLlmArgs, LlmRuntime } from "./generate";
export { loadLlmConfig } from "./config";
export type { LlmConfig, LlmProviderName } from "./config";
export { llmFail } from "./errors";
export type { LlmError, LlmErrorCode, LlmResult } from "./errors";
export { parseJson, extractJsonText } from "./json";
