/**
 * Public barrel for `@pops/inventory`. This is the default export of the
 * pillar — consumers `import { ... } from '@pops/inventory'` and get the
 * contract surface (zod schemas, TS types, error codes, manifest type).
 *
 * Nothing here is server-side. No drizzle imports, no node:fs, nothing
 * that can't run in a browser. The boundary is enforced by the package's
 * `exports` map: only `.` and `./manifest` resolve from outside; the
 * `api/` and `db/` subdirs are unreachable to consumers.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export {
  combineUnits,
  describeDimension,
  formatUnitTerm,
  parseUnitTerm,
  sameDimension,
  termDimension,
  unitConversionShift,
  unitDimension,
} from './measurement-units.js';
export type { CombinedUnit, UnitDimension, UnitFactor, UnitTerm } from './measurement-units.js';
export type { InventoryContract } from './manifest.js';
export { WEB_BATCH_MAX_ROWS } from './rest-web-batch.js';
export { WEB_ITEMS_MAX_IDS } from './rest-web.js';
