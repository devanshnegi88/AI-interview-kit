/**
 * generation/ — reserved for a later phase.
 *
 * LLM-backed stages: requirement extraction, company brief, question generation, flashcard generation. Added in the Generation phase.
 *
 * The LLM must NOT do coverage checking, scheduling, ID validation, or
 * structural validation — those live in validation/ and scheduling/ and
 * run on the model output via assembleKit / validateKit.
 *
 * Intentionally empty until the Generation phase. Exporting a marker
 * so the module resolves and the folder isn't lost to an empty-dir gitignore
 * quirk, without implementing any behavior yet.
 */
export const MODULE_NAME = "generation" as const;
