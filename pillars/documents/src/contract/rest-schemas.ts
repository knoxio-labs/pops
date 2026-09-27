/**
 * Shared zod building blocks for the documents REST contract. Kept apart
 * from the per-module route files so the contract stays zod-only — no
 * imports from `src/api/`, honouring the package boundary.
 */
export { ErrorBodySchema } from '@pops/types';
