/**
 * Public barrel for `@pops/purchases`. This is the default export of the
 * pillar — consumers `import { ... } from '@pops/purchases'` and get the
 * contract surface (zod schemas, TS types, constants, error codes,
 * manifest type).
 *
 * Nothing here is server-side. No drizzle imports, no node:fs, nothing that
 * can't run in a browser. The boundary is enforced by the package's
 * `exports` map: only `.`, `./manifest` and `./api-types` resolve from
 * outside; the `api/` and `db/` subdirs are unreachable to consumers.
 */
export * from './constants.js';
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { PurchasesContract } from './manifest.js';
