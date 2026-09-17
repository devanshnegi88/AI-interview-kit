import dotenv from "dotenv";

dotenv.config();

/**
 * Typed access to environment variables.
 *
 * Kit input/output validation still lives in `validation/` (Zod). This file
 * is process config only.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
export const isProduction = nodeEnv === "production";
export const isTest = nodeEnv === "test";

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value !== "change_me_when_auth_lands") return value;
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set to a strong value in production");
  }
  return value ?? "dev-insecure-session-secret";
}

function parseOrigins(raw: string): string[] {
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : ["http://localhost:3000"];
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN ?? "http://localhost:3000"),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/ai_interview_prep_kit"),
  sessionSecret: sessionSecret(),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "sid",
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? (isTest ? 4 : 12)),
  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? 10_000),
  httpMaxBytes: Number(process.env.HTTP_MAX_BYTES ?? 2 * 1024 * 1024),
  httpMaxRedirects: Number(process.env.HTTP_MAX_REDIRECTS ?? 5),
  httpMinIntervalMs: Number(process.env.HTTP_MIN_INTERVAL_MS ?? 250),
};
