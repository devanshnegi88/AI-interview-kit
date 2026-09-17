import { Router, type Request, type Response } from "express";
import type { ApiResponse, UserSummary } from "../../../shared/types";
import { clearSessionCookie, readSessionId, setSessionCookie } from "./cookies";
import { requireAuth } from "./middleware";
import { UserModel } from "./models";
import { hashPassword, verifyPasswordOrDummy } from "./passwords";
import { CredentialsSchema } from "./schemas";
import { createSession, destroySession } from "./sessions";

export const authRouter = Router();

function invalidCredentials(res: Response): void {
  res.status(401).json({ success: false, error: "Invalid email or password" } satisfies ApiResponse<never>);
}

authRouter.post("/register", async (req: Request, res: Response, next) => {
  try {
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      } satisfies ApiResponse<never>);
      return;
    }
    const { email, password } = parsed.data;
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      res.status(409).json({ success: false, error: "Email already registered" } satisfies ApiResponse<never>);
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({ email, passwordHash });
    const { sessionId } = await createSession(String(user._id));
    setSessionCookie(res, sessionId);

    const data: UserSummary = { id: String(user._id), email: user.email };
    res.status(201).json({ success: true, data } satisfies ApiResponse<UserSummary>);
  } catch (err: unknown) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: unknown }).code : undefined;
    if (code === 11000) {
      res.status(409).json({ success: false, error: "Email already registered" } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

authRouter.post("/login", async (req: Request, res: Response, next) => {
  try {
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      } satisfies ApiResponse<never>);
      return;
    }
    const { email, password } = parsed.data;
    const user = await UserModel.findOne({ email }).select("+passwordHash");
    const ok = await verifyPasswordOrDummy(password, user?.passwordHash);
    if (!user || !ok) {
      invalidCredentials(res);
      return;
    }

    const { sessionId } = await createSession(String(user._id));
    setSessionCookie(res, sessionId);
    const data: UserSummary = { id: String(user._id), email: user.email };
    res.json({ success: true, data } satisfies ApiResponse<UserSummary>);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req: Request, res: Response, next) => {
  try {
    const sessionId = readSessionId(req);
    if (sessionId) await destroySession(sessionId);
    clearSessionCookie(res);
    res.json({ success: true, data: { loggedOut: true } } satisfies ApiResponse<{ loggedOut: true }>);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, data: req.user } satisfies ApiResponse<UserSummary>);
});
