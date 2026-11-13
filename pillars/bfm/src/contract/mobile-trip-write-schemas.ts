import { MobileTripSchema } from './mobile-trips-schemas.js';

import type { z } from 'zod';

/** Canonical metadata only: omission retains, null clears nullable facts, and When stays opaque. */
export const MobileTripInputSchema = MobileTripSchema.pick({
  name: true,
  destination: true,
  when: true,
  tagId: true,
  parentId: true,
  notes: true,
  sourceLinks: true,
})
  .partial()
  .strict();
/** Named PATCH projection for the native generator's supported omission/null-aware type override. */
export const MobileTripPatchInputSchema = MobileTripInputSchema.meta({
  id: 'MobileTripPatchInput',
});

/** Published create/patch input; creation has no producer operation UUID or Undo. */
export type MobileTripInput = z.infer<typeof MobileTripInputSchema>;
