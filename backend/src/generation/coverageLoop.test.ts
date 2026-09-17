import { describe, expect, it, vi } from "vitest";
import type { GeneratedQuestion } from "../../../shared/types";
import { runCoverageLoop, MAX_COVERAGE_PASSES } from "./coverageLoop";
import type { QuestionGenContext } from "./questions/common";

const mustA = { id: "req_aaaaaaaaaaaa", text: "TypeScript", kind: "technical", priority: "must" as const };
const mustB = { id: "req_bbbbbbbbbbbb", text: "PostgreSQL", kind: "technical", priority: "must" as const };
const niceC = { id: "req_cccccccccccc", text: "Rust", kind: "technical", priority: "nice" as const };

function gq(partial: Partial<GeneratedQuestion> & Pick<GeneratedQuestion, "id" | "requirement_ids">): GeneratedQuestion {
  return {
    category: "technical",
    prompt: `Question for ${partial.id}`,
    answer_outline: ["step"],
    difficulty: 2,
    ...partial,
  };
}

const ctx = (requirements: QuestionGenContext["requirements"]): QuestionGenContext => ({
  requirements,
  jobDescription: "Required: TypeScript and PostgreSQL. Nice to have: Rust.",
  role: { title: "Engineer", level: "mid" },
});

describe("runCoverageLoop", () => {
  it("passes on the first pass when all must-haves are covered", async () => {
    const missing = vi.fn(async () => ({ ok: true as const, data: [] as GeneratedQuestion[] }));
    const result = await runCoverageLoop(ctx([mustA, mustB]), {
      generateInitial: async () => ({
        questions: [gq({ id: "q_aaaaaaaaaaaa", requirement_ids: [mustA.id] }), gq({ id: "q_bbbbbbbbbbbb", requirement_ids: [mustB.id] })],
        failedStages: [],
      }),
      generateMissing: missing,
    });
    expect(result.passed).toBe(true);
    expect(result.passes).toBe(1);
    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(missing).not.toHaveBeenCalled();
  });

  it("generates for one uncovered requirement and succeeds on the second pass", async () => {
    const missing = vi.fn(async (_c: QuestionGenContext, uncovered: { id: string }[]) => ({
      ok: true as const,
      data: uncovered.map((u) => gq({ id: `q_fill_${u.id.slice(-4)}`, requirement_ids: [u.id] })),
    }));
    const result = await runCoverageLoop(ctx([mustA, mustB]), {
      generateInitial: async () => ({
        questions: [gq({ id: "q_aaaaaaaaaaaa", requirement_ids: [mustA.id] })],
        failedStages: [],
      }),
      generateMissing: missing,
    });
    expect(result.passes).toBe(2);
    expect(result.passed).toBe(true);
    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(missing).toHaveBeenCalledTimes(1);
    expect(missing.mock.calls[0]![1].map((r: { id: string }) => r.id)).toEqual([mustB.id]);
  });

  it("targets multiple uncovered requirements on the fill pass", async () => {
    const missing = vi.fn(async (_c: QuestionGenContext, uncovered: { id: string }[]) => ({
      ok: true as const,
      data: uncovered.map((u) => gq({ id: `q_${u.id}`, requirement_ids: [u.id] })),
    }));
    const result = await runCoverageLoop(ctx([mustA, mustB]), {
      generateInitial: async () => ({ questions: [], failedStages: [] }),
      generateMissing: missing,
    });
    expect(missing.mock.calls[0]![1].map((r: { id: string }) => r.id).sort()).toEqual([mustA.id, mustB.id].sort());
    expect(result.passed).toBe(true);
    expect(result.passes).toBe(2);
  });

  it("stops at MAX_COVERAGE_PASSES if still uncovered", async () => {
    const missing = vi.fn(async () => ({ ok: true as const, data: [] as GeneratedQuestion[] }));
    const result = await runCoverageLoop(ctx([mustA, mustB]), {
      maxPasses: MAX_COVERAGE_PASSES,
      generateInitial: async () => ({
        questions: [gq({ id: "q_aaaaaaaaaaaa", requirement_ids: [mustA.id] })],
        failedStages: [],
      }),
      generateMissing: missing,
    });
    expect(result.passes).toBe(2);
    expect(result.passed).toBe(false);
    expect(result.uncovered_requirement_ids).toEqual([mustB.id]);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("does not claim a pass when there are no must requirements", async () => {
    const result = await runCoverageLoop(ctx([]), {
      generateInitial: async () => ({ questions: [], failedStages: [] }),
      generateMissing: async () => ({ ok: true, data: [] }),
    });
    expect(result.passed).toBe(false);
    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(result.passes).toBe(1);
  });

  it("does not require nice-only requirements to be covered", async () => {
    const result = await runCoverageLoop(ctx([niceC]), {
      generateInitial: async () => ({ questions: [], failedStages: [] }),
      generateMissing: async () => ({ ok: true, data: [] }),
    });
    expect(result.passed).toBe(false);
    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(result.questions).toEqual([]);
  });

  it("drops duplicate question IDs", async () => {
    const dup = gq({ id: "q_aaaaaaaaaaaa", requirement_ids: [mustA.id], prompt: "first" });
    const result = await runCoverageLoop(ctx([mustA]), {
      generateInitial: async () => ({
        questions: [dup, { ...dup, prompt: "second copy" }],
        failedStages: [],
      }),
      generateMissing: async () => ({ ok: true, data: [] }),
    });
    expect(result.questions.filter((q) => q.id === dup.id)).toHaveLength(1);
    expect(result.questions[0]!.prompt).toBe("first");
  });

  it("ignores invalid requirement references for coverage", async () => {
    const result = await runCoverageLoop(ctx([mustA]), {
      generateInitial: async () => ({
        questions: [
          gq({ id: "q_fake", requirement_ids: ["req_notrealid12"] }),
          gq({ id: "q_mixed", requirement_ids: ["req_notrealid12", mustA.id] }),
        ],
        failedStages: [],
      }),
      generateMissing: async () => ({ ok: true, data: [] }),
    });
    expect(result.questions.some((q) => q.requirement_ids.includes("req_notrealid12"))).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.questions.find((q) => q.id === "q_fake")).toBeUndefined();
    expect(result.questions.find((q) => q.id === "q_mixed")!.requirement_ids).toEqual([mustA.id]);
  });
});
