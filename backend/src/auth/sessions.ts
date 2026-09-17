import { randomBytes } from "node:crypto";
import { env } from "../common/env";
import { SessionModel } from "./models";

export function newSessionId(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + env.sessionTtlSeconds * 1000);
  await SessionModel.create({ sessionId, userId, expiresAt });
  return { sessionId, expiresAt };
}

export async function findValidSession(sessionId: string): Promise<{ userId: string; sessionId: string } | null> {
  const row = await SessionModel.findOne({ sessionId }).lean();
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await SessionModel.deleteOne({ sessionId });
    return null;
  }
  return { userId: String(row.userId), sessionId: row.sessionId };
}

export async function destroySession(sessionId: string): Promise<void> {
  await SessionModel.deleteOne({ sessionId });
}

export async function expireSessionForTests(sessionId: string, at = new Date(Date.now() - 1000)): Promise<void> {
  await SessionModel.updateOne({ sessionId }, { $set: { expiresAt: at } });
}
