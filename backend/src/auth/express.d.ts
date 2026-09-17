import type { UserSummary } from "../../../shared/types";

declare global {
  namespace Express {
    interface Request {
      user?: UserSummary;
      sessionId?: string;
    }
  }
}

export {};
