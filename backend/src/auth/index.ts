/**
 * auth/ — Phase 3 session-based authentication.
 *
 * Register/login/logout/me, bcrypt hashes, HTTP-only cookies, session TTL,
 * requireAuth, and requireOwner (ownership foundation). Kit generation is
 * not implemented here.
 */

export { authRouter } from "./routes";
export { requireAuth, optionalAuth } from "./middleware";
export { requireOwner, ignoreClientOwnerId } from "./ownership";
export { UserModel, SessionModel } from "./models";
export { createSession, destroySession, expireSessionForTests, findValidSession } from "./sessions";
export { hashPassword } from "./passwords";
export { SESSION_COOKIE, readSessionId, clearSessionCookie } from "./cookies";
