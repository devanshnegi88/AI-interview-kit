import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import { REQUIREMENT_CODES, validateRequirements } from "../validation/requirements";

describe("validateRequirements", () => {
  it("accepts assembled requirements", () => {
    const kit = assembleKit(passingDraft());
    expect(validateRequirements(kit.role.requirements)).toEqual([]);
  });

  it("rejects a missing must_have", () => {
    const kit = assembleKit(passingDraft());
    const onlyNice = kit.role.requirements.map((r) => ({ ...r, priority: "nice_to_have" as const }));
    const issues = validateRequirements(onlyNice);
    expect(issues.some((i) => i.code === REQUIREMENT_CODES.NO_MUST_HAVE)).toBe(true);
  });

  it("rejects a duplicate id", () => {
    const kit = assembleKit(passingDraft());
    const dup = [...kit.role.requirements, { ...kit.role.requirements[0], text: "Something else entirely" }];
    const issues = validateRequirements(dup);
    expect(issues.some((i) => i.code === REQUIREMENT_CODES.DUPLICATE_ID)).toBe(true);
  });

  it("rejects a non-req_ id", () => {
    const kit = assembleKit(passingDraft());
    const bad = [{ ...kit.role.requirements[0], id: "q_abcdefghijkl" }, ...kit.role.requirements.slice(1)];
    const issues = validateRequirements(bad);
    expect(issues.some((i) => i.code === REQUIREMENT_CODES.BAD_ID)).toBe(true);
  });
});
