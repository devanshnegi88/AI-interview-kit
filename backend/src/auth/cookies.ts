import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { env, isProduction } from "../common/env";

export const SESSION_COOKIE = env.sessionCookieName;

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: env.sessionTtlSeconds * 1000,
  };
}

function sign(sessionId: string): string {
  const sig = createHmac("sha256", env.sessionSecret).update(sessionId).digest("hex");
  return `${sessionId}.${sig}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function readSessionId(req: Request): string | undefined {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw !== "string" || !raw.includes(".")) return undefined;
  const dot = raw.indexOf(".");
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!sessionId || !sig) return undefined;
  const expected = createHmac("sha256", env.sessionSecret).update(sessionId).digest("hex");
  if (!safeEqual(sig, expected)) return undefined;
  return sessionId;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sign(sessionId), sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: 0 });
}
