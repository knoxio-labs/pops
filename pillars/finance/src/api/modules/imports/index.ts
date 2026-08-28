/**
 * Statement-import pipeline for the finance pillar (db-injected).
 *
 * The CSV/PDF transformers are out of scope (the wire receives already-parsed
 * transactions). The AI categorizer (`ai-categorizer.ts`) is env-gated behind
 * `FINANCE_AI_CATEGORIZER_ENABLED`, and its tag-only pass over already-matched rows
 * (`ai-tags-resolver.ts`) behind the separate `FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED`.
 * Everything else — dedup, the deterministic matching stages,
 * learned-correction application, session re-evaluation, atomic commit, and the
 * in-memory progress store — is here.
 */
export {
  createEntity,
  commitImport,
  processImportWithProgress,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
} from './service.js';

export {
  clearProgress,
  getProgress,
  setProgress,
  updateProgress,
  type ImportProgress,
} from './progress-store.js';
