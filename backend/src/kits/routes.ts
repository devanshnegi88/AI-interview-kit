import { Router, type Request, type Response } from "express";
import type { ApiResponse, StoredKit } from "../../../shared/types";
import { requireAuth, requireOwner } from "../auth";
import { ignoreClientOwnerId } from "../auth/ownership";
import { KitSourceSchema } from "../validation/schema";
import { assembleKit, validateKit } from "../validation";
import { KitModel, toStoredKit } from "./models";
import { runKitPipeline } from "./pipeline";

export const kitRouter = Router();

function serializeKit(doc: Awaited<ReturnType<typeof KitModel.findOne>> | null): StoredKit | null {
  if (!doc) return null;
  const kit = toStoredKit(doc as never);
  return {
    ...kit,
    id: String((doc as { _id?: { toString(): string } })._id ?? kit.id),
    ownerId: String((doc as { ownerId?: unknown }).ownerId ?? kit.ownerId),
  };
}

function badInput(res: Response, message: string): void {
  res.status(400).json({ success: false, error: message } satisfies ApiResponse<never>);
}

function normalizeEditState(value: unknown, fallback: "generated" | "edited" | "pinned" = "generated"): "generated" | "edited" | "pinned" {
  const next = typeof value === "string" ? value.toLowerCase() : "";
  return next === "generated" || next === "edited" || next === "pinned" ? next : fallback;
}

async function refreshDerivedKit(kit: any) {
  if (!kit || !kit.source || !kit.role || !Array.isArray(kit.questions) || !Array.isArray(kit.flashcards)) {
    return kit;
  }

  const baseBrief =
    kit.company_brief && typeof kit.company_brief === "object"
      ? {
          ...kit.company_brief,
          ...(kit.company_brief.state ? { state: normalizeEditState(kit.company_brief.state) } : {}),
        }
      : {
          name: "Company",
          one_liner: "Company research is being kept with the user’s edits.",
          products: [],
          culture: [],
          interview_process: [],
          recent_news: [],
          citations: [],
          state: "generated" as const,
        };

  const draft = {
    source: kit.source,
    company_brief: baseBrief,
    role: {
      ...kit.role,
      requirements: Array.isArray(kit.role.requirements) ? kit.role.requirements : [],
      responsibilities: Array.isArray(kit.role.responsibilities) ? kit.role.responsibilities : [],
    },
    questions: kit.questions.map((q: Record<string, unknown>) => ({
      ...q,
      ...(q.state ? { state: normalizeEditState(q.state) } : {}),
    })),
    flashcards: kit.flashcards.map((fc: Record<string, unknown>) => ({
      ...fc,
      ...(fc.state ? { state: normalizeEditState(fc.state) } : {}),
    })),
  };

  try {
    const assembled = assembleKit(draft as any);
    const validated = validateKit(assembled);
    if (validated.success && validated.kit) {
      kit.schedule = validated.kit.schedule;
      kit.coverage = validated.kit.coverage;
      kit.company_brief = validated.kit.company_brief;
      kit.role = validated.kit.role;
      kit.questions = validated.kit.questions.map((q) => ({ ...q, state: normalizeEditState((q as { state?: unknown }).state ?? "generated") }));
      kit.flashcards = validated.kit.flashcards.map((fc) => ({ ...fc, state: normalizeEditState((fc as { state?: unknown }).state ?? "generated") }));
    }
  } catch {
    // Ignore invalid intermediate edits while preserving the user-edited stateful content.
  }

  return kit;
}

function preserveGeneratedContent<T extends { state?: unknown }>(items: T[], fallbackState: "generated" | "edited" | "pinned" = "generated") {
  return items.map((item) => ({
    ...item,
    state: normalizeEditState((item as { state?: unknown }).state, fallbackState),
  }));
}

