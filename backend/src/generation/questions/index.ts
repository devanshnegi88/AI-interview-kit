import type { GeneratedQuestion, QuestionCategory } from "../../../../shared/types";
import type { LlmError, LlmRuntime } from "../../llm";
import { generateBehaviouralQuestions } from "./behavioural";
import { generateCompanyFitQuestions } from "./companyFit";
import type { QuestionGenContext } from "./common";
import { generateSystemDesignQuestions } from "./systemDesign";
import { generateTechnicalQuestions } from "./technical";

export const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];

export interface QuestionGenerationBundle {
  questions: GeneratedQuestion[];
  failedStages: Array<{ category: QuestionCategory; error: LlmError }>;
}

export async function generateAllQuestions(
  ctx: QuestionGenContext,
  runtime?: LlmRuntime,
): Promise<QuestionGenerationBundle> {
  const stages: Array<{
    category: QuestionCategory;
    run: typeof generateTechnicalQuestions;
  }> = [
    { category: "technical", run: generateTechnicalQuestions },
    { category: "behavioural", run: generateBehaviouralQuestions },
    { category: "system-design", run: generateSystemDesignQuestions },
    { category: "company-fit", run: generateCompanyFitQuestions },
  ];
  const questions: GeneratedQuestion[] = [];
  const failedStages: QuestionGenerationBundle["failedStages"] = [];
  for (const stage of stages) {
    const result = await stage.run(ctx, runtime);
    if (result.ok) questions.push(...result.data);
    else failedStages.push({ category: stage.category, error: result.error });
  }
  return { questions, failedStages };
}

export { generateBehaviouralQuestions } from "./behavioural";
export { generateCompanyFitQuestions } from "./companyFit";
export { generateSystemDesignQuestions } from "./systemDesign";
export { generateTechnicalQuestions } from "./technical";
export type { QuestionGenContext } from "./common";
