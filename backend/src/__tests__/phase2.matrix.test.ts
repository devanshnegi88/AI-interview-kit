import { describe, expect, it } from "vitest";
import type { Difficulty, Flashcard, Question, QuestionType, Requirement } from "../../../shared/types";
import { passingDraft } from "../__fixtures__/kitDraft";
import { buildSchedule } from "../scheduling/schedule";
import { assembleKit, validateKit } from "../validation/assemble";
import {
  calculateUncoveredIds,
  collectMustRequirementIds,
  collectReferencedRequirementIds,
  computeCoverage,
} from "../validation/coverage";
import { flashcardId, questionId, requirementId } from "../validation/ids";
import { INTEGRITY_CODES } from "../validation/integrity";
import { QuestionSchema } from "../validation/schema";

function req(text: string, priority: Requirement["priority"]): Requirement {
  return { id: requirementId(text, priority), text, priority };
}

function question(opts: {
  type?: QuestionType;
  difficulty: Difficulty;
  n: number;
  requirement: Requirement;
  minutes?: number;
}): Question {
  const type = opts.type ?? "technical";
  const prompt = `${type} ${opts.difficulty} item ${opts.n} for ${opts.requirement.id}`;
  return {
    id: questionId(type, prompt),
    type,
    difficulty: opts.difficulty,
    prompt,
    why_asked: "fixture",
    requirement_ids: [opts.requirement.id],
    tags: [type],
    answer_outline: ["point one"],
    follow_ups: [],
    estimated_minutes: opts.minutes ?? 25,
  };
}

function cardFor(q: Question): Flashcard {
  const front = `cue ${q.id}`;
  const back = `ans ${q.id}`;
  return {
    id: flashcardId(front, back),
    front,
    back,
    tags: q.tags,
    question_ids: [q.id],
  };
}

function questionDays(schedule: ReturnType<typeof buildSchedule>, questions: Question[]): Map<string, number> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const days = new Map<string, number>();
  for (const day of schedule) {
    for (const item of day.items) {
      if (item.kind === "question" && byId.has(item.ref_id)) {
        days.set(item.ref_id, day.day);
      }
    }
  }
  return days;
}

describe("coverage returns uncovered_requirement_ids (deterministic)", () => {
  it("returns must − referenced as uncovered_requirement_ids", () => {
    const kit = assembleKit(passingDraft());
    const must = collectMustRequirementIds(kit.role.requirements);
    const referenced = collectReferencedRequirementIds(kit.questions);
    const uncovered = calculateUncoveredIds(must, referenced);
    expect(kit.coverage.uncovered_requirement_ids).toEqual(uncovered);
  });

  it("is deterministic and order-independent", () => {
    const kit = assembleKit(passingDraft());
    const input = {
      daysAvailable: kit.source.days_available,
      requirements: kit.role.requirements,
      questions: kit.questions,
      flashcards: kit.flashcards,
    };
    const a = computeCoverage(input);
    const b = computeCoverage({ ...input, questions: [...kit.questions].reverse() });
    expect(a).toEqual(b);
    expect(a.uncovered_requirement_ids).toEqual(b.uncovered_requirement_ids);
  });
});

describe("scheduler day counts", () => {
  it.each([1, 2, 5, 60])("emits exactly %i days", (days) => {
    const kit = assembleKit(passingDraft({ days_available: days }));
    expect(kit.schedule).toHaveLength(days);
    expect(kit.schedule.map((d) => d.day)).toEqual(Array.from({ length: days }, (_, i) => i + 1));
    for (const day of kit.schedule) {
      expect(day.items.length).toBeGreaterThan(0);
      expect(Number.isInteger(day.total_minutes)).toBe(true);
      for (const item of day.items) {
        expect(Number.isInteger(item.minutes)).toBe(true);
      }
    }
  });
});

