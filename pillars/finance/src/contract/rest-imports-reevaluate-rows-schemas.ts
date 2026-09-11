/**
 * Zod schema for re-evaluating caller-supplied rows
 * (`POST /imports/reevaluate-pending-rows`). Split from `rest-imports-schemas.ts`
 * so that file stays under the per-file line cap; nothing here is imported by
 * the pipeline, only by the route map.
 */
import { z } from 'zod';

import { CALLER_SUPPLIED_TRANSACTIONS_MAX } from './rest-corrections-schemas.js';
import {
  ProcessImportOutputSchema,
  ReevaluateWithPendingRulesInputSchema,
} from './rest-imports-schemas.js';

/**
 * Re-evaluation of rows the caller holds rather than rows a process session
 * holds. A live draft's rows arrive pre-mapped and never pass through
 * `processImport`, so it has no session for the server to load them from.
 *
 * Strict, so a body that also carries the session form's `sessionId` is
 * rejected instead of silently evaluating one form and ignoring the other.
 * The row cap counts every bucket, `skipped` included, because it bounds the
 * request body and every bucket travels in it.
 */
export const ReevaluateRowsWithPendingRulesInputSchema = z
  .object({
    result: ProcessImportOutputSchema.refine(
      (result) =>
        result.matched.length +
          result.uncertain.length +
          result.failed.length +
          result.skipped.length <=
        CALLER_SUPPLIED_TRANSACTIONS_MAX,
      { message: `At most ${CALLER_SUPPLIED_TRANSACTIONS_MAX} rows can be re-evaluated at once` }
    ),
    pendingChangeSets: ReevaluateWithPendingRulesInputSchema.shape.pendingChangeSets,
  })
  .strict();
