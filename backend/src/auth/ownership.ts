import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "../../../shared/types";

/**
 * Ownership middleware foundation.
 *
 * Never reads ownerId from the client body/query. The loader must resolve
 * the resource's stored owner (e.g. kit.userId from MongoDB). Use as:
 *   router.get("/:id", requireAuth, requireOwner(loadKitOwnerId), handler)
 */
export function requireOwner(
  loadOwnerId: (req: Request) => Promise<string | null> | string | null,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: "Unauthorized" } satisfies ApiResponse<never>);
        return;
      }
      const ownerId = await loadOwnerId(req);
      if (ownerId == null) {
        res.status(404).json({ success: false, error: "Not found" } satisfies ApiResponse<never>);
        return;
      }
      if (ownerId !== req.user.id) {
        res.status(403).json({ success: false, error: "Forbidden" } satisfies ApiResponse<never>);
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Rejects any attempt to take ownership from a client-supplied field. */
export function ignoreClientOwnerId<T extends Record<string, unknown>>(body: T): Omit<T, "ownerId" | "userId"> {
  const rest = { ...body };
  delete rest.ownerId;
  delete rest.userId;
  return rest as Omit<T, "ownerId" | "userId">;
}
