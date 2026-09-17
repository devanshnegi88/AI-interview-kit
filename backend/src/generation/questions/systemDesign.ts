import type { LlmResult, LlmRuntime } from "../../llm";
import type { GeneratedQuestion } from "../../../../shared/types";
import { baseQuestionRules, normalizeReqs, runQuestionCategory, type QuestionGenContext } from "./common";

const PROMPT = `${baseQuestionRules("system-design")}

Write system-design questions only when technical or domain requirements evidence systems, APIs, or data stores.
If they do not, return { "questions": [] }. Do not invent a fake architecture loop.`;

export async function generateSystemDesignQuestions(
  ctx: QuestionGenContext,
  runtime?: LlmRuntime,
): Promise<LlmResult<GeneratedQuestion[]>> {
  const reqs = normalizeReqs(ctx.requirements).filter((r) => r.kind === "technical" || r.kind === "domain");
  return runQuestionCategory({
    category: "system-design",
    systemPrompt: PROMPT,
    ctx,
    reqs,
    skip: reqs.length === 0,
    runtime,
  });
}
