import type { LlmResult, LlmRuntime } from "../../llm";
import type { GeneratedQuestion } from "../../../../shared/types";
import { baseQuestionRules, isMust, normalizeReqs, runQuestionCategory, type QuestionGenContext } from "./common";

const PROMPT = `${baseQuestionRules("technical")}

Write technical questions from technical requirements only.
Prefer multiple questions for each must technical requirement when the JD supports it (different angles, not duplicates).
Do not invent languages, tools, or stacks that are not listed.`;

export async function generateTechnicalQuestions(
  ctx: QuestionGenContext,
  runtime?: LlmRuntime,
): Promise<LlmResult<GeneratedQuestion[]>> {
  const reqs = normalizeReqs(ctx.requirements).filter((r) => r.kind === "technical");
  const mustCount = reqs.filter((r) => isMust(r.priority)).length;
  const extra = mustCount > 0 ? `\nAim for about ${Math.max(2, mustCount * 2)} questions so important technical requirements get more than one question.` : "";
  return runQuestionCategory({
    category: "technical",
    systemPrompt: PROMPT + extra,
    ctx,
    reqs,
    skip: reqs.length === 0,
    runtime,
  });
}
