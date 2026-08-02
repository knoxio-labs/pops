import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Purchases-specific domain errors. Consumers narrow on `kind`.
 *
 * `duplicate-purchase` is not a failure in the usual sense — it is the
 * expected outcome of re-ingesting an export bundle that has already been
 * processed, and callers treat it as a skip.
 */
export type PurchasesDomainError =
  | { kind: 'unknown-purchase'; purchaseId: string }
  | { kind: 'unknown-source'; sourceId: string }
  | { kind: 'duplicate-purchase'; checksum: string };

export const PurchasesDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown-purchase'), purchaseId: z.string() }),
  z.object({ kind: z.literal('unknown-source'), sourceId: z.string() }),
  z.object({ kind: z.literal('duplicate-purchase'), checksum: z.string() }),
]);

export type PurchasesError = { kind: ContractStatus } | PurchasesDomainError;

export const PurchasesErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  PurchasesDomainErrorSchema,
]);
