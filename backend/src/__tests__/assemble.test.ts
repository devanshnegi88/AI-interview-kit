import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit, validateKit } from "../validation/assemble";
import { INTEGRITY_CODES } from "../validation/integrity";

describe("assembleKit", () => {
  it("returns a versioned kit whose coverage was computed, not supplied", () => {
    const kit = assembleKit(passingDraft());
    expect(kit.version).toBe("1.0");
    expect(kit.coverage.passed).toBe(true);
    expect(kit.schedule).toHaveLength(kit.source.days_available);
  });

  it("is deterministic across two assemblies of the same draft", () => {
    const draft = passingDraft();
    expect(assembleKit(draft)).toEqual(assembleKit(draft));
  });

  it("assigns stable ids when the draft omits them", () => {
    const draft = passingDraft();
    draft.questions = draft.questions.map((q) => ({ ...q, id: undefined }));
    draft.flashcards = draft.flashcards.map((f) => ({ ...f, id: undefined }));
    const kit = assembleKit(draft);
    expect(kit.questions.every((q) => q.id.startsWith("q_"))).toBe(true);
    expect(kit.flashcards.every((f) => f.id.startsWith("fc_"))).toBe(true);
  });
});

describe("validateKit", () => {
  it("accepts an assembled kit", () => {
    const result = validateKit(assembleKit(passingDraft()));
    expect(result.success).toBe(true);
    expect(result.kit?.coverage.passed).toBe(true);
  });

  it("rejects unknown JSON", () => {
    const result = validateKit({ hello: "world" });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === "SCHEMA")).toBe(true);
  });

  it("recomputes coverage and ignores a fake passed:true", () => {
    const kit = assembleKit(passingDraft());
    kit.questions = kit.questions.filter((q) => q.type !== "system_design");
    kit.coverage.passed = true;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.kit?.coverage.passed).toBe(false);
  });

  it("flags a dangling schedule reference", () => {
    const kit = assembleKit(passingDraft());
    kit.schedule[0].items.push({ kind: "question", ref_id: "q_doesnotexist1", minutes: 10 });
    kit.schedule[0].total_minutes += 10;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === INTEGRITY_CODES.UNKNOWN_SCHEDULE_REF)).toBe(true);
  });
});
