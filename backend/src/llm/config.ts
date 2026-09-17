import { isTest } from "../common/env";

export type LlmProviderName = "groq" | "xai" | "ollama";

export interface LlmConfig {
  provider: LlmProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxConcurrency: number;
  minIntervalMs: number;
  maxRetries: number;
  maxRepairAttempts: number;
}

interface Preset {
  baseUrl: string;
  model: string;
  keyVars: string[];
  keyRequired: boolean;
}

/**
 * Groq is the default: OpenAI-compatible and a genuine free tier.
 * xAI / Ollama are selectable via LLM_PROVIDER — callers still go through
 * generateWithLLM, never a vendor SDK scattered in the app.
 */
const PRESETS: Record<LlmProviderName, Preset> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    keyVars: ["LLM_API_KEY", "GROQ_API_KEY"],
    keyRequired: true,
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.5",
    keyVars: ["XAI_API_KEY", "LLM_API_KEY"],
    keyRequired: true,
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    keyVars: ["LLM_API_KEY"],
    keyRequired: false,
  },
};

function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function parseProvider(raw: string | undefined): LlmProviderName {
  const name = (raw ?? "groq").trim().toLowerCase();
  if (name === "xai" || name === "spacexai" || name === "grok") return "xai";
  if (name === "ollama") return "ollama";
  return "groq";
}

export function loadLlmConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  const provider = overrides.provider ?? parseProvider(process.env.LLM_PROVIDER);
  const preset = PRESETS[provider];
  return {
    provider,
    apiKey: overrides.apiKey ?? firstEnv(preset.keyVars),
    baseUrl: (overrides.baseUrl ?? process.env.LLM_BASE_URL ?? preset.baseUrl).replace(/\/$/, ""),
    model: overrides.model ?? process.env.LLM_MODEL ?? preset.model,
    timeoutMs: overrides.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30_000),
    maxConcurrency: overrides.maxConcurrency ?? Number(process.env.LLM_MAX_CONCURRENCY ?? 1),
    minIntervalMs: overrides.minIntervalMs ?? Number(process.env.LLM_MIN_INTERVAL_MS ?? (isTest ? 0 : 1500)),
    maxRetries: overrides.maxRetries ?? Number(process.env.LLM_MAX_RETRIES ?? 3),
    maxRepairAttempts: overrides.maxRepairAttempts ?? Number(process.env.LLM_MAX_REPAIR_ATTEMPTS ?? 2),
  };
}

export function missingKeyMessage(config: LlmConfig): string | null {
  const preset = PRESETS[config.provider];
  if (!preset.keyRequired || config.apiKey) return null;
  return `Missing API key for ${config.provider}. Set ${preset.keyVars.join(" or ")}.`;
}
