export function llmLog(event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    component: "llm",
    event,
    ...fields,
  });
  if (fields.level === "error") console.error(line);
  else console.log(line);
}
