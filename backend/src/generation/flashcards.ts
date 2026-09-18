import { z } from "zod";
import type { Flashcard, Requirement } from "../../../shared/types";
import { generateWithLLM, type LlmResult, type LlmRuntime, llmFail } from "../llm";
import { flashcardId } from "../validation/ids";

export const FLASHCARD_GENERATION_PROMPT = `You generate flashcards that reinforce the requirement coverage of an interview kit.

Rules:
- Use only requirement IDs supplied by the caller.
- Each flashcard must cite at least one requirement_id.
- Prefer short, precise, high-signal prompts that test understanding of the requirement, not generic trivia.
- front and back must be distinct and useful for recall.
- Return valid JSON only.

JSON shape:
{ "flashcards": [ { "front": string, "back": string, "requirement_ids": [string, ...] } ] }`;

const FlashcardDraftSchema = z
  .object({
    front: z.string().trim().min(1),
    back: z.string().trim().min(1),
    requirement_ids: z.array(z.string()).min(1),
  })
  .strict();

const FlashcardBatchSchema = z
  .object({
    flashcards: z.array(FlashcardDraftSchema).min(1),
  })
  .strict();

function stampIds(drafts: Array<{ front: string; back: string; requirement_ids: string[] }>): Flashcard[] {
  const seen = new Set<string>();
  const out: Flashcard[] = [];
  for (const draft of drafts) {
    const requirement_ids = [...new Set(draft.requirement_ids)];
    if (requirement_ids.length === 0) continue;
    const id = flashcardId(draft.front, draft.back);
    if (seen.has(id)) continue;
    seen.add(id);
    const parsed = z
      .object({
        id: z.string(),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
        requirement_ids: z.array(z.string()).min(1),
      })
      .strict()
      .safeParse({ id, front: draft.front, back: draft.back, requirement_ids });
    if (!parsed.success) continue;
    out.push(parsed.data as Flashcard);
  }
  return out;
}

export async function generateFlashcards(
  requirements: Requirement[],
  runtime?: LlmRuntime,
): Promise<LlmResult<Flashcard[]>> {
  const allowed = new Set(requirements.map((r) => r.id));

  const generated = await generateWithLLM(
    {
      stage: "flashcards",
      systemPrompt: FLASHCARD_GENERATION_PROMPT,
      input: {
        requirements: requirements.map((r) => ({ id: r.id, text: r.text, priority: r.priority, kind: r.kind ?? "technical" })),
      },
      schema: FlashcardBatchSchema,
    },
    runtime,
  );

  if (!generated.ok) return generated;

  const valid = generated.data.flashcards
    .map((draft) => ({
      front: draft.front.trim(),
      back: draft.back.trim(),
      requirement_ids: [...new Set(draft.requirement_ids.filter((id) => allowed.has(id)))],
    }))
    .filter((draft) => draft.front && draft.back && draft.requirement_ids.length > 0);

  if (valid.length === 0) {
    return llmFail("SCHEMA", "No valid flashcards were produced with known requirement ids.", {
      stage: "flashcards",
      retryable: false,
    });
  }

  const stamped = stampIds(valid);
  return stamped.length > 0 ? { ok: true, data: stamped } : llmFail("SCHEMA", "Generated flashcards failed final validation.", { stage: "flashcards", retryable: false });
}
