import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import {
  ensureId,
  ID_CODES,
  isFlashcardId,
  isQuestionId,
  isRequirementId,
  isStableId,
  questionId,
  stableId,
  validateStableIds,
} from "../validation/ids";

describe("stableId", () => {
  it("is deterministic for the same parts", () => {
    expect(stableId("q", "technical", "Explain indexes")).toBe(
      stableId("q", "technical", "Explain indexes"),
    );
  });

  it("normalizes whitespace and case", () => {
    expect(stableId("req", "  TypeScript APIs ")).toBe(stableId("req", "typescript apis"));
  });

  it("changes when content changes", () => {
    expect(stableId("q", "a")).not.toBe(stableId("q", "b"));
  });

  it("matches the stable id pattern", () => {
    expect(isStableId(questionId("behavioral", "Tell me about a conflict"))).toBe(true);
  });

  it("ensureId keeps a well-formed id of the right kind", () => {
    const given = "q_abcdefgh";
    expect(ensureId("q", given, "ignored")).toBe(given);
  });

  it("ensureId ignores ids of the wrong kind", () => {
    const derived = ensureId("q", "req_abcdefgh", "technical", "prompt");
    expect(derived.startsWith("q_")).toBe(true);
    expect(derived).not.toBe("req_abcdefgh");
  });

  it("kind helpers distinguish prefixes", () => {
    expect(isRequirementId("req_abcdefgh")).toBe(true);
    expect(isQuestionId("q_abcdefgh")).toBe(true);
    expect(isFlashcardId("fc_abcdefgh")).toBe(true);
    expect(isQuestionId("req_abcdefgh")).toBe(false);
  });

  it("validateStableIds accepts an assembled kit and flags a wrong-kind id", () => {
    const kit = assembleKit(passingDraft());
    expect(validateStableIds(kit)).toEqual([]);
    kit.questions[0].id = "req_abcdefghijkl";
    expect(validateStableIds(kit).some((i) => i.code === ID_CODES.WRONG_KIND)).toBe(true);
  });
});
