import { describe, expect, it, vi } from "vitest";
import { createLlmRuntime } from "../../llm";
import { isQuestionId } from "../../validation/ids";
import {
  GeneratedQuestionSchema,
  QuestionCategorySchema,
  QuestionDifficultyLevelSchema,
} from "../../validation/schema";
import {
  generateAllQuestions,
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateTechnicalQuestions,
} from "./index";
import type { QuestionGenContext } from "./common";

const reqs: QuestionGenContext["requirements"] = [
  { id: "req_aaaaaaaaaaaa", text: "TypeScript", kind: "technical", priority: "must" },
  { id: "req_bbbbbbbbbbbb", text: "PostgreSQL", kind: "technical", priority: "must" },
  { id: "req_cccccccccccc", text: "Mentors others", kind: "behavioural", priority: "must" },
];

function chatOk(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function q(partial: Record<string, unknown> = {}) {
  return {
    requirement_ids: ["req_aaaaaaaaaaaa"],
    prompt: "How would you structure a TypeScript service for this role?",
    answer_outline: ["Clarify constraints", "Sketch modules", "Call out testing"],
    difficulty: 2,
    ...partial,
  };
}

function pack(questions: unknown[]) {
  return JSON.stringify({ questions });
}

function rt(content: string | ((body: string) => string), extra: { maxRepairAttempts?: number } = {}) {
  const bodies: string[] = [];
  return {
    bodies,
    runtime: createLlmRuntime({
      provider: "groq",
      apiKey: "test-key",
      minIntervalMs: 0,
      maxRetries: 0,
      maxRepairAttempts: extra.maxRepairAttempts ?? 0,
      sleep: vi.fn(async () => undefined),
      random: () => 0,
      fetch: async (_url, init) => {
        const body = String(init.body ?? "");
        bodies.push(body);
        return chatOk(typeof content === "function" ? content(body) : content);
      },
    }),
  };
}

const ctxTech: QuestionGenContext = {
  requirements: reqs,
  jobDescription: "Required: TypeScript and PostgreSQL. Mentors others.",
  role: { title: "Backend Engineer", level: "mid" },
  companyBrief: { summary: "Acme payments", what_they_do: "APIs", sources: [] },
};

describe("category and difficulty schemas", () => {
  it("accepts only the four categories and difficulty 1|2|3", () => {
    expect(QuestionCategorySchema.safeParse("technical").success).toBe(true);
    expect(QuestionCategorySchema.safeParse("behavioural").success).toBe(true);
    expect(QuestionCategorySchema.safeParse("system-design").success).toBe(true);
    expect(QuestionCategorySchema.safeParse("company-fit").success).toBe(true);
    expect(QuestionCategorySchema.safeParse("role").success).toBe(false);
    expect(QuestionDifficultyLevelSchema.safeParse(1).success).toBe(true);
    expect(QuestionDifficultyLevelSchema.safeParse(3).success).toBe(true);
    expect(QuestionDifficultyLevelSchema.safeParse(4).success).toBe(false);
    expect(QuestionDifficultyLevelSchema.safeParse("hard").success).toBe(false);
  });
});

describe("question generation stages", () => {
  it("links questions to real requirement ids", async () => {
    const { runtime } = rt(pack([q(), q({ requirement_ids: ["req_bbbbbbbbbbbb"], prompt: "How do you index PostgreSQL for this JD?" })]));
    const result = await generateTechnicalQuestions(ctxTech, runtime);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(2);
    for (const item of result.data) {
      expect(item.requirement_ids.every((id) => reqs.some((r) => r.id === id))).toBe(true);
      expect(item.category).toBe("technical");
      expect(isQuestionId(item.id)).toBe(true);
      expect(GeneratedQuestionSchema.safeParse(item).success).toBe(true);
    }
  });

  it("rejects invalid requirement IDs from the LLM", async () => {
    const { runtime } = rt(pack([q({ requirement_ids: ["req_notrealid12"] })]), { maxRepairAttempts: 0 });
    const result = await generateTechnicalQuestions(ctxTech, runtime);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("rejects an invalid difficulty", async () => {
    const { runtime } = rt(pack([q({ difficulty: 5 })]), { maxRepairAttempts: 0 });
    const result = await generateTechnicalQuestions(ctxTech, runtime);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("rejects an invalid category extra field / malformed category via Zod", async () => {
    const { runtime } = rt(pack([q({ category: "trivia" })]), { maxRepairAttempts: 0 });
    const result = await generateTechnicalQuestions(ctxTech, runtime);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("returns structured failure on malformed LLM JSON", async () => {
    const { runtime } = rt("NOT JSON {", { maxRepairAttempts: 0 });
    const result = await generateTechnicalQuestions(ctxTech, runtime);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["INVALID_JSON", "SCHEMA"]).toContain(result.error.code);
  });

  it("runs multiple categories independently", async () => {
    const { runtime } = rt((body) => {
      if (body.includes("Category: behavioural") || body.includes("questions_behavioural")) {
        return pack([
          q({
            requirement_ids: ["req_cccccccccccc"],
            prompt: "Tell me about mentoring someone on this team.",
            difficulty: 1,
          }),
        ]);
      }
      if (body.includes("Category: technical") || body.includes("questions_technical")) {
        return pack([q({ difficulty: 2 })]);
      }
      return pack([q({ prompt: "Design a payments API from this JD.", difficulty: 3 })]);
    });
    const bundle = await generateAllQuestions(ctxTech, runtime);
    const cats = new Set(bundle.questions.map((q) => q.category));
    expect(cats.has("technical")).toBe(true);
    expect(cats.has("behavioural")).toBe(true);
    expect(bundle.questions.every((q) => [1, 2, 3].includes(q.difficulty))).toBe(true);
  });

  it("does not call the model for behavioural when there are no behavioural requirements", async () => {
    const { runtime, bodies } = rt(pack([q()]));
    const result = await generateBehaviouralQuestions(
      { requirements: reqs.filter((r) => r.kind === "technical"), jobDescription: "TypeScript only." },
      runtime,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
    expect(bodies).toHaveLength(0);
  });

  it("skips company-fit when the brief is empty", async () => {
    const { runtime, bodies } = rt(pack([q()]));
    const result = await generateCompanyFitQuestions({ requirements: reqs }, runtime);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
    expect(bodies).toHaveLength(0);
  });
});
