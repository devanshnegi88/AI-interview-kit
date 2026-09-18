import { Router, type Request, type Response } from "express";
import type { ApiResponse, StoredKit } from "../../../shared/types";
import { requireAuth, requireOwner } from "../auth";
import { ignoreClientOwnerId } from "../auth/ownership";
import { KitSourceSchema } from "../validation/schema";
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
      ownerId: req.user!.id,
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
