import { z } from 'zod';

import { MobileTripIdSchema } from './mobile-trips-schemas.js';

/** Explicit Trips-owned association to a Documents original; no file or device availability is inferred. */
export const MobileTripDocumentAssociationSchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  documentId: MobileTripIdSchema,
  targetKind: z.enum(['trip', 'visit', 'journey', 'stay', 'event']),
  targetId: MobileTripIdSchema,
  createdAt: z.iso.datetime(),
});
/** Original association identity, independently of equal filenames or multiple targets for one document. */
export type MobileTripDocumentAssociation = z.infer<typeof MobileTripDocumentAssociationSchema>;
