/**
 * evaluation/ — reserved for a later phase.
 *
 * CLI entry point for 'npm run evaluate', batch execution, per-case failure handling. Added last, once the pipeline is complete.
 *
 * Intentionally empty in Phase 1 (project foundation). Exporting a marker
 * so the module resolves and the folder isn't lost to an empty-dir gitignore
 * quirk, without implementing any behavior yet.
 */
export const MODULE_NAME = "evaluation" as const;
