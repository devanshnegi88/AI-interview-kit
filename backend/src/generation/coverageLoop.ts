import type { GeneratedQuestion } from "../../../shared/types";
import type { LlmRuntime } from "../llm";
import { computeMustCoverage, type MustCoverageReport } from "../validation/coverage";
import { generateAllQuestions, type QuestionGenerationBundle } from "./questions";
import { generateMissingQuestions } from "./questions/missing";
import { normalizeReqs, type QuestionGenContext, type QuestionSourceReq } from "./questions/common";

export const MAX_COVERAGE_PASSES = 2;

export interface CoveragePassRecord {
  pass: number;
  uncovered_requirement_ids: string[];
  passed: boolean;
}

export interface CoverageLoopResult {
  questions: GeneratedQuestion[];
  uncovered_requirement_ids: string[];
  passes: number;
  passed: boolean;
  reports: CoveragePassRecord[];
  failedStages: QuestionGenerationBundle["failedStages"];
}

export interface CoverageLoopOptions {
  maxPasses?: number;
  runtime?: LlmRuntime;
  generateInitial?: (
    ctx: QuestionGenContext,
    runtime?: LlmRuntime,
  ) => Promise<QuestionGenerationBundle>;
  generateMissing?: (
    ctx: QuestionGenContext,
    uncovered: QuestionSourceReq[],
    runtime?: LlmRuntime,
  ) => Promise<{ ok: true; data: GeneratedQuestion[] } | { ok: false }>;
}

function sanitize(questions: GeneratedQuestion[], knownIds: Set<string>): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    const requirement_ids = q.requirement_ids.filter((id) => knownIds.has(id));
    if (requirement_ids.length === 0) continue;
    seen.add(q.id);
    out.push({ ...q, requirement_ids });
  }
  return out;
}

function mergeQuestions(base: GeneratedQuestion[], extra: GeneratedQuestion[], knownIds: Set<string>): GeneratedQuestion[] {
  return sanitize([...base, ...extra], knownIds);
}

/**
 * Generate questions, then fill uncovered must-haves up to MAX_COVERAGE_PASSES.
 * Coverage success is decided only by computeMustCoverage (deterministic).
 */
export async function runCoverageLoop(
  ctx: QuestionGenContext,
  options: CoverageLoopOptions = {},
): Promise<CoverageLoopResult> {
  const maxPasses = options.maxPasses ?? MAX_COVERAGE_PASSES;
  const runtime = options.runtime;
  const reqs = normalizeReqs(ctx.requirements);
  const coverageReqs = reqs.map((r) => ({ id: r.id, priority: r.priority ?? "" }));
  const knownIds = new Set(reqs.map((r) => r.id));

  const initial = await (options.generateInitial ?? generateAllQuestions)(ctx, runtime);
  let questions = sanitize(initial.questions, knownIds);

  const reports: CoveragePassRecord[] = [];
  let coverage: MustCoverageReport = computeMustCoverage({ requirements: coverageReqs, questions });
  let passes = 0;

  while (passes < maxPasses) {
    coverage = computeMustCoverage({ requirements: coverageReqs, questions });
    passes += 1;
    reports.push({
      pass: passes,
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      passed: coverage.passed,
    });
    if (coverage.uncovered_requirement_ids.length === 0 || passes >= maxPasses) break;

    const uncovered = reqs.filter((r) => coverage.uncovered_requirement_ids.includes(r.id));
    const fill = await (options.generateMissing ?? generateMissingQuestions)(ctx, uncovered, runtime);
    const added = fill.ok ? fill.data : [];
    questions = mergeQuestions(questions, added, knownIds);
  }

  coverage = computeMustCoverage({ requirements: coverageReqs, questions });
  return {
    questions,
    uncovered_requirement_ids: coverage.uncovered_requirement_ids,
    passes,
    passed: coverage.passed,
    reports,
    failedStages: initial.failedStages,
  };
}
