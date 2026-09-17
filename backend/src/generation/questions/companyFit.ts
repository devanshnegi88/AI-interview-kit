import type { LlmResult, LlmRuntime } from "../../llm";
import type { GeneratedQuestion } from "../../../../shared/types";
import { baseQuestionRules, normalizeReqs, runQuestionCategory, type QuestionGenContext } from "./common";

const PROMPT = `${baseQuestionRules("company-fit")}

Write company-fit questions from the company brief and research context.
Link them to real requirement ids (domain or any provided).
If interview_process.found is false, do not invent rounds or a hiring loop.
If the company brief is empty, return { "questions": [] }.`;

export async function generateCompanyFitQuestions(
  ctx: QuestionGenContext,
  runtime?: LlmRuntime,
): Promise<LlmResult<GeneratedQuestion[]>> {
  const brief = ctx.companyBrief;
  const emptyBrief = !brief || (!brief.summary.trim() && !brief.what_they_do.trim());
  const reqs = normalizeReqs(ctx.requirements);
  return runQuestionCategory({
    category: "company-fit",
    systemPrompt: PROMPT,
    ctx,
    reqs,
    skip: emptyBrief || reqs.length === 0,
    runtime,
  });
}
