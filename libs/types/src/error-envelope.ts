import { z } from 'zod';

/**
 * The wire envelope returned for every user-visible REST failure.
 *
 * The metadata id keeps the OpenAPI projection on one shared component even
 * when a contract uses the schema in several response positions.
 */
export const ErrorBodySchema = z
  .object({
    code: z.string().min(1),
    message: z.string(),
    requestId: z.string().min(1),
    retryable: z.boolean(),
    details: z.unknown().optional(),
  })
  .meta({ id: 'ErrorBody' });

export type ErrorBody = z.infer<typeof ErrorBodySchema>;
