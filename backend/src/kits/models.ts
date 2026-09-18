import mongoose, { Schema } from "mongoose";
import type {
  CompanyBrief,
  CoverageReport,
  Flashcard,
  KitFieldState,
  KitPracticeState,
  KitSource,
  KitStatus,
  Question,
  Role,
  ScheduleDay,
  StoredKit,
} from "../../../shared/types";

export interface KitErrorDoc {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface KitDoc extends mongoose.Document {
  ownerId: mongoose.Types.ObjectId;
  status: KitStatus;
  input: Record<string, unknown>;
  source?: KitSource | null;
  company_brief?: CompanyBrief | Partial<CompanyBrief> | null;
  role?: Role | Partial<Role> | null;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: ScheduleDay[];
  coverage?: CoverageReport | null;
  fieldState: KitFieldState;
  practiceState: KitPracticeState;
  error?: KitErrorDoc | null;
  createdAt: Date;
  updatedAt: Date;
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

const KitSchema = new Schema<KitDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "researching", "generating", "ready", "failed"],
      default: "pending",
      index: true,
    },
    input: { type: Schema.Types.Mixed, required: true },
    source: { type: Schema.Types.Mixed, default: null },
    company_brief: { type: Schema.Types.Mixed, default: null },
    role: { type: Schema.Types.Mixed, default: null },
    questions: { type: [Schema.Types.Mixed] as any, default: [] },
    flashcards: { type: [Schema.Types.Mixed] as any, default: [] },
    schedule: { type: [Schema.Types.Mixed] as any, default: [] },
    coverage: { type: Schema.Types.Mixed, default: null },
    fieldState: { type: Schema.Types.Mixed, default: defaultFieldState },
    practiceState: { type: Schema.Types.Mixed, default: defaultPracticeState },
    error: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const KitModel: mongoose.Model<KitDoc> =
  (mongoose.models.Kit as mongoose.Model<KitDoc> | undefined) ??
  mongoose.model<KitDoc>("Kit", KitSchema);

export function toStoredKit(doc: KitDoc | StoredKit): StoredKit {
  const value = doc as Partial<KitDoc> & { _id?: { toString(): string } };
  const base = {
    id: String(value._id ?? ("id" in value ? value.id : "")),
    ownerId: String(value.ownerId ?? ""),
    status: value.status ?? "pending",
    input: (value.input as Record<string, unknown>) ?? {},
    source: value.source ?? null,
    company_brief: value.company_brief ?? null,
    role: value.role ?? null,
    questions: (value.questions as Question[]) ?? [],
    flashcards: (value.flashcards as Flashcard[]) ?? [],
    schedule: (value.schedule as ScheduleDay[]) ?? [],
    coverage: (value.coverage as CoverageReport | null) ?? null,
    fieldState: (value.fieldState as KitFieldState) ?? defaultFieldState(),
    practiceState: (value.practiceState as KitPracticeState) ?? defaultPracticeState(),
    error: value.error ?? null,
    createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : new Date().toISOString(),
  } satisfies StoredKit;

  return base;
}
