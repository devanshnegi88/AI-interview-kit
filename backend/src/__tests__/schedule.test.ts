import { describe, expect, it } from "vitest";
import type { Requirement } from "../../../shared/types";
import { passingDraft } from "../__fixtures__/kitDraft";
import { buildSchedule } from "../scheduling/schedule";
import { assembleKit } from "../validation/assemble";
import { ScheduleDaySchema } from "../validation/schema";

function makeQuestion(
  id: string,
  type: "technical" | "behavioral" | "system_design" | "company" | "role",
  difficulty: "easy" | "medium" | "hard",
  requirement_ids: string[],
  minutes = 20,
) {
  return {
    id,
    type,
    difficulty,
    prompt: `${type} question ${id}`,
    why_asked: "test",
    requirement_ids,
    tags: [type],
    answer_outline: ["Answer step one", "Answer step two"],
    follow_ups: [],
    estimated_minutes: minutes,
  };
}

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

  it("satisfies the requested day-count matrix and validates with Zod", () => {
    const cases = [1, 2, 5, 60];
    for (const days of cases) {
      const questions = [
        makeQuestion("q_a1234567890", "technical", "hard", ["req_a1234567890"], 30),
        makeQuestion("q_b1234567890", "technical", "medium", ["req_b1234567890"], 25),
        makeQuestion("q_c1234567890", "behavioral", "easy", ["req_c1234567890"], 15),
      ];
      const flashcards = [
        { id: "fc_aaaaaaaa", front: "front 1", back: "back 1", requirement_ids: ["req_a1234567890"] },
        { id: "fc_bbbbbbbb", front: "front 2", back: "back 2", requirement_ids: ["req_b1234567890"] },
      ];
      const requirements: Requirement[] = [
        { id: "req_a1234567890", text: "must a", priority: "must_have" },
        { id: "req_b1234567890", text: "must b", priority: "must_have" },
        { id: "req_c1234567890", text: "nice a", priority: "nice_to_have" },
      ];
      const schedule = buildSchedule({ questions, flashcards, daysAvailable: days, hoursPerDay: 2, requirements });
      expect(schedule).toHaveLength(days);
      expect(schedule.every((day) => day.items.length > 0)).toBe(true);
      expect(ScheduleDaySchema.array().safeParse(schedule).success).toBe(true);
    }
  });

  it("keeps must-have and harder content earlier for few and many questions", () => {
    const requirements: Requirement[] = [
      { id: "req_d1234567890", text: "must 1", priority: "must_have" },
      { id: "req_e1234567890", text: "must 2", priority: "must_have" },
      { id: "req_f1234567890", text: "nice 1", priority: "nice_to_have" },
    ];
    const questions = [
      makeQuestion("q_f1111111111", "company", "easy", ["req_f1234567890"], 20),
      makeQuestion("q_g1111111111", "technical", "hard", ["req_e1234567890"], 25),
      makeQuestion("q_h1111111111", "system_design", "medium", ["req_d1234567890"], 20),
      makeQuestion("q_i1111111111", "role", "easy", ["req_d1234567890"], 18),
      makeQuestion("q_j1111111111", "behavioral", "hard", ["req_f1234567890"], 22),
    ];
    const schedule = buildSchedule({
      questions,
      flashcards: questions.map((question) => ({
        id: `fc_${question.id.slice(2)}`,
        front: question.prompt,
        back: question.prompt,
        requirement_ids: question.requirement_ids,
      })),
      daysAvailable: 5,
      hoursPerDay: 2,
      requirements,
    });
    const orderedQuestionDays = schedule.flatMap((day) =>
      day.items.filter((item) => item.kind === "question").map((item) => ({ day: day.day, id: item.ref_id })),
    );
    const qDay = new Map(orderedQuestionDays.map((entry) => [entry.id, entry.day]));
    expect(qDay.get("q_g1111111111") ?? 99).toBeLessThan(qDay.get("q_h1111111111") ?? 100);
    expect(qDay.get("q_h1111111111") ?? 99).toBeLessThan(qDay.get("q_f1111111111") ?? 100);
    expect(qDay.get("q_g1111111111") ?? 99).toBeLessThan(qDay.get("q_j1111111111") ?? 100);
  });

  it("handles mixed difficulty and must/nice requirement ordering without arbitrary LLM scheduling", () => {
    const requirements: Requirement[] = [
      { id: "req_a1234567890", text: "must 1", priority: "must_have" },
      { id: "req_b1234567890", text: "must 2", priority: "must_have" },
      { id: "req_c1234567890", text: "nice 1", priority: "nice_to_have" },
    ];
    const questions = [
      makeQuestion("q_aaaaaaaaaaaa", "technical", "hard", ["req_a1234567890"], 25),
      makeQuestion("q_bbbbbbbbbbbb", "technical", "medium", ["req_b1234567890"], 20),
      makeQuestion("q_cccccccccccc", "behavioral", "easy", ["req_c1234567890"], 18),
      makeQuestion("q_dddddddddddd", "company", "hard", ["req_b1234567890"], 30),
    ];
    const schedule = buildSchedule({
      questions,
      flashcards: [],
      daysAvailable: 2,
      hoursPerDay: 2,
      requirements,
    });
    const firstDayQuestionIds = schedule[0].items.filter((item) => item.kind === "question").map((item) => item.ref_id);
    expect(firstDayQuestionIds).toContain("q_aaaaaaaaaaaa");
    expect(firstDayQuestionIds).toContain("q_dddddddddddd");
    expect(schedule.every((day) => day.total_minutes === day.items.reduce((sum, item) => sum + item.minutes, 0))).toBe(true);
    expect(ScheduleDaySchema.array().safeParse(schedule).success).toBe(true);
  });
});
