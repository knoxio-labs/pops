/**
 * Shared zod building blocks for the documents REST contract. Kept apart
 * from the per-module route files so the contract stays zod-only — no
 * imports from `src/api/`, honouring the package boundary.
 */
import { z } from 'zod';

/**
 * Error envelope. `messageKey` carries the i18n key a consumer's frontend
 * resolves to a localised string. Mirrors the shape every other pillar's
 * contract uses (see `pillars/inventory/src/contract/rest-schemas.ts`).
 */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  messageKey: z.string().optional(),
});
