import type {
  CompanyBrief,
  Flashcard,
  KitError,
  KitFieldState,
  KitPracticeState,
  KitSource,
  KitStatus,
  Question,
  Requirement,
  Role,
  ScheduleDay,
  StoredKit,
} from "../../../shared/types";
import { generateFlashcards, researchCompany, runCoverageLoop, extractRequirements, toKitRequirement } from "../generation";
import type { LlmRuntime } from "../llm";
import { assembleKit, validateKit } from "../validation";
import { KitSourceSchema } from "../validation/schema";
import { KitModel, toStoredKit } from "./models";

export interface KitPipelineOptions {
  ownerId?: string;
  input?: Record<string, unknown>;
  kitId?: string;
  runtime?: LlmRuntime;
  onUpdate?: (snapshot: StoredKit) => Promise<void> | void;
}

export interface KitPipelineResult {
  kit: StoredKit;
  status: KitStatus;
  error: KitError | null;
}

function defaultFieldState(): KitFieldState {
  return {
    input: "done",
    research: "pending",
    requirements: "pending",
    questions: "pending",
    flashcards: "pending",
    schedule: "pending",
    validation: "pending",
  };
}

function defaultPracticeState(): KitPracticeState {
  return {
    mode: "off",
    currentDay: null,
    currentItemId: null,
    completedCount: 0,
    startedAt: null,
    updatedAt: null,
  };
}

function blankCompanyBrief(companyUrl: string): CompanyBrief {
  let name = "Company";
  try {
    const url = new URL(companyUrl);
    name = url.hostname.replace(/^www\./i, "") || "Company";
  } catch {
    name = "Company";
  }
  return {
    name,
    one_liner: "Public research is still being gathered.",
    products: [],
    culture: [],
    interview_process: [],
    recent_news: [],
    citations: [],
  };
}

function toCompanyBrief(
  companyUrl: string,
  research: {
    company_brief: { summary: string; what_they_do: string; sources: Array<{ url: string; title: string }> };
    hiring_process: { summary: string };
    interview_process: { summary: string };
  },
): CompanyBrief {
  const base = blankCompanyBrief(companyUrl);
  const summary = research.company_brief.summary || research.company_brief.what_they_do || base.one_liner;
  const products = research.company_brief.what_they_do ? [research.company_brief.what_they_do] : base.products;
  const culture = research.hiring_process.summary ? [research.hiring_process.summary] : base.culture;
  const interview = research.interview_process.summary ? [research.interview_process.summary] : base.interview_process;
  return {
    name: base.name,
    one_liner: summary,
    products,
    culture,
    interview_process: interview,
    recent_news: [],
    citations: research.company_brief.sources.map((source: { url: string; title: string }) => ({
      url: source.url,
      title: source.title,
      snippet: source.title || "Company research source",
    })),
  };
}

function inferRoleTitle(jobDescription: string): string {
  const text = jobDescription.replace(/\s+/g, " ").trim();
  if (!text) return "Role";
  const words = text.split(" ").slice(0, 6).join(" ");
  return words.length > 0 ? words : "Role";
}

