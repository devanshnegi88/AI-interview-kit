import { backoffMs, defaultRetryPolicy, isRetryableStatus, parseRetryAfterMs } from "../http/retry";
import type { LlmConfig } from "./config";
import { llmFail, type LlmResult } from "./errors";
import { llmLog } from "./log";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderComplete {
  text: string;
  status: number;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function statusError(status: number, body: string, stage: string): LlmResult<never> {
  if (status === 401) return llmFail("AUTH", "LLM provider rejected credentials", { status, stage });
  if (status === 403) return llmFail("FORBIDDEN", "LLM provider forbade the request", { status, stage });
  if (status === 400) return llmFail("BAD_REQUEST", `LLM provider returned 400: ${body.slice(0, 200)}`, { status, stage });
  if (status === 429) {
    return llmFail("RATE_LIMIT", "LLM provider rate-limited the request", { status, stage, retryable: true });
  }
  return llmFail("HTTP_STATUS", `LLM provider returned HTTP ${status}`, {
    status,
    stage,
    retryable: isRetryableStatus(status),
  });
}

function networkCode(err: unknown): string {
  if (typeof err === "object" && err && "code" in err) return String((err as { code: unknown }).code);
  if (err instanceof Error && err.name === "AbortError") return "ABORT_ERR";
  return "";
}

export async function completeChat(args: {
  config: LlmConfig;
  messages: ChatMessage[];
  stage: string;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}): Promise<LlmResult<ProviderComplete>> {
  const { config, messages, stage } = args;
  const policy = defaultRetryPolicy({
    maxRetries: config.maxRetries,
    baseDelayMs: 400,
    maxDelayMs: 8_000,
    random: args.random,
  });
  const url = `${config.baseUrl}/chat/completions`;
  let lastFail: LlmResult<never> | undefined;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt += 1) {
    const started = args.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const res = await args.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages,
        }),
        signal: controller.signal,
      });
      const raw = await res.text();
      const elapsedMs = args.now() - started;
      llmLog("complete", {
        stage,
        provider: config.provider,
        model: config.model,
        status: res.status,
        attempt,
        elapsedMs,
      });

      if (res.status >= 400) {
        const fail = statusError(res.status, raw, stage);
        if (!fail.ok && fail.error.retryable && attempt < policy.maxRetries) {
          const after = parseRetryAfterMs(res.headers.get("retry-after") ?? undefined, args.now(), policy.maxDelayMs);
          await args.sleep(backoffMs(attempt, policy, after));
          lastFail = fail;
          continue;
        }
        return fail;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        return llmFail("INVALID_JSON", "Provider response was not JSON", { stage });
      }
      const text = readChoiceText(payload);
      if (text == null) {
        return llmFail("INVALID_JSON", "Provider response had no message content", { stage });
      }
      return { ok: true, data: { text, status: res.status } };
    } catch (err) {
      const code = networkCode(err);
      const timeout = code === "ABORT_ERR" || code === "ETIMEDOUT";
      const fail = llmFail(
        timeout ? "TIMEOUT" : "NETWORK",
        timeout ? `LLM request timed out after ${config.timeoutMs}ms` : "LLM network error",
        { stage, retryable: true },
      );
      llmLog("complete_error", { stage, attempt, code, level: "error" });
      if (attempt < policy.maxRetries) {
        await args.sleep(backoffMs(attempt, policy));
        lastFail = fail;
        continue;
      }
      return fail;
    } finally {
      clearTimeout(timer);
    }
  }

  return lastFail ?? llmFail("NETWORK", "LLM request failed", { stage, retryable: true });
}

function readChoiceText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content === "string") return message.content;
  return null;
}
