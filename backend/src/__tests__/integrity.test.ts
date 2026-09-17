import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import { collectIntegrityIssues, INTEGRITY_CODES } from "../validation/integrity";

describe("collectIntegrityIssues", () => {
  it("accepts an assembled kit", () => {
    const kit = assembleKit(passingDraft());
    expect(collectIntegrityIssues(kit)).toEqual([]);
  });

  it("flags a question that cites an unknown requirement", () => {
    const kit = assembleKit(passingDraft());
    kit.questions[0].requirement_ids.push("req_notrealid12");
    const issues = collectIntegrityIssues(kit);
    expect(issues.some((i) => i.code === INTEGRITY_CODES.UNKNOWN_REQUIREMENT_ID)).toBe(true);
  });

  it("flags a flashcard that cites an unknown question", () => {
    const kit = assembleKit(passingDraft());
    kit.flashcards[0].question_ids.push("q_notrealid1234");
    const issues = collectIntegrityIssues(kit);
    expect(issues.some((i) => i.code === INTEGRITY_CODES.UNKNOWN_QUESTION_ID)).toBe(true);
  });
});
