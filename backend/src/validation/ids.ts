import { createHash } from "node:crypto";
import { issue, type KitValidationIssue } from "./issues";

export const ID_KINDS = ["req", "q", "fc"] as const;
export type IdKind = (typeof ID_KINDS)[number];

/** `req_`, `q_`, or `fc_` followed by 8–64 lowercase alphanumeric chars. */
export const STABLE_ID_PATTERN = /^(req|q|fc)_[a-z0-9]{8,64}$/;

export const ID_CODES = {
  BAD_ID: "ID_BAD",
  WRONG_KIND: "ID_WRONG_KIND",
} as const;

export function isStableId(value: string): boolean {
  return STABLE_ID_PATTERN.test(value);
}

export function isRequirementId(value: string): boolean {
  return isStableId(value) && value.startsWith("req_");
}

export function isQuestionId(value: string): boolean {
  return isStableId(value) && value.startsWith("q_");
}

export function isFlashcardId(value: string): boolean {
  return isStableId(value) && value.startsWith("fc_");
}

export function kindOfId(value: string): IdKind | undefined {
  if (isRequirementId(value)) return "req";
  if (isQuestionId(value)) return "q";
  if (isFlashcardId(value)) return "fc";
  return undefined;
}

function normalizePart(part: string): string {
  return part.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Content-addressed id. Same kind + parts always yield the same id;
 * no clock, no random, no insertion order.
 */
export function stableId(kind: IdKind, ...parts: string[]): string {
  const canonical = [kind, ...parts.map(normalizePart)].join("|");
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
  return `${kind}_${digest}`;
}

export function requirementId(text: string, priority: string): string {
  return stableId("req", text, priority);
}

export function questionId(type: string, prompt: string): string {
  return stableId("q", type, prompt);
}

export function flashcardId(front: string, back: string): string {
  return stableId("fc", front, back);
}

/**
 * Keep a caller-supplied id when it is well-formed; otherwise derive one.
 * Used so fixtures and later LLM output can pin ids without breaking the
 * hash scheme for everything else.
 */
export function ensureId(kind: IdKind, given: string | undefined, ...parts: string[]): string {
  if (given && isStableId(given) && given.startsWith(`${kind}_`)) {
    return given;
  }
  return stableId(kind, ...parts);
}

function check(id: string, expected: IdKind, path: string, issues: KitValidationIssue[]): void {
  if (!isStableId(id)) {
    issues.push(issue(ID_CODES.BAD_ID, `Not a stable id: "${id}".`, { path }));
    return;
  }
  if (!id.startsWith(`${expected}_`)) {
    issues.push(issue(ID_CODES.WRONG_KIND, `Expected ${expected}_ id at ${path}, got "${id}".`, { path }));
  }
}

/**
 * Stable ID validation for a whole kit. Format and kind prefix only.
 * Does not call an LLM.
 */
export function validateStableIds(kit: {
  role: { requirements: Array<{ id: string }> };
  questions: Array<{ id: string }>;
  flashcards: Array<{ id: string }>;
}): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  kit.role.requirements.forEach((r, i) => check(r.id, "req", `role.requirements[${i}].id`, issues));
  kit.questions.forEach((q, i) => check(q.id, "q", `questions[${i}].id`, issues));
  kit.flashcards.forEach((f, i) => check(f.id, "fc", `flashcards[${i}].id`, issues));
  return issues;
}
