import { z } from 'zod';

/**
 * Shared zod building blocks for the ai pillar REST contract.
 *
 * Everything here is zod-only — no imports from `src/api/` or `src/db/`,
 * so the contract honours the package boundary (consumers see only `.`).
 */
import { ErrorBodySchema } from '@pops/types';

export { ErrorBodySchema } from '@pops/types';

/** String identity (uuid style). Path + body alike. */
export const NonEmptyString = z.string().min(1);

/**
 * `limit` query param. On the wire it arrives as a string; `z.coerce`
 * parses it. Optional — the handler applies the per-domain default.
 */
export const LimitQuery = z.coerce.number().int().positive().optional();

/** `offset` query param. String on the wire; coerced; optional. */
export const OffsetQuery = z.coerce.number().int().nonnegative().optional();

/** Pagination envelope returned by every list endpoint. */
export const PaginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

/** Bare `{ message }` body returned by delete-style mutations. */
export const MessageSchema = z.object({ message: z.string() });

/**
 * Common error responses spread into every route that can fail through
 * the shared `HttpError` mapping (`mapHttpError`).
 */
export const ERR_RESPONSES = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
} as const;

/**
 * Error responses for identity-gated routes. Adds `401` on top of the
 * common `400/404/409` set.
 */
export const AUTH_ERR_RESPONSES = {
  400: ErrorBodySchema,
  401: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
} as const;
