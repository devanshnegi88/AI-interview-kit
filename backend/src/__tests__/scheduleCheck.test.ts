import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import { SCHEDULE_CODES, validateSchedule } from "../validation/scheduleCheck";

describe("validateSchedule", () => {
  it("accepts an assembled schedule", () => {
    const kit = assembleKit(passingDraft());
    expect(
      validateSchedule({
        daysAvailable: kit.source.days_available,
        questions: kit.questions,
        flashcards: kit.flashcards,
        schedule: kit.schedule,
      }),
    ).toEqual([]);
  });

  it("rejects a day-count mismatch", () => {
    const kit = assembleKit(passingDraft({ days_available: 5 }));
    const issues = validateSchedule({
      daysAvailable: 5,
      questions: kit.questions,
      flashcards: kit.flashcards,
      schedule: kit.schedule.slice(0, 2),
    });
    expect(issues.some((i) => i.code === SCHEDULE_CODES.DAY_COUNT)).toBe(true);
  });

  it("rejects a question that is not scheduled", () => {
    const kit = assembleKit(passingDraft());
    const stripped = kit.schedule.map((day) => ({
      ...day,
      items: day.items.filter((item) => item.kind !== "question" || item.ref_id !== kit.questions[0].id),
      total_minutes: day.items
        .filter((item) => item.kind !== "question" || item.ref_id !== kit.questions[0].id)
        .reduce((n, item) => n + item.minutes, 0),
    }));
    const issues = validateSchedule({
      daysAvailable: kit.source.days_available,
      questions: kit.questions,
      flashcards: kit.flashcards,
      schedule: stripped,
    });
    expect(issues.some((i) => i.code === SCHEDULE_CODES.QUESTION_MISSING)).toBe(true);
  });
});
