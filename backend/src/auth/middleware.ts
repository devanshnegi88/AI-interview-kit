import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, UserSummary } from "../../../shared/types";
import { clearSessionCookie, readSessionId } from "./cookies";
import { UserModel } from "./models";
import { destroySession, findValidSession } from "./sessions";

async function loadUserFromCookie(req: Request, res: Response): Promise<UserSummary | null> {
  const sessionId = readSessionId(req);
  if (!sessionId) return null;

  const session = await findValidSession(sessionId);
  if (!session) {
    clearSessionCookie(res);
    return null;
  }

  const user = await UserModel.findById(session.userId).lean();
  if (!user) {
    await destroySession(sessionId);
    clearSessionCookie(res);
    return null;
  }

  req.sessionId = session.sessionId;
  const summary: UserSummary = { id: String(user._id), email: user.email };
  req.user = summary;
  return summary;
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await loadUserFromCookie(req, res);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await loadUserFromCookie(req, res);
    if (!user) {
      res.status(401).json({ success: false, error: "Unauthorized" } satisfies ApiResponse<never>);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
