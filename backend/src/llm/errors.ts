export type LlmErrorCode =
  | "CONFIG"
  | "TIMEOUT"
  | "AUTH"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "HTTP_STATUS"
  | "NETWORK"
  | "INVALID_JSON"
  | "SCHEMA"
  | "RATE_LIMIT";

export interface LlmError {
  code: LlmErrorCode;
  message: string;
  retryable: boolean;
  stage?: string;
  status?: number;
  issues?: string[];
}

export type LlmResult<T> = { ok: true; data: T } | { ok: false; error: LlmError };

export function llmFail(
  code: LlmErrorCode,
  message: string,
  extras: Partial<Omit<LlmError, "code" | "message">> = {},
): LlmResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: extras.retryable ?? false,
      stage: extras.stage,
      status: extras.status,
      issues: extras.issues,
    },
  };
}
