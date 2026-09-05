/**
 * Foundations every other db export group sits on: the error taxonomy, the
 * shared row/tag types, the schema, and the connection handle.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * from '../errors.js';
export * from '../tag-facets.js';
export * from '../row-types.js';
export * from '../schema.js';

export type { FinanceDb } from '../services/internal.js';

export { openFinanceDb, type OpenedFinanceDb } from '../open-finance-db.js';
