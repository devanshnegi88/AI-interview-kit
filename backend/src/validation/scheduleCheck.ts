import type { Flashcard, Question, ScheduleDay } from "../../../shared/types";
import { issue, type KitValidationIssue } from "./issues";

export const SCHEDULE_CODES = {
  DAY_COUNT: "SCHED_DAY_COUNT",
  DAY_INDEX: "SCHED_DAY_INDEX",
  EMPTY_DAY: "SCHED_EMPTY_DAY",
  TOTAL_MISMATCH: "SCHED_TOTAL_MISMATCH",
  NON_INTEGER_MINUTES: "SCHED_NON_INTEGER_MINUTES",
  QUESTION_MISSING: "SCHED_QUESTION_MISSING",
  QUESTION_DUP: "SCHED_QUESTION_DUP",
  FLASHCARD_MISSING: "SCHED_FLASHCARD_MISSING",
} as const;

/**
 * Schedule validation. Day numbering, totals, and that every question is
 * scheduled exactly once (kind=question) and every flashcard at least once.
 * Does not call an LLM. Cross-collection existence of ref_ids is integrity.
 */
export function validateSchedule(input: {
  daysAvailable: number;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: ScheduleDay[];
}): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  const { daysAvailable, questions, flashcards, schedule } = input;

  if (schedule.length !== daysAvailable) {
    issues.push(
      issue(
        SCHEDULE_CODES.DAY_COUNT,
        `Schedule has ${schedule.length} day(s) but source.days_available is ${daysAvailable}.`,
        { path: "schedule" },
      ),
    );
  }

  const questionOnce = new Map<string, number>();
  const flashcardSeen = new Set<string>();

  schedule.forEach((day, index) => {
    const path = `schedule[${index}]`;
    if (day.day !== index + 1) {
      issues.push(
        issue(SCHEDULE_CODES.DAY_INDEX, `Schedule day at index ${index} has day=${day.day}, expected ${index + 1}.`, {
          path: `${path}.day`,
        }),
      );
    }
    if (day.items.length === 0) {
      issues.push(issue(SCHEDULE_CODES.EMPTY_DAY, `Schedule day ${day.day} has no items.`, { path: `${path}.items` }));
    }
    if (!Number.isInteger(day.total_minutes)) {
      issues.push(
        issue(SCHEDULE_CODES.NON_INTEGER_MINUTES, `Day ${day.day} total_minutes is not an integer.`, {
          path: `${path}.total_minutes`,
        }),
      );
    }
    day.items.forEach((item, ii) => {
      if (!Number.isInteger(item.minutes)) {
        issues.push(
          issue(SCHEDULE_CODES.NON_INTEGER_MINUTES, `Day ${day.day} item ${ii} minutes is not an integer.`, {
            path: `${path}.items[${ii}].minutes`,
          }),
        );
      }
    });
    const summed = day.items.reduce((n, item) => n + item.minutes, 0);
    if (summed !== day.total_minutes) {
      issues.push(
        issue(
          SCHEDULE_CODES.TOTAL_MISMATCH,
          `Day ${day.day} total_minutes=${day.total_minutes} but items sum to ${summed}.`,
          { path: `${path}.total_minutes` },
        ),
      );
    }
    day.items.forEach((item) => {
      if (item.kind === "question") {
        const prev = questionOnce.get(item.ref_id);
        if (prev !== undefined) {
          issues.push(
            issue(SCHEDULE_CODES.QUESTION_DUP, `Question ${item.ref_id} is scheduled as kind=question on more than one day.`, {
              path,
            }),
          );
        }
        questionOnce.set(item.ref_id, day.day);
      }
      if (item.kind === "flashcard") {
        flashcardSeen.add(item.ref_id);
      }
    });
  });

  for (const q of questions) {
    if (!questionOnce.has(q.id)) {
      issues.push(
        issue(SCHEDULE_CODES.QUESTION_MISSING, `Question ${q.id} is not scheduled as kind=question.`, {
          path: "schedule",
        }),
      );
    }
  }

  for (const fc of flashcards) {
    if (!flashcardSeen.has(fc.id)) {
      issues.push(
        issue(SCHEDULE_CODES.FLASHCARD_MISSING, `Flashcard ${fc.id} is not scheduled.`, { path: "schedule" }),
      );
    }
  }

  return issues;
}