async function updateRecord(
  kitId: string | undefined,
  patch: Partial<StoredKit> & { error?: KitError | null },
  options: KitPipelineOptions,
): Promise<StoredKit> {
  if (!kitId) {
    const value: StoredKit = {
      id: `kit_${Date.now()}`,
      ownerId: options.ownerId ?? "unknown",
      status: patch.status ?? "pending",
      input: (patch.input as Record<string, unknown>) ?? {},
      source: patch.source ?? null,
      company_brief: patch.company_brief ?? null,
      role: patch.role ?? null,
      questions: patch.questions ?? [],
      flashcards: patch.flashcards ?? [],
      schedule: patch.schedule ?? [],
      coverage: patch.coverage ?? null,
      fieldState: patch.fieldState ?? defaultFieldState(),
      practiceState: patch.practiceState ?? defaultPracticeState(),
      error: patch.error ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (options.onUpdate) await options.onUpdate(value);
    return value;
  }

  const doc = await KitModel.findByIdAndUpdate(
    kitId,
    {
      $set: {
        status: patch.status,
        input: patch.input,
        source: patch.source,
        company_brief: patch.company_brief,
        role: patch.role,
        questions: patch.questions,
        flashcards: patch.flashcards,
        schedule: patch.schedule,
        coverage: patch.coverage,
        fieldState: patch.fieldState,
        practiceState: patch.practiceState,
        error: patch.error,
      },
    },
    { new: true },
  );

  const snapshot = doc ? toStoredKit(doc) : {
    id: kitId,
    ownerId: options.ownerId ?? "unknown",
    status: patch.status ?? "pending",
    input: (patch.input as Record<string, unknown>) ?? {},
    source: patch.source ?? null,
    company_brief: patch.company_brief ?? null,
    role: patch.role ?? null,
    questions: patch.questions ?? [],
    flashcards: patch.flashcards ?? [],
    schedule: patch.schedule ?? [],
    coverage: patch.coverage ?? null,
    fieldState: patch.fieldState ?? defaultFieldState(),
    practiceState: patch.practiceState ?? defaultPracticeState(),
    error: patch.error ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies StoredKit;

  if (options.onUpdate) await options.onUpdate(snapshot);
  return snapshot;
}

export async function runKitPipeline(
  sourceInput: KitSource | Record<string, unknown>,
  options: KitPipelineOptions = {},
): Promise<KitPipelineResult> {
  const parsed = KitSourceSchema.safeParse(sourceInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error: KitError = {
      code: "INVALID_SOURCE",
      message: issue?.message ?? "Invalid kit source",
      details: { issues: parsed.error.issues },
    };
    const snapshot = await updateRecord(options.kitId, {
      status: "failed",
      input: (options.input as Record<string, unknown>) ?? (sourceInput as Record<string, unknown>),
      source: null,
      company_brief: null,
      role: null,
      questions: [],
      flashcards: [],
      schedule: [],
      coverage: null,
      fieldState: defaultFieldState(),
      practiceState: defaultPracticeState(),
      error,
    }, options);
    return { kit: snapshot, status: "failed", error };
  }

  const source = parsed.data as KitSource;
  const input = (options.input as Record<string, unknown>) ?? (sourceInput as Record<string, unknown>);
  let fieldState = defaultFieldState();
  let practiceState = defaultPracticeState();
  let companyBrief = blankCompanyBrief(source.company_url);
  let role: Role | Partial<Role> = {
    title: inferRoleTitle(source.job_description),
    level: "unspecified",
    responsibilities: ["Derived from the supplied job description."],
    requirements: [],
  };
  let questions: Question[] = [];
  let flashcards: Flashcard[] = [];
  let schedule: ScheduleDay[] = [];
  let coverage = null;

  fieldState.input = "done";
  await updateRecord(options.kitId, {
    ownerId: options.ownerId ?? "unknown",
    status: "researching",
    input,
    source,
    company_brief: companyBrief,
    role,
    questions,
    flashcards,
    schedule,
    coverage,
    fieldState: { ...fieldState, research: "in_progress" },
    practiceState,
    error: null,
  }, options);

  try {
    const research = await researchCompany(source.company_url, { runtime: options.runtime });
    if (!research.ok) {
      throw new Error(research.error.message ?? "Company research failed");
    }
    companyBrief = toCompanyBrief(source.company_url, research.data);
    fieldState.research = "done";
    await updateRecord(options.kitId, {
      status: "researching",
      input,
      source,
      company_brief: companyBrief,
      role,
      questions,
      flashcards,
      schedule,
      coverage,
      fieldState,
      practiceState,
      error: null,
    }, options);

    const extracted = await extractRequirements(source.job_description, options.runtime);
    if (!extracted.ok) {
      throw new Error(extracted.error.message ?? "Requirement extraction failed");
    }

    const requirements: Requirement[] = extracted.data.map((item) => toKitRequirement(item));
    role = {
      title: inferRoleTitle(source.job_description),
      level: "unspecified",
      team: undefined,
      responsibilities: requirements.length > 0 ? requirements.slice(0, 4).map((req) => req.text) : ["Derived from the job description."],
      requirements,
    };
    fieldState.requirements = "done";

    const loop = await runCoverageLoop(
      {
        requirements: extracted.data,
        companyBrief: research.data.company_brief,
        role: { title: role.title, level: role.level, team: role.team },
        research: { hiring_process: research.data.hiring_process, interview_process: research.data.interview_process },
        jobDescription: source.job_description,
      },
      { runtime: options.runtime },
    );

    const generatedDrafts = loop.questions.map((question) => {
      const type =
        question.category === "technical"
          ? "technical"
          : question.category === "behavioural"
            ? "behavioral"
            : question.category === "system-design"
              ? "system_design"
              : "company";
      return {
        id: question.id,
        type,
        difficulty:
          question.difficulty === 1 ? "easy" : question.difficulty === 2 ? "medium" : "hard",
        prompt: question.prompt,
        why_asked: question.answer_outline.join(" ") || "This question directly tests the linked requirement.",
        requirement_ids: question.requirement_ids,
        tags: [question.category],
        answer_outline: question.answer_outline,
        follow_ups: [],
        estimated_minutes: question.difficulty === 3 ? 30 : question.difficulty === 2 ? 20 : 15,
      } satisfies Question;
    });

    questions = generatedDrafts;
    fieldState.questions = "done";

    const flashcardsResult = await generateFlashcards(requirements, options.runtime);
    if (!flashcardsResult.ok) {
      throw new Error(flashcardsResult.error.message ?? "Flashcard generation failed");
    }
    flashcards = flashcardsResult.data;
    fieldState.flashcards = "done";

    const kitDraft = {
      source,
      company_brief: companyBrief,
      role: role as Role,
      questions: generatedDrafts,
      flashcards,
    };

    const assembled = assembleKit(kitDraft);
    const validated = validateKit(assembled);
    if (!validated.success || !validated.kit) {
      const issue = validated.issues.find((item) => item.severity === "error") ?? validated.issues[0];
      throw new Error(issue?.message ?? "The assembled kit failed validation");
    }

    schedule = validated.kit.schedule;
    coverage = validated.kit.coverage;
    fieldState.schedule = "done";
    fieldState.validation = "done";

    const finalKit = await updateRecord(options.kitId, {
      status: "ready",
      input,
      source,
      company_brief: validated.kit.company_brief,
      role: validated.kit.role,
      questions: validated.kit.questions,
      flashcards: validated.kit.flashcards,
      schedule: validated.kit.schedule,
      coverage: validated.kit.coverage,
      fieldState,
      practiceState,
      error: null,
    }, options);

    return { kit: finalKit, status: "ready", error: null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Kit generation failed";
    const nextError: KitError = {
      code: "PIPELINE_FAILED",
      message,
      details: { stage: "pipeline" },
    };
    fieldState.research = fieldState.research === "done" ? "done" : "failed";
    fieldState.requirements = fieldState.requirements === "done" ? "done" : "failed";
    fieldState.questions = fieldState.questions === "done" ? "done" : "failed";
    fieldState.flashcards = fieldState.flashcards === "done" ? "done" : "failed";
    fieldState.schedule = fieldState.schedule === "done" ? "done" : "failed";
    fieldState.validation = "failed";

    const failedKit = await updateRecord(options.kitId, {
      status: "failed",
      input,
      source,
      company_brief: companyBrief,
      role,
      questions,
      flashcards,
      schedule,
      coverage,
      fieldState,
      practiceState,
      error: nextError,
    }, options);

    return { kit: failedKit, status: "failed", error: nextError };
  }
}
