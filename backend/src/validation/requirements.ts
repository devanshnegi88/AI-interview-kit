import type { Requirement } from "../../../shared/types";
import { isRequirementId } from "./ids";
import { issue, type KitValidationIssue } from "./issues";

export const REQUIREMENT_CODES = {
  BAD_ID: "REQ_BAD_ID",
  EMPTY_TEXT: "REQ_EMPTY_TEXT",
  DUPLICATE_ID: "REQ_DUPLICATE_ID",
  DUPLICATE_TEXT: "REQ_DUPLICATE_TEXT",
  NO_MUST_HAVE: "REQ_NO_MUST_HAVE",
  EMPTY_SET: "REQ_EMPTY_SET",
} as const;

/**
 * Requirement validation. Structural + uniqueness. Does not call an LLM.
 */
export function validateRequirements(requirements: Requirement[]): KitValidationIssue[] {
  const issues: KitValidationIssue[] = [];
  if (requirements.length === 0) {
    issues.push(issue(REQUIREMENT_CODES.EMPTY_SET, "Role must list at least one requirement.", { path: "role.requirements" }));
    return issues;
  }

  const seenIds = new Set<string>();
  const seenText = new Set<string>();

  requirements.forEach((req, index) => {
    const path = `role.requirements[${index}]`;
    if (!isRequirementId(req.id)) {
      issues.push(issue(REQUIREMENT_CODES.BAD_ID, `Requirement id must be req_ + 8–64 [a-z0-9], got "${req.id}".`, { path: `${path}.id` }));
    }
    if (seenIds.has(req.id)) {
      issues.push(issue(REQUIREMENT_CODES.DUPLICATE_ID, `Duplicate requirement id ${req.id}.`, { path: `${path}.id` }));
    }
    seenIds.add(req.id);

    const text = req.text.trim();
    if (text.length < 3) {
      issues.push(issue(REQUIREMENT_CODES.EMPTY_TEXT, "Requirement text must be at least 3 characters.", { path: `${path}.text` }));
    }
    const key = text.toLowerCase();
    if (seenText.has(key)) {
      issues.push(issue(REQUIREMENT_CODES.DUPLICATE_TEXT, `Duplicate requirement text: "${text}".`, { path: `${path}.text` }));
    }
    seenText.add(key);
  });

  if (!requirements.some((r) => r.priority === "must_have")) {
    issues.push(
      issue(REQUIREMENT_CODES.NO_MUST_HAVE, "At least one requirement must have priority must_have.", {
        path: "role.requirements",
      }),
    );
  }

  return issues;
}
