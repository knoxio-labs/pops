import { z } from 'zod';

/** Safe integer precondition; a revision at the maximum cannot advance or wrap. */
export const ArrangementRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
/** Required revision for replacing or deleting an arrangement source value. */
export const ArrangementRevisionBody = z.object({ expectedRevision: ArrangementRevisionSchema });
