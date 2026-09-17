import type {
  CoverageGap,
  CoverageReport,
  Flashcard,
  Question,
  QuestionType,
  Requirement,
} from "../../../shared/types";
import { QUESTION_TYPES } from "../../../shared/types";

export const COVERAGE_CODES = {
  MISSING_MUST_HAVE: "MISSING_MUST_HAVE",
  INSUFFICIENT_TYPE: "INSUFFICIENT_TYPE",
  INSUFFICIENT_FLASHCARDS: "INSUFFICIENT_FLASHCARDS",
  NO_MUST_HAVES: "NO_MUST_HAVES",
  UNLINKED_QUESTION: "UNLINKED_QUESTION",
} as const;

/**
 * Coverage algorithm (deterministic; never delegated to an LLM):
 *
 * 1. Collect all must requirement IDs (`priority === "must_have"`).
 * 2. Collect requirement IDs referenced by questions (`question.requirement_ids`).
 * 3. Calculate uncovered IDs: must IDs minus referenced IDs.
 *    Return them as `uncovered_requirement_ids` (and `must_have_missing`).
 *    `passed` cannot be true if this set is non-empty, or if the role has
 *    zero must-haves (nothing to prove).
 *    The whole function is pure: same inputs always yield the same report.
 * 4. `score` = |covered must-haves| / |must-haves|  (0 if there are none).
 * 5. Count questions by `type`. Each type must meet
 *    `minCountsByType(days_available)`.
 * 6. Flashcard count must meet `minFlashcards(questionCount, days_available)`.
 * 7. Questions with no linked flashcard are warnings; they do not fail `passed`.
 * 8. Any `kit.coverage` object supplied by a caller/model is discarded and
 *    replaced with this result.
 */

/** Step 1: collect all must requirement IDs. Sorted, unique, no LLM. */
export function isMustPriority(priority: string): boolean {
  return priority === "must_have" || priority === "must";
}

export function collectMustRequirementIds(requirements: Array<{ id: string; priority: string }>): string[] {
  return uniqueSorted(requirements.filter((r) => isMustPriority(r.priority)).map((r) => r.id));
}

/** Step 2: collect requirement IDs referenced by questions. Sorted, unique, no LLM. */
export function collectReferencedRequirementIds(
  questions: Array<{ requirement_ids: string[] }>,
  knownIds?: Set<string>,
): string[] {
  const ids = questions.flatMap((q) => q.requirement_ids);
  return uniqueSorted(knownIds ? ids.filter((id) => knownIds.has(id)) : ids);
}

/** Must-requirement coverage only (no flashcard / type quotas). Deterministic. */
export interface MustCoverageReport {
  passed: boolean;
  must_requirement_ids: string[];
  uncovered_requirement_ids: string[];
  referenced_requirement_ids: string[];
}

export function computeMustCoverage(input: {
  requirements: Array<{ id: string; priority: string }>;
  questions: Array<{ requirement_ids: string[] }>;
}): MustCoverageReport {
  const known = new Set(input.requirements.map((r) => r.id));
  const must_requirement_ids = collectMustRequirementIds(input.requirements);
  const referenced_requirement_ids = collectReferencedRequirementIds(input.questions, known);
  const uncovered_requirement_ids = calculateUncoveredIds(
    must_requirement_ids,
    referenced_requirement_ids,
  );
  return {
    passed: must_requirement_ids.length > 0 && uncovered_requirement_ids.length === 0,
    must_requirement_ids,
    uncovered_requirement_ids,
    referenced_requirement_ids,
  };
}

/**
 * Step 3: calculate uncovered IDs.
 * Uncovered = must requirement IDs that no question references.
 */
export function calculateUncoveredIds(
  mustRequirementIds: string[],
  referencedRequirementIds: string[],
): string[] {
  const referenced = new Set(referencedRequirementIds);
  return uniqueSorted(mustRequirementIds.filter((id) => !referenced.has(id)));
}

export function minCountsByType(daysAvailable: number): Record<QuestionType, number> {
  if (daysAvailable <= 2) {
    return { behavioral: 2, technical: 3, system_design: 1, company: 1, role: 1 };
  }
  if (daysAvailable <= 5) {
    return { behavioral: 4, technical: 6, system_design: 2, company: 2, role: 2 };
  }
  return { behavioral: 6, technical: 8, system_design: 3, company: 3, role: 3 };
}

