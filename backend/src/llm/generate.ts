import type { z } from "zod";
import { loadLlmConfig, missingKeyMessage, type LlmConfig } from "./config";
import { llmFail, type LlmResult } from "./errors";
import { parseJson } from "./json";
import { LlmLimiter } from "./limiter";
import { llmLog } from "./log";
import { completeChat, type ChatMessage, type FetchLike } from "./provider";

export interface GenerateWithLlmArgs<S extends z.ZodType> {
  stage: string;
  systemPrompt: string;
  input: unknown;
  schema: S;
}

export interface LlmRuntime {
  config: LlmConfig;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  limiter: LlmLimiter;
}

export function createLlmRuntime(overrides: Partial<LlmConfig> & {
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
} = {}): LlmRuntime {
  const { fetch: fetchFn, now, sleep, random, ...configOverrides } = overrides;
  const config = loadLlmConfig(configOverrides);
  return {
    config,
    fetch: fetchFn ?? fetch,
    now: now ?? Date.now,
    sleep: sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: random ?? Math.random,
    limiter: new LlmLimiter(Math.max(1, config.maxConcurrency), Math.max(0, config.minIntervalMs), now ?? Date.now, sleep),
  };
}

let defaultRuntime: LlmRuntime | undefined;

export function getDefaultLlmRuntime(): LlmRuntime {
  if (!defaultRuntime) defaultRuntime = createLlmRuntime();
  return defaultRuntime;
}

export function resetDefaultLlmRuntime(): void {
  defaultRuntime = undefined;
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

function userPayload(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}

/**
 * Single entry for every LLM call in the app.
 * The model output is never trusted: parse → Zod → bounded repair → Zod again.
 */
export async function generateWithLLM<S extends z.ZodType>(
  args: GenerateWithLlmArgs<S>,
  runtime: LlmRuntime = getDefaultLlmRuntime(),
): Promise<LlmResult<z.infer<S>>> {
  const { stage, systemPrompt, input, schema } = args;
  const missing = missingKeyMessage(runtime.config);
  if (missing) {
    llmLog("config_error", { stage, level: "error" });
    return llmFail("CONFIG", missing, { stage });
  }

  const jsonInstruction =
    "Respond with a single JSON object only. No markdown, no commentary. The JSON must match the requested schema.";
  const messages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt}\n\n${jsonInstruction}` },
    { role: "user", content: userPayload(input) },
  ];

  let lastIssues: string[] = ["No output"];
  let lastCode: "INVALID_JSON" | "SCHEMA" = "INVALID_JSON";

  for (let repair = 0; repair <= runtime.config.maxRepairAttempts; repair += 1) {
    const completion = await runtime.limiter.run(() =>
      completeChat({
        config: runtime.config,
        messages,
        stage,
        fetch: runtime.fetch,
        now: runtime.now,
        sleep: runtime.sleep,
        random: runtime.random,
      }),
    );
    if (!completion.ok) return completion;

    const parsed = parseJson(completion.data.text);
    if (!parsed.ok) {
      lastCode = "INVALID_JSON";
      lastIssues = [parsed.message];
      llmLog("parse_fail", { stage, repair, message: parsed.message });
      messages.push({ role: "assistant", content: completion.data.text });
      messages.push({
        role: "user",
        content: `Your previous reply was not valid JSON (${parsed.message}). Return corrected JSON only.`,
      });
      continue;
    }

    const valid = schema.safeParse(parsed.value);
    if (valid.success) {
      llmLog("validated", { stage, repair });
      return { ok: true, data: valid.data };
    }

    lastCode = "SCHEMA";
    lastIssues = issuesOf(valid.error);
    llmLog("schema_fail", { stage, repair, issues: lastIssues });
    messages.push({ role: "assistant", content: completion.data.text });
    messages.push({
      role: "user",
      content: `Your JSON failed schema validation:\n${lastIssues.join("\n")}\nReturn corrected JSON only.`,
    });
  }

  return llmFail(lastCode, "LLM output invalid after bounded repair", {
    stage,
    issues: lastIssues,
  });
}
