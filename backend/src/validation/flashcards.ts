import type { Flashcard } from "../../../shared/types";
import { isFlashcardId } from "./ids";
import { issue, type KitValidationIssue } from "./issues";

export const FLASHCARD_CODES = {
  BAD_ID: "FC_BAD_ID",
  DUPLICATE_ID: "FC_DUPLICATE_ID",
  DUPLICATE_FRONT: "FC_DUPLICATE_FRONT",
  EMPTY_FRONT: "FC_EMPTY_FRONT",
  EMPTY_BACK: "FC_EMPTY_BACK",
  SAME_SIDES: "FC_SAME_SIDES",
  NO_REQUIREMENTS: "FC_NO_REQUIREMENTS",
  NO_QUESTIONS: "FC_NO_QUESTIONS",
  EMPTY_SET: "FC_EMPTY_SET",
} as const;

/**
 * Flashcard validation. Structural + uniqueness. Does not call an LLM.
 */
export function validateFlashcards(flashcards: Flashcard[]): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  if (flashcards.length === 0) {
    issues.push(issue(FLASHCARD_CODES.EMPTY_SET, "Kit must contain at least one flashcard.", { path: "flashcards" }));
    return issues;
  }

  const seenIds = new Set<string>();
  const seenFronts = new Set<string>();

  flashcards.forEach((fc, index) => {
    const path = `flashcards[${index}]`;
    if (!isFlashcardId(fc.id)) {
      issues.push(issue(FLASHCARD_CODES.BAD_ID, `Flashcard id must be fc_ + 8–64 [a-z0-9], got "${fc.id}".`, { path: `${path}.id` }));
    }
    if (seenIds.has(fc.id)) {
      issues.push(issue(FLASHCARD_CODES.DUPLICATE_ID, `Duplicate flashcard id ${fc.id}.`, { path: `${path}.id` }));
    }
    seenIds.add(fc.id);

    const front = fc.front.trim();
    const back = fc.back.trim();
    if (front.length === 0) {
      issues.push(issue(FLASHCARD_CODES.EMPTY_FRONT, "Flashcard front must be non-empty.", { path: `${path}.front` }));
    }
    if (back.length === 0) {
      issues.push(issue(FLASHCARD_CODES.EMPTY_BACK, "Flashcard back must be non-empty.", { path: `${path}.back` }));
    }
    if (front.length > 0 && back.length > 0 && front.toLowerCase() === back.toLowerCase()) {
      issues.push(issue(FLASHCARD_CODES.SAME_SIDES, "Flashcard front and back must differ.", { path }));
    }
    const frontKey = front.toLowerCase();
    if (frontKey && seenFronts.has(frontKey)) {
      issues.push(issue(FLASHCARD_CODES.DUPLICATE_FRONT, `Duplicate flashcard front: "${front}".`, { path: `${path}.front` }));
    }
    seenFronts.add(frontKey);

    const requirementIds = fc.requirement_ids ?? fc.question_ids ?? [];
    if (requirementIds.length === 0) {
      issues.push(
        issue(
          FLASHCARD_CODES.NO_REQUIREMENTS,
          "Flashcard must cite at least one requirement_id.",
          { path: `${path}.requirement_ids` },
        ),
      );
    }
    if (!fc.requirement_ids && fc.question_ids && fc.question_ids.length > 0) {
      issues.push(
        issue(
          FLASHCARD_CODES.NO_QUESTIONS,
          "Legacy flashcard.question_ids is deprecated; use flashcard.requirement_ids.",
          { path: `${path}.question_ids` },
        ),
      );
    }
  });

  return issues;
}
