import type { Flashcard, InterviewKit, KitDraft, Question, Requirement } from "../../../shared/types";
import { buildSchedule } from "../scheduling/schedule";
import { computeCoverage } from "./coverage";
import { validateFlashcards } from "./flashcards";
import { ensureId, validateStableIds } from "./ids";
import { collectIntegrityIssues } from "./integrity";
import type { KitValidationIssue } from "./issues";
import { validateQuestions } from "./questions";
import { validateRequirements } from "./requirements";
import { InterviewKitSchema } from "./schema";
import { validateSchedule } from "./scheduleCheck";

export type { KitValidationIssue } from "./issues";

export interface KitValidationResult {
  success: boolean;
  kit?: InterviewKit;
  issues: KitValidationIssue[];
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function assignRequirements(draft: KitDraft): { requirements: Requirement[]; reqMap: Map<string, string> } {
  const reqMap = new Map<string, string>();
  const assigned = draft.role.requirements.map((req) => {
    const id = ensureId("req", req.id, req.text, req.priority);
    if (req.id) reqMap.set(req.id, id);
    reqMap.set(id, id);
    return {
      id,
      text: req.text.trim(),
      priority: req.priority,
    };
  });
  return { requirements: byId(assigned), reqMap };
}

function assignQuestions(
  draft: KitDraft,
  requirements: Requirement[],
  reqMap: Map<string, string>,
): { questions: Question[]; questionMap: Map<string, string> } {
  const reqIds = new Set(requirements.map((r) => r.id));
  const fallbackReq = requirements[0]?.id;
  const questionMap = new Map<string, string>();

  const assigned = draft.questions.map((q) => {
    const id = ensureId("q", q.id, q.type, q.prompt);
    if (q.id) questionMap.set(q.id, id);
    questionMap.set(id, id);
    const requirement_ids = q.requirement_ids
      .map((rid) => reqMap.get(rid) ?? rid)
      .filter((rid) => reqIds.has(rid));
    if (requirement_ids.length === 0 && fallbackReq) {
      requirement_ids.push(fallbackReq);
    }
    return {
      id,
      type: q.type,
      difficulty: q.difficulty,
      prompt: q.prompt.trim(),
      why_asked: q.why_asked.trim(),
      requirement_ids,
      tags: q.tags.map((t) => t.trim()).filter(Boolean),
      answer_outline: q.answer_outline.map((s) => s.trim()).filter(Boolean),
      follow_ups: q.follow_ups.map((s) => s.trim()).filter(Boolean),
      estimated_minutes: q.estimated_minutes,
    };
  });

  return { questions: byId(assigned), questionMap };
}

function assignFlashcards(
  draft: KitDraft,
  questions: Question[],
  questionMap: Map<string, string>,
): Flashcard[] {
  const questionIds = new Set(questions.map((q) => q.id));
  const fallbackQ = questions[0]?.id;

  return byId(
    draft.flashcards.map((fc) => {
      const id = ensureId("fc", fc.id, fc.front, fc.back);
      const linked = fc.question_ids
        .map((qid) => questionMap.get(qid) ?? qid)
        .filter((qid) => questionIds.has(qid));
      if (linked.length === 0 && fallbackQ) linked.push(fallbackQ);
      return {
        id,
        front: fc.front.trim(),
        back: fc.back.trim(),
        tags: fc.tags.map((t) => t.trim()).filter(Boolean),
        question_ids: linked,
      };
    }),
  );
}

/**
 * Turn a draft (no schedule, no coverage, ids optional) into a complete
 * Appendix A kit. Schedule and coverage are always derived here — never
 * taken from the caller — so generation cannot invent them.
 */
export function assembleKit(draft: KitDraft): InterviewKit {
  const { requirements, reqMap } = assignRequirements(draft);
  const { questions, questionMap } = assignQuestions(draft, requirements, reqMap);
  const flashcards = assignFlashcards(draft, questions, questionMap);

  const schedule = buildSchedule({
    questions,
    flashcards,
    daysAvailable: draft.source.days_available,
    hoursPerDay: draft.source.hours_per_day,
    requirements,
  });

  const coverage = computeCoverage({
    daysAvailable: draft.source.days_available,
    requirements,
    questions,
    flashcards,
  });

  const kit: InterviewKit = {
    version: "1.0",
    source: draft.source,
    company_brief: draft.company_brief,
    role: {
      title: draft.role.title,
      level: draft.role.level,
      ...(draft.role.team ? { team: draft.role.team } : {}),
      requirements,
      responsibilities: draft.role.responsibilities,
    },
    questions,
    flashcards,
    schedule,
    coverage,
  };

  return InterviewKitSchema.parse(kit) as InterviewKit;
}

/**
 * Validate an unknown payload as an Appendix A kit.
 *
 * Pipeline (all deterministic; none of this is an LLM job):
 *   1. Zod schema (structural)
 *   2. Requirement / question / flashcard / schedule validators
 *   3. Stable ID validation
 *   4. Referential integrity
 *   5. Coverage recomputed and written back — a stored `passed: true` is ignored
 */
export function validateKit(input: unknown): KitValidationResult {
  const parsed = InterviewKitSchema.safeParse(input);
  if (!parsed.success) {
    const issues: KitValidationIssue[] = parsed.error.issues.map((item) => ({
      code: "SCHEMA",
      message: item.message,
      path: item.path.join("."),
      severity: "error" as const,
    }));
    return { success: false, issues };
  }

  const kit = parsed.data as InterviewKit;
  const recomputed = computeCoverage({
    daysAvailable: kit.source.days_available,
    requirements: kit.role.requirements,
    questions: kit.questions,
    flashcards: kit.flashcards,
  });
  kit.coverage = recomputed;

  const issues: KitValidationIssue[] = [
    ...validateRequirements(kit.role.requirements),
    ...validateQuestions(kit.questions),
    ...validateFlashcards(kit.flashcards),
    ...validateSchedule({
      daysAvailable: kit.source.days_available,
      questions: kit.questions,
      flashcards: kit.flashcards,
      schedule: kit.schedule,
    }),
    ...validateStableIds(kit),
    ...collectIntegrityIssues(kit),
    ...recomputed.gaps.map((g) => ({
      code: g.code,
      message: g.message,
      severity: g.severity,
    })),
  ];
  const success = issues.every((i) => i.severity !== "error");

  return { success, kit, issues };
}
