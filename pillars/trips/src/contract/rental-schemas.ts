import { z } from 'zod';

import { ArrangementRevisionSchema } from './arrangement-revision.js';
import { CalendarDateSchema } from './schemas.js';

const Id = z.number().int().positive();
const Fields = {
  provider: z
    .string()
    .refine((value) => value.trim().length > 0, 'Expected nonblank provider')
    .nullable()
    .optional(),
  pickupVisitId: Id.nullable().optional(),
  returnVisitId: Id.nullable().optional(),
  start: CalendarDateSchema.nullable().optional(),
  end: CalendarDateSchema.nullable().optional(),
  status: z.enum(['Considering', 'Reserved', 'Purchased']).nullable().optional(),
};

/** Independent rental facts; only Purchased asserts a hard purchase and dates do not imply clocks. */
export const RentalSchema = z.object({
  id: Id,
  tripId: Id,
  provider: Fields.provider.unwrap(),
  pickupVisitId: Fields.pickupVisitId.unwrap(),
  returnVisitId: Fields.returnVisitId.unwrap(),
  start: Fields.start.unwrap(),
  end: Fields.end.unwrap(),
  status: Fields.status.unwrap(),
  revision: ArrangementRevisionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Omitted fields retain their values; null clears each fact independently. */
export const RentalInputSchema = z.object(Fields);
/** A stable trip-owned rental period with optional pickup/return Visit occurrences. */
export type Rental = z.infer<typeof RentalSchema>;
/** Explicit rental source fields accepted on creation or patch. */
export type RentalInput = z.infer<typeof RentalInputSchema>;
