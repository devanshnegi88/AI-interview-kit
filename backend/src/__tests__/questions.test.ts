import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import { QUESTION_CODES, validateQuestions } from "../validation/questions";

describe("validateQuestions", () => {
  it("accepts assembled questions", () => {
    const kit = assembleKit(passingDraft());
    expect(validateQuestions(kit.questions)).toEqual([]);
  });

  it("rejects a question with no requirement_ids", () => {
    const kit = assembleKit(passingDraft());
    const questions = [{ ...kit.questions[0], requirement_ids: [] }, ...kit.questions.slice(1)];
    expect(validateQuestions(questions).some((i) => i.code === QUESTION_CODES.NO_REQUIREMENTS)).toBe(true);
  });

  it("rejects a duplicate prompt", () => {
    const kit = assembleKit(passingDraft());
    const questions = kit.questions.map((q, i) =>
      i === 1 ? { ...q, prompt: kit.questions[0].prompt } : q,
    );
    expect(validateQuestions(questions).some((i) => i.code === QUESTION_CODES.DUPLICATE_PROMPT)).toBe(true);
  });

  it("rejects estimated_minutes outside 5–180", () => {
    const kit = assembleKit(passingDraft());
    const questions = [{ ...kit.questions[0], estimated_minutes: 3 }, ...kit.questions.slice(1)];
    expect(validateQuestions(questions).some((i) => i.code === QUESTION_CODES.BAD_MINUTES)).toBe(true);
  });
});
