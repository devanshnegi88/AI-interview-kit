import type {
  Flashcard,
  Question,
  QuestionType,
  Requirement,
  ScheduleDay,
  ScheduleItem,
} from "../../../shared/types";

const TYPE_ROTATION: readonly QuestionType[] = [
  "company",
  "role",
  "technical",
  "system_design",
  "behavioral",
];

/** Lower = earlier. Harder material is scheduled first. */
const DIFFICULTY_EARLIER: Record<Question["difficulty"], number> = {
  hard: 0,
  medium: 1,
  easy: 2,
};

const THEME_LABEL: Record<QuestionType, string> = {
  company: "Company & culture",
  role: "Role fit",
  technical: "Technical depth",
  system_design: "System design",
  behavioral: "Behavioral stories",
};

function intMinutes(n: number): number {
  return Math.max(1, Math.round(n));
}

function mustIdsFrom(requirements: Requirement[] | undefined): Set<string> {
  return new Set((requirements ?? []).filter((r) => r.priority === "must_have").map((r) => r.id));
}

/** 0 = must-have linked (higher priority, earlier); 1 = otherwise. */
function priorityRank(question: Question, mustIds: Set<string>): number {
  if (mustIds.size === 0) return 0;
  return question.requirement_ids.some((id) => mustIds.has(id)) ? 0 : 1;
}

function compareQuestions(a: Question, b: Question, mustIds: Set<string>): number {
  const priority = priorityRank(a, mustIds) - priorityRank(b, mustIds);
  if (priority !== 0) return priority;
  const difficulty = DIFFICULTY_EARLIER[a.difficulty] - DIFFICULTY_EARLIER[b.difficulty];
  if (difficulty !== 0) return difficulty;
  return a.id.localeCompare(b.id);
}

function compareFlashcards(a: Flashcard, b: Flashcard): number {
  return a.id.localeCompare(b.id);
}

function minutesPerDayFromHours(hoursPerDay: number): number {
  return Math.max(30, intMinutes(hoursPerDay * 60));
}

function themeFor(items: ScheduleItem[], questionsById: Map<string, Question>): string {
  const counts = new Map<QuestionType, number>();
  for (const item of items) {
    if (item.kind !== "question") continue;
    const q = questionsById.get(item.ref_id);
    if (!q) continue;
    counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
  }
  let best: QuestionType | undefined;
  let bestCount = -1;
  for (const type of TYPE_ROTATION) {
    const n = counts.get(type) ?? 0;
    if (n > bestCount) {
      best = type;
      bestCount = n;
    }
  }
  if (!best || bestCount <= 0) return "Mixed review";
  return THEME_LABEL[best];
}

function sumMinutes(items: ScheduleItem[]): number {
  return items.reduce((sum, item) => sum + item.minutes, 0);
}

function orderDayItems(
  items: ScheduleItem[],
  questionsById: Map<string, Question>,
  mustIds: Set<string>,
): ScheduleItem[] {
  const kindOrder = { question: 0, flashcard: 1, review: 2 };
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    if (a.kind === "question") {
      const qa = questionsById.get(a.ref_id);
      const qb = questionsById.get(b.ref_id);
      if (qa && qb) return compareQuestions(qa, qb, mustIds);
    }
    return a.ref_id.localeCompare(b.ref_id);
  });
}

export interface ScheduleInput {
  questions: Question[];
  flashcards: Flashcard[];
  daysAvailable: number;
  hoursPerDay: number;
  requirements?: Requirement[];
}

/**
 * Allocate every question and flashcard across exactly `daysAvailable` days.
 *
 * Deterministic. No Date, no Math.random, input order does not matter.
 *
 * - Exactly `daysAvailable` days (minimum 1).
 * - All minutes are integers.
 * - Higher-priority (must-have) questions earlier.
 * - Harder questions earlier within the same priority.
 * - Every question scheduled exactly once as kind=question (must-haves
 *   that have questions are therefore represented).
 * - Every flashcard at least once, on the earliest day of a linked question.
 * - Empty later days get reviews; primary question placements are never
 *   moved later (that would invert priority/difficulty order).
 */
export function buildSchedule(input: ScheduleInput): ScheduleDay[] {
  const daysAvailable = Math.max(1, Math.floor(input.daysAvailable));
  const budget = minutesPerDayFromHours(input.hoursPerDay);
  const mustIds = mustIdsFrom(input.requirements);
  const questions = [...input.questions].sort((a, b) => compareQuestions(a, b, mustIds));
  const flashcards = [...input.flashcards].sort(compareFlashcards);
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  const dayItems: ScheduleItem[][] = Array.from({ length: daysAvailable }, () => []);

  for (const question of questions) {
    const minutes = intMinutes(question.estimated_minutes);
    let placed = false;
    for (let d = 0; d < daysAvailable; d += 1) {
      const used = sumMinutes(dayItems[d]);
      if (used === 0 || used + minutes <= budget) {
        dayItems[d].push({ kind: "question", ref_id: question.id, minutes });
        placed = true;
        break;
      }
    }
    if (!placed) {
      let best = 0;
      let bestUsed = sumMinutes(dayItems[0]);
      for (let d = 1; d < daysAvailable; d += 1) {
        const used = sumMinutes(dayItems[d]);
        if (used < bestUsed) {
          best = d;
          bestUsed = used;
        }
      }
      dayItems[best].push({ kind: "question", ref_id: question.id, minutes });
    }
  }

  const questionDay = new Map<string, number>();
  dayItems.forEach((items, dayIndex) => {
    for (const item of items) {
      if (item.kind === "question") questionDay.set(item.ref_id, dayIndex);
    }
  });

  for (const card of flashcards) {
    const linkedDays = card.question_ids
      .map((id) => questionDay.get(id))
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);
    const dayIndex = linkedDays[0] ?? 0;
    const minutes = 5;
    dayItems[dayIndex].push({ kind: "flashcard", ref_id: card.id, minutes });
  }

  const reviewSeed = questions[0];
  for (let i = 0; i < dayItems.length; i += 1) {
    if (dayItems[i].length > 0) continue;
    if (reviewSeed) {
      dayItems[i].push({ kind: "review", ref_id: reviewSeed.id, minutes: 10 });
    }
  }

  return dayItems.map((items, index) => {
    const ordered = orderDayItems(items, questionsById, mustIds);
    const total_minutes = intMinutes(sumMinutes(ordered));
    return {
      day: index + 1,
      theme: themeFor(ordered, questionsById),
      items: ordered,
      total_minutes,
    };
  });
}

export function minutesPerDay(hoursPerDay: number): number {
  return minutesPerDayFromHours(hoursPerDay);
}
