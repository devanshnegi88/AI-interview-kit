import type { GeneratedQuestion, QuestionCategory } from "../../../../shared/types";
import type { LlmResult, LlmRuntime } from "../../llm";
import { baseQuestionRules, runQuestionCategory, type QuestionGenContext, type QuestionSourceReq } from "./common";

function categoryFor(req: QuestionSourceReq): QuestionCategory {
  if (req.kind === "behavioural" || req.kind === "behavioral") return "behavioural";
  if (req.kind === "domain") return "company-fit";
  return "technical";
}

const MISSING_HINT = `
These MUST-HAVE requirements currently have ZERO questions.
Write at least one question per listed id if the JD/brief supports it.
If you cannot ground a question in the provided material, omit that id.
Do not fabricate requirements, skills, or interview rounds.`;

/**
 * LLM may fill gaps. It does not decide whether coverage passed.
 */
export async function generateMissingQuestions(
  ctx: QuestionGenContext,
  uncovered: QuestionSourceReq[],
  runtime?: LlmRuntime,
): Promise<LlmResult<GeneratedQuestion[]>> {
  if (uncovered.length === 0) return { ok: true, data: [] };

  const byCategory = new Map<QuestionCategory, QuestionSourceReq[]>();
  for (const req of uncovered) {
    const cat = categoryFor(req);
    const list = byCategory.get(cat) ?? [];
    list.push(req);
    byCategory.set(cat, list);
  }

  const out: GeneratedQuestion[] = [];
  for (const [category, reqs] of byCategory) {
    const result = await runQuestionCategory({
      category,
      systemPrompt: `${baseQuestionRules(category)}\n${MISSING_HINT}`,
      ctx,
      reqs,
      skip: false,
      runtime,
    });
    if (result.ok) out.push(...result.data);
  }
  return { ok: true, data: out };
}
