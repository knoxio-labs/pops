/**
 * A skip that leaves its reason where the evidence collector can read it.
 *
 * `context.skip(note)` shows the note in the terminal but vitest's JSON
 * report drops it, so `mise run inventory:acceptance` would record a skip
 * with no reason. The reason is copied onto the task's `meta`, which the
 * JSON report does carry, before skipping.
 */
import type { TestContext } from 'vitest';

declare module 'vitest' {
  interface TaskMeta {
    /** Why an acceptance criterion was skipped; read by the evidence collector. */
    skipReason?: string;
  }
}

/** Skips the running acceptance test and records `reason` for the evidence packet. */
export function skipCriterion(context: TestContext, reason: string): never {
  context.task.meta.skipReason = reason;
  return context.skip(reason);
}
