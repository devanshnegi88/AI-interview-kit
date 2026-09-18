import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./common/env";
import { dbStatus } from "./common/db";
import type { ApiResponse, HealthStatus } from "../../shared/types";
import { authRouter } from "./auth";
import { kitRouter } from "./kits/routes";

const startedAt = Date.now();

/**
 * Builds the Express app without starting a listener, so it can be
 * imported directly by tests (supertest) and by server.ts.
 */
export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req: Request, res: Response<ApiResponse<HealthStatus>>) => {
    const payload: HealthStatus = {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      db: dbStatus(),
      timestamp: new Date().toISOString(),
    };
    res.json({ success: true, data: payload });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/kits", kitRouter);

  app.use((_req: Request, res: Response<ApiResponse<never>>) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  app.use((err: unknown, _req: Request, res: Response<ApiResponse<never>>, _next: NextFunction) => {
    console.error("[app] unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}
