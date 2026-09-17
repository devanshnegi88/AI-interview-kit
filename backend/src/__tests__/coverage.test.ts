import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import {
  calculateUncoveredIds,
  collectMustRequirementIds,
  collectReferencedRequirementIds,
  COVERAGE_CODES,
  computeCoverage,
  minCountsByType,
} from "../validation/coverage";

describe("collectMustRequirementIds", () => {
  it("collects every must_have id and ignores nice_to_have", () => {
    const kit = assembleKit(passingDraft());
    const ids = collectMustRequirementIds(kit.role.requirements);
    const expected = kit.role.requirements
      .filter((r) => r.priority === "must_have")
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(expected);
    expect(ids.length).toBeGreaterThan(0);
    for (const req of kit.role.requirements.filter((r) => r.priority === "nice_to_have")) {
      expect(ids).not.toContain(req.id);
    }
  });

  it("returns [] when there are no must_haves", () => {
    const kit = assembleKit(passingDraft());
    const onlyNice = kit.role.requirements.map((r) => ({ ...r, priority: "nice_to_have" as const }));
    expect(collectMustRequirementIds(onlyNice)).toEqual([]);
  });
});

describe("collectReferencedRequirementIds", () => {
  it("collects every requirement id cited by questions, unique and sorted", () => {
    const kit = assembleKit(passingDraft());
    const ids = collectReferencedRequirementIds(kit.questions);
    const expected = [...new Set(kit.questions.flatMap((q) => q.requirement_ids))].sort();
    expect(ids).toEqual(expected);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("returns [] when no question cites a requirement", () => {
    const kit = assembleKit(passingDraft());
    const none = kit.questions.map((q) => ({ ...q, requirement_ids: [] }));
    expect(collectReferencedRequirementIds(none)).toEqual([]);
  });
});

describe("calculateUncoveredIds", () => {
  it("is must IDs minus referenced IDs", () => {
    expect(calculateUncoveredIds(["a", "b", "c"], ["b", "c", "d"])).toEqual(["a"]);
  });

  it("returns [] when every must ID is referenced", () => {
    expect(calculateUncoveredIds(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("returns all must IDs when nothing is referenced", () => {
    expect(calculateUncoveredIds(["b", "a"], [])).toEqual(["a", "b"]);
  });
});

describe("computeCoverage", () => {
  it("passes a complete assembled kit", () => {
    const kit = assembleKit(passingDraft({ days_available: 5 }));
    expect(kit.coverage.passed).toBe(true);
    expect(kit.coverage.score).toBe(1);
    expect(kit.coverage.must_requirement_ids).toEqual(
      collectMustRequirementIds(kit.role.requirements),
    );
    expect(kit.coverage.referenced_requirement_ids).toEqual(
      collectReferencedRequirementIds(kit.questions),
    );
    expect(kit.coverage.uncovered_requirement_ids).toEqual(
      calculateUncoveredIds(kit.coverage.must_requirement_ids, kit.coverage.referenced_requirement_ids),
    );
    expect(kit.coverage.must_have_missing).toEqual([]);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
  });

  it("fails when a must-have requirement has no questions", () => {
    const kit = assembleKit(passingDraft());
    const orphanId = kit.role.requirements.find((r) => r.priority === "must_have")!.id;
    const questions = kit.questions.map((q) => ({
      ...q,
      requirement_ids: q.requirement_ids.filter((id) => id !== orphanId).concat(
        q.requirement_ids.includes(orphanId)
          ? [kit.role.requirements.find((r) => r.id !== orphanId)!.id]
          : [],
      ),
    }));
    const report = computeCoverage({
      daysAvailable: kit.source.days_available,
      requirements: kit.role.requirements,
      questions,
      flashcards: kit.flashcards,
    });
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(1);
    expect(report.must_have_missing).toContain(orphanId);
    expect(report.uncovered_requirement_ids).toContain(orphanId);
    expect(report.gaps.some((g) => g.code === COVERAGE_CODES.MISSING_MUST_HAVE)).toBe(true);
  });

  it("fails when a question type is under the minimum", () => {
    const kit = assembleKit(passingDraft({ days_available: 5 }));
    const questions = kit.questions.filter((q) => q.type !== "behavioral");
    const report = computeCoverage({
      daysAvailable: 5,
      requirements: kit.role.requirements,
      questions,
      flashcards: kit.flashcards,
    });
    expect(report.passed).toBe(false);
    expect(report.gaps.some((g) => g.code === COVERAGE_CODES.INSUFFICIENT_TYPE && g.question_type === "behavioral")).toBe(
      true,
    );
  });

  it("scales minima with days available", () => {
    expect(minCountsByType(1).technical).toBeLessThan(minCountsByType(10).technical);
  });

  it("does not trust a stored passed:true", () => {
    const kit = assembleKit(passingDraft());
    kit.coverage.passed = true;
    kit.questions = kit.questions.filter((q) => q.type !== "company");
    const report = computeCoverage({
      daysAvailable: kit.source.days_available,
      requirements: kit.role.requirements,
      questions: kit.questions,
      flashcards: kit.flashcards,
    });
    expect(report.passed).toBe(false);
  });
});
