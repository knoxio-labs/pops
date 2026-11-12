import { z } from 'zod';

import { CreateTripBody, TripSchema } from './schemas.js';

/** Explicit operation envelope; unlike legacy POST /trips, unsupported producers receive 404. */
export const TripCreateOperationSchema = z.strictObject({
  operationId: z.uuid(),
  command: z.strictObject({ kind: z.literal('trip.create'), input: CreateTripBody.strict() }),
});
/** Original durable creation acknowledgement retained across later Trip edits. */
export const TripCreateReceiptSchema = z.strictObject({
  operationId: z.uuid(),
  trip: TripSchema,
});
/** Original receipt and current Trip are separate because metadata may change after creation. */
export const TripCreateOperationResultSchema = z.strictObject({
  receipt: TripCreateReceiptSchema,
  current: z.strictObject({ trip: TripSchema }),
  replayed: z.boolean(),
});
/** Typed request accepted by the receipt-backed Trip creation route. */
export type TripCreateOperation = z.infer<typeof TripCreateOperationSchema>;
/** Persisted original Trip creation acknowledgement. */
export type TripCreateReceipt = z.infer<typeof TripCreateReceiptSchema>;
/** Original creation receipt and current Trip projection returned by the route. */
export type TripCreateOperationResult = z.infer<typeof TripCreateOperationResultSchema>;
