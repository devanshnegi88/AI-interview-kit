import type { Question } from "../../../shared/types";
import { isQuestionId } from "./ids";
import { issue, type KitValidationIssue } from "./issues";

export const QUESTION_CODES = {
  BAD_ID: "Q_BAD_ID",
  DUPLICATE_ID: "Q_DUPLICATE_ID",
  DUPLICATE_PROMPT: "Q_DUPLICATE_PROMPT",
  SHORT_PROMPT: "Q_SHORT_PROMPT",
  NO_REQUIREMENTS: "Q_NO_REQUIREMENTS",
  NO_TAGS: "Q_NO_TAGS",
  NO_OUTLINE: "Q_NO_OUTLINE",
  BAD_MINUTES: "Q_BAD_MINUTES",
  EMPTY_SET: "Q_EMPTY_SET",
} as const;

/**
 * Question validation. Structural + uniqueness. Does not call an LLM.
 */
export function validateQuestions(questions: Question[]): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  if (questions.length === 0) {
    issues.push(issue(QUESTION_CODES.EMPTY_SET, "Kit must contain at least one question.", { path: "questions" }));
    return issues;
  }

  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();

  questions.forEach((q, index) => {
    const path = `questions[${index}]`;
    if (!isQuestionId(q.id)) {
      issues.push(issue(QUESTION_CODES.BAD_ID, `Question id must be q_ + 8–64 [a-z0-9], got "${q.id}".`, { path: `${path}.id` }));
    }
    if (seenIds.has(q.id)) {
      issues.push(issue(QUESTION_CODES.DUPLICATE_ID, `Duplicate question id ${q.id}.`, { path: `${path}.id` }));
    }
    seenIds.add(q.id);

    const prompt = q.prompt.trim();
    if (prompt.length < 8) {
      issues.push(issue(QUESTION_CODES.SHORT_PROMPT, "Question prompt must be at least 8 characters.", { path: `${path}.prompt` }));
    }
    const promptKey = prompt.toLowerCase();
    if (seenPrompts.has(promptKey)) {
      issues.push(issue(QUESTION_CODES.DUPLICATE_PROMPT, `Duplicate question prompt: "${prompt}".`, { path: `${path}.prompt` }));
    }
    seenPrompts.add(promptKey);

    if (q.requirement_ids.length === 0) {
      issues.push(issue(QUESTION_CODES.NO_REQUIREMENTS, "Question must cite at least one requirement_id.", { path: `${path}.requirement_ids` }));
    }
    if (q.tags.length === 0) {
      issues.push(issue(QUESTION_CODES.NO_TAGS, "Question must have at least one tag.", { path: `${path}.tags` }));
    }
    if (q.answer_outline.length === 0) {
      issues.push(issue(QUESTION_CODES.NO_OUTLINE, "Question must have an answer_outline.", { path: `${path}.answer_outline` }));
    }
    if (!Number.isInteger(q.estimated_minutes) || q.estimated_minutes < 5 || q.estimated_minutes > 180) {
      issues.push(
        issue(QUESTION_CODES.BAD_MINUTES, "estimated_minutes must be an integer 5–180.", { path: `${path}.estimated_minutes` }),
      );
    }
  });

  return issues;
}
