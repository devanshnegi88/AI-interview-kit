/**
 * kits/ — reserved for a later phase.
 *
 * Kit persistence, editing endpoints, regeneration orchestration, ownership checks. Added once auth and the kit schema exist.
 *
 * Intentionally empty of generation in Phase 3. GET /api/kits is a protected
 * empty stub until the Kits phase. Exporting a marker
 * so the module resolves and the folder isn't lost to an empty-dir gitignore
 * quirk, without implementing any behavior yet.
 */
export const MODULE_NAME = "kits" as const;
