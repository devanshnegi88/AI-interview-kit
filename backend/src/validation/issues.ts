export interface KitValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export function issue(
  code: string,
  message: string,
  extras: { path?: string; severity?: "error" | "warning" } = {},
): KitValidationIssue {
  return {
    code,
    message,
    severity: extras.severity ?? "error",
    ...(extras.path ? { path: extras.path } : {}),
  };
}
