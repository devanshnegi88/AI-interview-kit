import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLlmRuntime, generateWithLLM } from "./generate";
import { parseJson } from "./json";

const Schema = z.object({ name: z.string(), count: z.number().int() }).strict();

function chatOk(content: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

function chatHttp(status: number, body = "{}", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

function runtime(fetchFn: (url: string, init: RequestInit) => Promise<Response>, extra: { maxRepairAttempts?: number; maxRetries?: number } = {}) {
  const sleep = vi.fn(async () => undefined);
  return {
    sleep,
    rt: createLlmRuntime({
      provider: "groq",
      apiKey: "test-key",
      minIntervalMs: 0,
      maxConcurrency: 1,
      maxRetries: extra.maxRetries ?? 2,
      maxRepairAttempts: extra.maxRepairAttempts ?? 2,
      timeoutMs: 1000,
      fetch: fetchFn,
      sleep,
      random: () => 0,
    }),
  };
}

describe("parseJson", () => {
  it("extracts JSON from a markdown fence", () => {
    const parsed = parseJson('here\n```json\n{"name":"a","count":1}\n```\n');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual({ name: "a", count: 1 });
  });
});

describe("generateWithLLM", () => {
  it("parses and Zod-validates a good response", async () => {
    const { rt } = runtime(async () => chatOk('{"name":"acme","count":2}'));
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "Return a company.",
      input: { hint: "acme" },
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: "acme", count: 2 });
  });

  it("repairs invalid JSON then validates", async () => {
    let n = 0;
    const { rt } = runtime(async () => {
      n += 1;
      if (n === 1) return chatOk("not json at all");
      return chatOk('{"name":"fixed","count":3}');
    });
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "Return a company.",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("fixed");
    expect(n).toBe(2);
  });

  it("returns a structured failure after bounded repair", async () => {
    const { rt } = runtime(async () => chatOk('{"nope":true}'), { maxRepairAttempts: 1 });
    const result = await generateWithLLM({
      stage: "brief",
      systemPrompt: "Return a company.",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
      expect(result.error.stage).toBe("brief");
      expect(result.error.issues?.length).toBeGreaterThan(0);
    }
  });

  it("retries 429 and honors Retry-After", async () => {
    let n = 0;
    const { rt, sleep } = runtime(async () => {
      n += 1;
      if (n === 1) return chatHttp(429, "slow", { "retry-after": "1" });
      return chatOk('{"name":"ok","count":1}');
    });
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "x",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(true);
    expect(n).toBe(2);
    expect(sleep).toHaveBeenCalled();
  });

  it("does not retry 403", async () => {
    let n = 0;
    const { rt } = runtime(async () => {
      n += 1;
      return chatHttp(403, "no");
    });
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "x",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.retryable).toBe(false);
    }
    expect(n).toBe(1);
  });

  it("does not retry 400 or 401", async () => {
    for (const status of [400, 401]) {
      let n = 0;
      const { rt } = runtime(async () => {
        n += 1;
        return chatHttp(status, "no");
      });
      const result = await generateWithLLM({
        stage: "test",
        systemPrompt: "x",
        input: {},
        schema: Schema,
      }, rt);
      expect(result.ok).toBe(false);
      expect(n).toBe(1);
      if (!result.ok) expect(result.error.retryable).toBe(false);
    }
  });

  it("retries 503 then succeeds", async () => {
    let n = 0;
    const { rt } = runtime(async () => {
      n += 1;
      if (n < 3) return chatHttp(503, "down");
      return chatOk('{"name":"up","count":1}');
    });
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "x",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(true);
    expect(n).toBe(3);
  });

  it("fails closed when the API key is missing", async () => {
    const rt = createLlmRuntime({
      provider: "groq",
      apiKey: "",
      minIntervalMs: 0,
      fetch: async () => chatOk("{}"),
    });
    const result = await generateWithLLM({
      stage: "test",
      systemPrompt: "x",
      input: {},
      schema: Schema,
    }, rt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG");
  });
});
