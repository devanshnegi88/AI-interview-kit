import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { buildSchedule } from "../scheduling/schedule";
import { assembleKit } from "../validation/assemble";

describe("buildSchedule", () => {
  it("is deterministic", () => {
    const kit = assembleKit(passingDraft({ days_available: 5 }));
    const input = {
      questions: kit.questions,
      flashcards: kit.flashcards,
      daysAvailable: 5,
      hoursPerDay: 2,
      requirements: kit.role.requirements,
    };
    expect(buildSchedule(input)).toEqual(buildSchedule(input));
  });

  it("does not depend on input order", () => {
    const kit = assembleKit(passingDraft({ days_available: 4 }));
    const forward = buildSchedule({
      questions: kit.questions,
      flashcards: kit.flashcards,
      daysAvailable: 4,
      hoursPerDay: 2,
      requirements: kit.role.requirements,
    });
    const reversed = buildSchedule({
      questions: [...kit.questions].reverse(),
      flashcards: [...kit.flashcards].reverse(),
      daysAvailable: 4,
      hoursPerDay: 2,
      requirements: kit.role.requirements,
    });
    expect(reversed).toEqual(forward);
  });

  it("emits one day per daysAvailable and never an empty day", () => {
    const kit = assembleKit(passingDraft({ days_available: 7, hours_per_day: 1.5 }));
    expect(kit.schedule).toHaveLength(7);
    kit.schedule.forEach((day, i) => {
      expect(day.day).toBe(i + 1);
      expect(day.items.length).toBeGreaterThan(0);
      expect(day.total_minutes).toBe(day.items.reduce((n, item) => n + item.minutes, 0));
    });
  });

  it("schedules every question exactly once as kind=question", () => {
    const kit = assembleKit(passingDraft());
    const questionItems = kit.schedule.flatMap((d) => d.items.filter((i) => i.kind === "question"));
    const ids = questionItems.map((i) => i.ref_id).sort();
    const expected = kit.questions.map((q) => q.id).sort();
    expect(ids).toEqual(expected);
  });

  it("schedules every flashcard at least once", () => {
    const kit = assembleKit(passingDraft());
    const scheduled = new Set(
      kit.schedule.flatMap((d) => d.items.filter((i) => i.kind === "flashcard").map((i) => i.ref_id)),
    );
    for (const card of kit.flashcards) {
      expect(scheduled.has(card.id)).toBe(true);
    }
  });

  it("only references ids that exist on the kit", () => {
    const kit = assembleKit(passingDraft());
    const qids = new Set(kit.questions.map((q) => q.id));
    const fids = new Set(kit.flashcards.map((f) => f.id));
    for (const day of kit.schedule) {
      for (const item of day.items) {
        if (item.kind === "flashcard") expect(fids.has(item.ref_id)).toBe(true);
        else expect(qids.has(item.ref_id)).toBe(true);
      }
    }
  });
});
