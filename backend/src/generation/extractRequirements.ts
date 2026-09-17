import type { ExtractedRequirement, Requirement } from "../../../shared/types";
import { generateWithLLM, type LlmResult, type LlmRuntime } from "../llm";
import { requirementId } from "../validation/ids";
import {
  ExtractedRequirementSchema,
  ExtractedRequirementsSchema,
  RequirementExtractionSchema,
} from "../validation/schema";

export const REQUIREMENT_EXTRACTION_PROMPT = `You extract job requirements from a job description.

Rules:
- Include only requirements that are explicitly present or clearly evidenced in the JD text.
- Do not invent skills, tools, years of experience, degrees, or qualifications that are not in the JD.
- If the JD is very short, return a thin list. An empty list is allowed when there is nothing to extract. Do not pad.
- kind:
  - technical: languages, frameworks, tools, systems, engineering practices
  - behavioural: collaboration, communication, ownership, leadership, ways of working
  - domain: industry, product, customers, business context
- priority:
  - must: required, must, need, mandatory, minimum, or a core listed qualification/responsibility with no optional language
  - nice: preferred, plus, bonus, nice-to-have, a plus, or similar optional wording
- Use British spelling for kind: behavioural (not behavioral).
- Do not emit ids. The caller assigns stable ids.

Return JSON: { "requirements": [ { "text": string, "kind": "technical"|"behavioural"|"domain", "priority": "must"|"nice" } ] }`;

export function toKitRequirement(req: ExtractedRequirement): Requirement {
  return {
    id: req.id,
    text: req.text,
    kind: req.kind,
    priority: req.priority === "must" ? "must_have" : "nice_to_have",
  };
}

function stampIds(
  drafts: Array<{ text: string; kind: ExtractedRequirement["kind"]; priority: ExtractedRequirement["priority"] }>,
): ExtractedRequirement[] {
  const seen = new Set<string>();
  const out: ExtractedRequirement[] = [];
  for (const draft of drafts) {
    const id = requirementId(draft.text, draft.priority, draft.kind);
    if (seen.has(id)) continue;
    seen.add(id);
    const parsed = ExtractedRequirementSchema.safeParse({ id, ...draft });
    if (!parsed.success) continue;
    out.push(parsed.data);
  }
  return out;
}

/**
 * Independent JD → requirements[] stage.
 * Uses generateWithLLM; output is Zod-validated. Stable ids are assigned here.
 */
export async function extractRequirements(
  jobDescription: string,
  runtime?: LlmRuntime,
): Promise<LlmResult<ExtractedRequirement[]>> {
  const generated = await generateWithLLM(
    {
      stage: "requirements",
      systemPrompt: REQUIREMENT_EXTRACTION_PROMPT,
      input: { job_description: jobDescription },
      schema: RequirementExtractionSchema,
    },
    runtime,
  );
  if (!generated.ok) return generated;

  const stamped = stampIds(generated.data.requirements);
  const checked = ExtractedRequirementsSchema.safeParse({ requirements: stamped });
  if (!checked.success) {
    return {
      ok: false,
      error: {
        code: "SCHEMA",
        message: "Extracted requirements failed Phase 2 Zod validation",
        retryable: false,
        stage: "requirements",
        issues: checked.error.issues.map((i) => i.message),
      },
    };
  }
  return { ok: true, data: checked.data.requirements };
}
