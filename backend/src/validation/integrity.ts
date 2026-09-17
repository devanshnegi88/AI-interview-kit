import type { InterviewKit } from "../../../shared/types";
import { issue, type KitValidationIssue } from "./issues";

export const INTEGRITY_CODES = {
  DUPLICATE_ID: "DUP_ID",
  UNKNOWN_REQUIREMENT_ID: "UNKNOWN_REQUIREMENT_ID",
  UNKNOWN_QUESTION_ID: "UNKNOWN_QUESTION_ID",
  UNKNOWN_SCHEDULE_REF: "UNKNOWN_SCHEDULE_REF",
} as const;

/**
 * Referential-integrity validation.
 *
 * - IDs unique across requirements, questions, and flashcards.
 * - question.requirement_ids ⊆ role.requirements[].id
 * - flashcard.question_ids ⊆ questions[].id
 * - schedule item ref_id exists for its kind
 *
 * Does not call an LLM. Does not recompute coverage or a schedule.
 */
export function collectIntegrityIssues(kit: InterviewKit): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  const seen = new Map<string, string>();

  function claim(id: string, where: string, path: string): void {
    const previous = seen.get(id);
    if (previous) {
      issues.push(issue(INTEGRITY_CODES.DUPLICATE_ID, `Duplicate id ${id} in ${where} (already ${previous}).`, { path }));
      return;
    }
    seen.set(id, where);
  }

  kit.role.requirements.forEach((req, i) => claim(req.id, "requirement", `role.requirements[${i}].id`));
  kit.questions.forEach((q, i) => claim(q.id, "question", `questions[${i}].id`));
  kit.flashcards.forEach((fc, i) => claim(fc.id, "flashcard", `flashcards[${i}].id`));

  const reqIds = new Set(kit.role.requirements.map((r) => r.id));
  const qIds = new Set(kit.questions.map((q) => q.id));
  const fcIds = new Set(kit.flashcards.map((f) => f.id));

  kit.questions.forEach((q, i) => {
    q.requirement_ids.forEach((rid, j) => {
      if (!reqIds.has(rid)) {
        issues.push(
          issue(INTEGRITY_CODES.UNKNOWN_REQUIREMENT_ID, `Question ${q.id} references unknown requirement ${rid}.`, {
            path: `questions[${i}].requirement_ids[${j}]`,
          }),
        );
      }
    });
  });

  kit.flashcards.forEach((fc, i) => {
    fc.question_ids.forEach((qid, j) => {
      if (!qIds.has(qid)) {
        issues.push(
          issue(INTEGRITY_CODES.UNKNOWN_QUESTION_ID, `Flashcard ${fc.id} references unknown question ${qid}.`, {
            path: `flashcards[${i}].question_ids[${j}]`,
          }),
        );
      }
    });
  });

  kit.schedule.forEach((day, di) => {
    day.items.forEach((item, ii) => {
      const exists = item.kind === "flashcard" ? fcIds.has(item.ref_id) : qIds.has(item.ref_id);
      if (!exists) {
        issues.push(
          issue(
            INTEGRITY_CODES.UNKNOWN_SCHEDULE_REF,
            `Day ${day.day} ${item.kind} references unknown id ${item.ref_id}.`,
            { path: `schedule[${di}].items[${ii}].ref_id` },
          ),
        );
      }
    });
  });

  return issues;
}