export function minFlashcards(questionCount: number, daysAvailable: number): number {
  return Math.min(questionCount, Math.max(6, daysAvailable * 2));
}

function emptyCounts(): Record<QuestionType, number> {
  return { behavioral: 0, technical: 0, system_design: 0, company: 0, role: 0 };
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export function computeCoverage(input: {
  daysAvailable: number;
  requirements: Requirement[];
  questions: Question[];
  flashcards: Flashcard[];
}): CoverageReport {
  const mins = minCountsByType(input.daysAvailable);
  const minFc = minFlashcards(input.questions.length, input.daysAvailable);
  const counts = emptyCounts();
  const gaps: CoverageGap[] = [];

  // 1. Collect all must requirement IDs.
  const must_requirement_ids = collectMustRequirementIds(input.requirements);
  const mustById = new Map(
    input.requirements.filter((r) => r.priority === "must_have").map((r) => [r.id, r]),
  );

  // 2. Collect requirement IDs referenced by questions.
  const referenced_requirement_ids = collectReferencedRequirementIds(input.questions);
  const cited = new Set(referenced_requirement_ids);

  // 3. Calculate uncovered IDs (must − referenced).
  const uncovered_requirement_ids = calculateUncoveredIds(
    must_requirement_ids,
    referenced_requirement_ids,
  );
  const uncovered = new Set(uncovered_requirement_ids);

  for (const question of input.questions) {
    counts[question.type] += 1;
  }

  const covered_requirement_ids = uniqueSorted(
    input.requirements.filter((r) => cited.has(r.id)).map((r) => r.id),
  );

  const niceToHaves = input.requirements.filter((r) => r.priority === "nice_to_have");

  if (must_requirement_ids.length === 0) {
    gaps.push({
      code: COVERAGE_CODES.NO_MUST_HAVES,
      severity: "error",
      message: "Role has no must_have requirements — the kit cannot prove coverage.",
    });
  }

  const mustHaveMissing = uncovered_requirement_ids;
  const mustHaveCovered = must_requirement_ids.filter((id) => !uncovered.has(id));
  for (const id of mustHaveMissing) {
    const req = mustById.get(id);
    gaps.push({
      code: COVERAGE_CODES.MISSING_MUST_HAVE,
      severity: "error",
      message: `Must-have requirement is not covered by any question: "${req?.text ?? id}"`,
      requirement_id: id,
    });
  }

  const niceToHaveCovered = niceToHaves.filter((r) => cited.has(r.id)).map((r) => r.id);
  const score =
    must_requirement_ids.length === 0 ? 0 : mustHaveCovered.length / must_requirement_ids.length;

  for (const type of QUESTION_TYPES) {
    if (counts[type] < mins[type]) {
      gaps.push({
        code: COVERAGE_CODES.INSUFFICIENT_TYPE,
        severity: "error",
        message: `Need at least ${mins[type]} ${type} question(s), found ${counts[type]}.`,
        question_type: type,
      });
    }
  }

  if (input.flashcards.length < minFc) {
    gaps.push({
      code: COVERAGE_CODES.INSUFFICIENT_FLASHCARDS,
      severity: "error",
      message: `Need at least ${minFc} flashcard(s), found ${input.flashcards.length}.`,
    });
  }

  const linkedQuestionIds = new Set(input.flashcards.flatMap((fc) => fc.question_ids));
  const unlinked = [...input.questions]
    .filter((q) => !linkedQuestionIds.has(q.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const question of unlinked) {
    gaps.push({
      code: COVERAGE_CODES.UNLINKED_QUESTION,
      severity: "warning",
      message: `Question ${question.id} has no linked flashcard.`,
    });
  }

  const errors = gaps.filter((g) => g.severity === "error");

  return {
    passed: errors.length === 0,
    score,
    must_requirement_ids,
    referenced_requirement_ids,
    covered_requirement_ids,
    uncovered_requirement_ids,
    must_have_covered: uniqueSorted(mustHaveCovered),
    must_have_missing: uniqueSorted(mustHaveMissing),
    nice_to_have_covered: uniqueSorted(niceToHaveCovered),
    counts_by_type: counts,
    min_counts_by_type: mins,
    flashcard_count: input.flashcards.length,
    min_flashcards: minFc,
    gaps,
  };
}
