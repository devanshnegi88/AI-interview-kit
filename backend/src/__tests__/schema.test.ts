import { describe, expect, it } from "vitest";
import { passingDraft } from "../__fixtures__/kitDraft";
import { assembleKit } from "../validation/assemble";
import {
  FlashcardSchema,
  InterviewKitSchema,
  QuestionSchema,
  RequirementSchema,
  ScheduleDaySchema,
} from "../validation/schema";

describe("InterviewKitSchema", () => {
  it("accepts a kit produced by assembleKit", () => {
    const kit = assembleKit(passingDraft());
    const parsed = InterviewKitSchema.safeParse(kit);
    expect(parsed.success).toBe(true);
  });

  it("rejects a kit missing required collections", () => {
    const kit = assembleKit(passingDraft());
    const parsed = InterviewKitSchema.safeParse({ ...kit, questions: [] });
    expect(parsed.success).toBe(false);
  });

  it("rejects an extra field (strict objects)", () => {
    const kit = assembleKit(passingDraft());
    const parsed = InterviewKitSchema.safeParse({ ...kit, extra: true });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bad company url", () => {
    const parsed = InterviewKitSchema.safeParse({
      ...assembleKit(passingDraft()),
      source: {
        ...assembleKit(passingDraft()).source,
        company_url: "not-a-url",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("validates requirement / question / flashcard / schedule sub-schemas", () => {
    const kit = assembleKit(passingDraft());
    expect(RequirementSchema.safeParse(kit.role.requirements[0]).success).toBe(true);
    expect(QuestionSchema.safeParse(kit.questions[0]).success).toBe(true);
    expect(FlashcardSchema.safeParse(kit.flashcards[0]).success).toBe(true);
    expect(ScheduleDaySchema.safeParse(kit.schedule[0]).success).toBe(true);
    expect(RequirementSchema.safeParse({ ...kit.role.requirements[0], extra: 1 }).success).toBe(false);
  });

  it("rejects invalid difficulty and non-integer minutes", () => {
    const kit = assembleKit(passingDraft());
    expect(QuestionSchema.safeParse({ ...kit.questions[0], difficulty: "nightmare" }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...kit.questions[0], estimated_minutes: 20.2 }).success).toBe(false);
    expect(ScheduleDaySchema.safeParse({
      ...kit.schedule[0],
      items: [{ ...kit.schedule[0].items[0], minutes: 7.5 }],
    }).success).toBe(false);
  });
});
