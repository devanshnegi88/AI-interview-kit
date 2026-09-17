import type {
  CompanyBrief,
  Difficulty,
  KitDraft,
  KitSource,
  QuestionDraft,
  QuestionType,
  RequirementDraft,
} from "../../../shared/types";
import { minCountsByType, minFlashcards } from "../validation/coverage";
import { flashcardId, questionId, requirementId } from "../validation/ids";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const SAMPLE_SOURCE: KitSource = {
  job_description:
    "We are hiring a backend engineer to design APIs, own data stores, and raise the reliability bar. You will work on distributed systems, PostgreSQL, and TypeScript services.",
  company_url: "https://example.com",
  days_available: 5,
  hours_per_day: 2,
};

export const SAMPLE_BRIEF: CompanyBrief = {
  name: "ExampleCo",
  one_liner: "Infrastructure for online payments.",
  products: ["Payments API", "Billing"],
  culture: ["Written communication", "Ownership"],
  interview_process: ["Recruiter screen", "Technical", "System design", "Behavioral"],
  recent_news: ["Opened a new region in 2025"],
  citations: [
    {
      url: "https://example.com/about",
      title: "About ExampleCo",
      snippet: "We build payment infrastructure for platforms.",
    },
  ],
};

export const SAMPLE_REQUIREMENTS: RequirementDraft[] = [
  { text: "Design and ship production TypeScript APIs", priority: "must_have" },
  { text: "Own PostgreSQL schema and query performance", priority: "must_have" },
  { text: "Reason about distributed-system trade-offs", priority: "must_have" },
  { text: "Experience with observability (metrics, traces, logs)", priority: "nice_to_have" },
];

function reqId(index: number): string {
  const req = SAMPLE_REQUIREMENTS[index] ?? SAMPLE_REQUIREMENTS[0];
  return requirementId(req.text, req.priority);
}

function questionDraft(
  type: QuestionType,
  n: number,
  requirementIndex: number,
): QuestionDraft {
  const prompt = `${type} interview question ${n}: explain a concrete ExampleCo scenario.`;
  const difficulty = DIFFICULTIES[n % DIFFICULTIES.length];
  return {
    id: questionId(type, prompt),
    type,
    difficulty,
    prompt,
    why_asked: `Tests ${type} signal for requirement ${requirementIndex + 1}.`,
    requirement_ids: [reqId(requirementIndex)],
    tags: [type, "exampleco"],
    answer_outline: [
      "Restate the prompt and constraints.",
      "Walk through a structured answer.",
      "Call out trade-offs and a follow-up experiment.",
    ],
    follow_ups: [`What would you change if traffic 10x'd?`],
    estimated_minutes: difficulty === "hard" ? 25 : difficulty === "medium" ? 20 : 15,
  };
}

/**
 * Build a draft that satisfies coverage for the given source (day count).
 * Used by tests; not an LLM stub.
 */
export function passingDraft(overrides: Partial<KitSource> = {}): KitDraft {
  const source: KitSource = { ...SAMPLE_SOURCE, ...overrides };
  const mins = minCountsByType(source.days_available);
  const questions: QuestionDraft[] = [];

  (Object.entries(mins) as [QuestionType, number][]).forEach(([type, count], typeIndex) => {
    for (let n = 1; n <= count; n += 1) {
      questions.push(questionDraft(type, n, typeIndex % SAMPLE_REQUIREMENTS.length));
    }
  });

  const fcCount = minFlashcards(questions.length, source.days_available);
  const flashcards = questions.slice(0, fcCount).map((q, i) => {
    const front = `Flashcard ${i + 1}: ${q.tags[0]} cue`;
    const back = `Answer summary for ${q.prompt}`;
    return {
      id: flashcardId(front, back),
      front,
      back,
      tags: q.tags,
      question_ids: [q.id!],
    };
  });

  return {
    source,
    company_brief: SAMPLE_BRIEF,
    role: {
      title: "Backend Engineer",
      level: "mid",
      team: "Platform",
      requirements: SAMPLE_REQUIREMENTS.map((r) => ({
        ...r,
        id: requirementId(r.text, r.priority),
      })),
      responsibilities: [
        "Design service APIs",
        "Review production incidents",
        "Mentor teammates on data modeling",
      ],
    },
    questions,
    flashcards,
  };
}
