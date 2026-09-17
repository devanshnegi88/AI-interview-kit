import type { LlmResult, LlmRuntime } from "../../llm";
import type { GeneratedQuestion } from "../../../../shared/types";
import { baseQuestionRules, normalizeReqs, runQuestionCategory, type QuestionGenContext } from "./common";

const PROMPT = `${baseQuestionRules("behavioural")}

Write behavioural (STAR) questions grounded only in behavioural requirements.
Do not invent soft skills that are not listed.`;

export async function generateBehaviouralQuestions(
  ctx: QuestionGenContext,
  runtime?: LlmRuntime,
): Promise<LlmResult<GeneratedQuestion[]>> {
  const reqs = normalizeReqs(ctx.requirements).filter(
    (r) => r.kind === "behavioural" || r.kind === "behavioral",
  );
  return runQuestionCategory({
    category: "behavioural",
    systemPrompt: PROMPT,
    ctx,
    reqs,
    skip: reqs.length === 0,
    runtime,
  });
}