kitRouter.post("/", requireAuth, async (req: Request, res: Response, next) => {
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const sourcePayload = body.source && typeof body.source === "object" ? (body.source as Record<string, unknown>) : body;
    const parsed = KitSourceSchema.safeParse(sourcePayload);
    if (!parsed.success) {
      badInput(res, parsed.error.issues[0]?.message ?? "Invalid kit source");
      return;
    }

    const input = { ...body };
    const cleanedInput = ignoreClientOwnerId(input as Record<string, unknown>);
    const source = parsed.data;

    const kitDoc = await KitModel.create({
      ownerId: req.user!.id as any,
      status: "pending",
      input: cleanedInput,
      source,
      company_brief: null,
      role: null,
      questions: [],
      flashcards: [],
      schedule: [],
      coverage: null,
      fieldState: {
        input: "done",
        research: "pending",
        requirements: "pending",
        questions: "pending",
        flashcards: "pending",
        schedule: "pending",
        validation: "pending",
      },
      practiceState: {
        mode: "off",
        currentDay: null,
        currentItemId: null,
        completedCount: 0,
        startedAt: null,
        updatedAt: null,
      },
      error: null,
    });

    const result = await runKitPipeline(source, {
      ownerId: req.user!.id,
      kitId: String(kitDoc._id),
      input: cleanedInput,
    });

    if (result.status === "ready") {
      const responsePayload = serializeKit(await KitModel.findById(kitDoc._id).lean());
      if (!responsePayload) {
        res.status(500).json({ success: false, error: "Kit could not be loaded after generation" } satisfies ApiResponse<never>);
        return;
      }
      res.status(201).json({ success: true, data: responsePayload } satisfies ApiResponse<StoredKit>);
      return;
    }

    const failedPayload = serializeKit(await KitModel.findById(kitDoc._id).lean());
    res.status(422).json({
      success: false,
      error: result.error?.message ?? "Kit generation failed",
      data: failedPayload ?? undefined,
    } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.get("/", requireAuth, async (req: Request, res: Response, next) => {
  try {
    const kits = await KitModel.find({ ownerId: req.user!.id }).sort({ createdAt: -1 }).lean();
    const payload = kits.map((kit) => serializeKit(kit)).filter(Boolean) as StoredKit[];
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit[]>);
  } catch (err) {
    next(err);
  }
});

kitRouter.get("/:id", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id).lean();
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const payload = serializeKit(kit);
    if (!payload) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.put("/:id", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const sourcePayload = body.source && typeof body.source === "object" ? (body.source as Record<string, unknown>) : body;
    const parsed = KitSourceSchema.safeParse(sourcePayload);
    if (!parsed.success) {
      badInput(res, parsed.error.issues[0]?.message ?? "Invalid kit source");
      return;
    }

    const input = { ...body };
    const cleanedInput = ignoreClientOwnerId(input as Record<string, unknown>);
    const source = parsed.data;

    const kitDoc = await KitModel.findById(req.params.id);
    if (!kitDoc) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    kitDoc.ownerId = req.user!.id as any;
    kitDoc.status = "pending";
    kitDoc.input = cleanedInput;
    kitDoc.source = source;
    kitDoc.company_brief = null;
    kitDoc.role = null;
    kitDoc.questions = [];
    kitDoc.flashcards = [];
    kitDoc.schedule = [];
    kitDoc.coverage = null;
    kitDoc.fieldState = {
      input: "done",
      research: "pending",
      requirements: "pending",
      questions: "pending",
      flashcards: "pending",
      schedule: "pending",
      validation: "pending",
    };
    kitDoc.practiceState = {
      mode: "off",
      currentDay: null,
      currentItemId: null,
      completedCount: 0,
      startedAt: null,
      updatedAt: null,
    };
    kitDoc.error = null;

    const result = await runKitPipeline(source, {
      ownerId: req.user!.id,
      kitId: String(kitDoc._id),
      input: cleanedInput,
    });

    if (result.status === "ready") {
      const responsePayload = serializeKit(await KitModel.findById(kitDoc._id).lean());
      if (!responsePayload) {
        res.status(500).json({ success: false, error: "Kit could not be loaded after generation" } satisfies ApiResponse<never>);
        return;
      }
      res.status(201).json({ success: true, data: responsePayload } satisfies ApiResponse<StoredKit>);
      return;
    }

    const failedPayload = serializeKit(await KitModel.findById(kitDoc._id).lean());
    res.status(422).json({
      success: false,
      error: result.error?.message ?? "Kit generation failed",
      data: failedPayload ?? undefined,
    } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.post("/:id/questions", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const requestPayload = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const nextQuestion = {
      ...requestPayload,
      id: String(requestPayload.id ?? `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      requirement_ids: Array.isArray(requestPayload.requirement_ids) ? requestPayload.requirement_ids.map(String) : [],
      tags: Array.isArray(requestPayload.tags) ? requestPayload.tags.map(String) : [],
      answer_outline: Array.isArray(requestPayload.answer_outline) ? requestPayload.answer_outline.map(String) : [],
      follow_ups: Array.isArray(requestPayload.follow_ups) ? requestPayload.follow_ups.map(String) : [],
      state: normalizeEditState((requestPayload as { state?: unknown }).state ?? "edited"),
    };

    kit.questions = preserveGeneratedContent([...(kit.questions ?? []), nextQuestion as any]);
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();
    const savedKit = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!savedKit) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.status(201).json({ success: true, data: savedKit } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.patch("/:id/company-brief", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const nextBrief = {
      ...(kit.company_brief && typeof kit.company_brief === "object" ? (kit.company_brief as Record<string, unknown>) : {}),
      ...((req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>),
      state: normalizeEditState((req.body as { state?: unknown })?.state ?? "edited"),
    };

    kit.company_brief = nextBrief as any;
    kit.status = "ready";
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.post("/:id/flashcards", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const payload = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const nextFlashcard = {
      ...payload,
      id: String(payload.id ?? `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      requirement_ids: Array.isArray(payload.requirement_ids) ? payload.requirement_ids.map(String) : [],
      question_ids: Array.isArray(payload.question_ids) ? payload.question_ids.map(String) : undefined,
      tags: Array.isArray(payload.tags) ? payload.tags.map(String) : undefined,
      state: normalizeEditState((payload as { state?: unknown }).state ?? "edited"),
    };

    kit.flashcards = preserveGeneratedContent([...(kit.flashcards ?? []), nextFlashcard as any]);
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();

    const savedKit = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!savedKit) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.status(201).json({ success: true, data: savedKit } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.patch("/:id/flashcards/:fid", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const existing = (kit.flashcards ?? []).find((flashcard) => String((flashcard as { id?: string }).id) === req.params.fid);
    if (!existing) {
      res.status(404).json({ success: false, error: "Flashcard not found" } satisfies ApiResponse<never>);
      return;
    }

    const patch = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const updated = {
      ...existing,
      ...patch,
      id: String(existing.id),
      state: normalizeEditState((patch.state as string | undefined) ?? (((existing as { state?: unknown }).state ?? "edited") as string)),
    } as any;

    kit.flashcards = preserveGeneratedContent((kit.flashcards ?? []).map((flashcard) => String((flashcard as { id?: string }).id) === req.params.fid ? updated : flashcard));
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.delete("/:id/questions/:qid", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    kit.questions = (kit.questions ?? []).filter((question) => String((question as { id?: string }).id) !== req.params.qid);
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.post("/:id/regenerate/:section", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const section = String(req.params.section ?? "").toLowerCase();
    if (!["brief", "questions", "flashcards", "schedule"].includes(section)) {
      res.status(400).json({ success: false, error: "Unsupported section" } satisfies ApiResponse<never>);
      return;
    }

    if (section === "brief") {
      const current = kit.company_brief && typeof kit.company_brief === "object" ? (kit.company_brief as Record<string, unknown>) : {};
      const nextBrief = normalizeEditState(current.state ?? "edited") === "edited" || normalizeEditState(current.state ?? "edited") === "pinned"
        ? { ...current, state: normalizeEditState(current.state ?? "edited") }
        : { ...(current as Record<string, unknown>), state: "generated" };
      kit.company_brief = nextBrief as any;
    }

    if (section === "questions") {
      kit.questions = preserveGeneratedContent((kit.questions ?? []).map((question) => ({
        ...question,
        ...(normalizeEditState((question as { state?: unknown }).state) === "generated" ? { state: "generated" } : { state: normalizeEditState((question as { state?: unknown }).state ?? "edited") }),
      })));
    }

    if (section === "flashcards") {
      kit.flashcards = preserveGeneratedContent((kit.flashcards ?? []).map((flashcard) => ({
        ...flashcard,
        ...(normalizeEditState((flashcard as { state?: unknown }).state) === "generated" ? { state: "generated" } : { state: normalizeEditState((flashcard as { state?: unknown }).state ?? "edited") }),
      })));
    }

    if (section === "schedule") {
      await refreshDerivedKit(kit);
    }

    kit.status = "ready";
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.patch("/:id/questions/reorder", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const order = Array.isArray(req.body) ? req.body : Array.isArray((req.body as { ids?: unknown })?.ids) ? (req.body as { ids: unknown[] }).ids : [];
    const ids = order.map((item) => String(item));
    if (ids.length === 0) {
      res.status(400).json({ success: false, error: "A question order is required" } satisfies ApiResponse<never>);
      return;
    }

    const map = new Map((kit.questions ?? []).map((question) => [String((question as { id?: string }).id), question]));
    const nextQuestions = ids.map((id) => map.get(id)).filter(Boolean) as any[];
    const leftovers = (kit.questions ?? []).filter((question) => !ids.includes(String((question as { id?: string }).id)));
    kit.questions = preserveGeneratedContent([...nextQuestions, ...leftovers]);
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});

kitRouter.patch("/:id/questions/:qid", requireAuth, requireOwner(async (req: Request) => {
  const doc = await KitModel.findById(req.params.id).select("ownerId").lean();
  return doc ? String((doc as { ownerId?: unknown }).ownerId ?? null) : null;
}), async (req: Request, res: Response, next) => {
  try {
    const kit = await KitModel.findById(req.params.id);
    if (!kit) {
      res.status(404).json({ success: false, error: "Kit not found" } satisfies ApiResponse<never>);
      return;
    }

    const existing = (kit.questions ?? []).find((question) => String((question as { id?: string }).id) === req.params.qid);
    if (!existing) {
      res.status(404).json({ success: false, error: "Question not found" } satisfies ApiResponse<never>);
      return;
    }

    const patch = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const updated = {
      ...existing,
      ...patch,
      id: String(existing.id),
      state: normalizeEditState((patch.state as string | undefined) ?? (((existing as { state?: unknown }).state ?? "edited") as string)),
    } as any;

    kit.questions = preserveGeneratedContent((kit.questions ?? []).map((question) => String((question as { id?: string }).id) === req.params.qid ? updated : question));
    kit.status = "ready";
    await refreshDerivedKit(kit);
    await kit.save();

    const payload = serializeKit(await KitModel.findById(req.params.id).lean());
    if (!payload) {
      res.status(500).json({ success: false, error: "Kit could not be loaded after update" } satisfies ApiResponse<never>);
      return;
    }
    res.json({ success: true, data: payload } satisfies ApiResponse<StoredKit>);
  } catch (err) {
    next(err);
  }
});
