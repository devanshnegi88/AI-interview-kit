export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) return trimmed.slice(objStart, objEnd + 1);
  const arrStart = trimmed.indexOf("[");
  const arrEnd = trimmed.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) return trimmed.slice(arrStart, arrEnd + 1);
  return trimmed;
}

export function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(extractJsonText(raw)) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Invalid JSON" };
  }
}
