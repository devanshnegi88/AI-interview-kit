/**
 * scheduling/ — Phase 2 deterministic core.
 *
 * Day-by-day allocation of questions and flashcards. Pure function: same
 * kit contents always produce the same schedule. No LLM, no clock, no RNG.
 */

export { buildSchedule, minutesPerDay } from "./schedule";
export type { ScheduleInput } from "./schedule";