describe("scheduler few / many questions", () => {
  const must = req("Must know TypeScript", "must_have");
  const nice = req("Nice to know tracing", "nice_to_have");

  it("few questions across 5 days still emits 5 days and keeps both questions", () => {
    const questions = [
      question({ difficulty: "hard", n: 1, requirement: must }),
      question({ difficulty: "easy", n: 2, requirement: nice }),
    ];
    const schedule = buildSchedule({
      questions,
      flashcards: questions.map(cardFor),
      daysAvailable: 5,
      hoursPerDay: 2,
      requirements: [must, nice],
    });
    expect(schedule).toHaveLength(5);
    const ids = schedule.flatMap((d) => d.items.filter((i) => i.kind === "question").map((i) => i.ref_id)).sort();
    expect(ids).toEqual([questions[0].id, questions[1].id].sort());
  });

  it("many questions on 2 days still schedules every question", () => {
    const questions = Array.from({ length: 40 }, (_, i) =>
      question({
        difficulty: i % 2 === 0 ? "hard" : "easy",
        n: i + 1,
        requirement: i % 3 === 0 ? nice : must,
        minutes: 20,
      }),
    );
    const schedule = buildSchedule({
      questions,
      flashcards: questions.slice(0, 10).map(cardFor),
      daysAvailable: 2,
      hoursPerDay: 2,
      requirements: [must, nice],
    });
    expect(schedule).toHaveLength(2);
    const ids = schedule.flatMap((d) => d.items.filter((i) => i.kind === "question").map((i) => i.ref_id)).sort();
    expect(ids).toEqual(questions.map((q) => q.id).sort());
  });
});

describe("scheduler mixed difficulty and must/nice priority", () => {
  it("places must-have before nice-to-have, and hard before easy", () => {
    const must = req("Ship APIs", "must_have");
    const nice = req("Write RFCs", "nice_to_have");
    const hardMust = question({ difficulty: "hard", n: 1, requirement: must, minutes: 25 });
    const easyMust = question({ difficulty: "easy", n: 2, requirement: must, minutes: 25 });
    const hardNice = question({ difficulty: "hard", n: 3, requirement: nice, minutes: 25 });
    const questions = [easyMust, hardNice, hardMust];
    const schedule = buildSchedule({
      questions,
      flashcards: questions.map(cardFor),
      daysAvailable: 3,
      hoursPerDay: 0.5,
      requirements: [must, nice],
    });
    const days = questionDays(schedule, questions);
    expect(days.get(hardMust.id)).toBe(1);
    expect(days.get(easyMust.id)).toBe(2);
    expect(days.get(hardNice.id)).toBe(3);
  });

  it("represents every must-have that has a question", () => {
    const kit = assembleKit(passingDraft({ days_available: 5 }));
    const scheduledQuestions = new Set(
      kit.schedule.flatMap((d) => d.items.filter((i) => i.kind === "question").map((i) => i.ref_id)),
    );
    const represented = new Set(
      kit.questions.filter((q) => scheduledQuestions.has(q.id)).flatMap((q) => q.requirement_ids),
    );
    for (const id of collectMustRequirementIds(kit.role.requirements)) {
      expect(represented.has(id)).toBe(true);
    }
  });
});

describe("invalid inputs (schema / integrity)", () => {
  it("rejects an invalid difficulty", () => {
    const kit = assembleKit(passingDraft());
    const parsed = QuestionSchema.safeParse({ ...kit.questions[0], difficulty: "impossible" });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer estimated_minutes", () => {
    const kit = assembleKit(passingDraft());
    const parsed = QuestionSchema.safeParse({ ...kit.questions[0], estimated_minutes: 12.5 });
    expect(parsed.success).toBe(false);
  });

  it("flags missing / unknown requirement IDs on a question", () => {
    const kit = assembleKit(passingDraft());
    kit.questions[0].requirement_ids = ["req_missingid1"];
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === INTEGRITY_CODES.UNKNOWN_REQUIREMENT_ID)).toBe(true);
  });

  it("flags invalid schedule references", () => {
    const kit = assembleKit(passingDraft());
    kit.schedule[0].items.push({ kind: "question", ref_id: "q_notrealid1234", minutes: 10 });
    kit.schedule[0].total_minutes += 10;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === INTEGRITY_CODES.UNKNOWN_SCHEDULE_REF)).toBe(true);
  });
});
