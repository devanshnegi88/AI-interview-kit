import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import { FLASHCARD_CODES, validateFlashcards } from "../validation/flashcards";

describe("validateFlashcards", () => {
  it("accepts assembled flashcards", () => {
    const kit = assembleKit(passingDraft());
    expect(validateFlashcards(kit.flashcards)).toEqual([]);
  });

  it("rejects identical front and back", () => {
    const kit = assembleKit(passingDraft());
    const cards = [{ ...kit.flashcards[0], back: kit.flashcards[0].front }, ...kit.flashcards.slice(1)];
    expect(validateFlashcards(cards).some((i) => i.code === FLASHCARD_CODES.SAME_SIDES)).toBe(true);
  });

  it("rejects a flashcard with no question_ids", () => {
    const kit = assembleKit(passingDraft());
    const cards = [{ ...kit.flashcards[0], question_ids: [] }, ...kit.flashcards.slice(1)];
    expect(validateFlashcards(cards).some((i) => i.code === FLASHCARD_CODES.NO_QUESTIONS)).toBe(true);
  });

  it("rejects a non-fc_ id", () => {
    const kit = assembleKit(passingDraft());
    const cards = [{ ...kit.flashcards[0], id: "q_abcdefghijkl" }, ...kit.flashcards.slice(1)];
    expect(validateFlashcards(cards).some((i) => i.code === FLASHCARD_CODES.BAD_ID)).toBe(true);
  });
});
