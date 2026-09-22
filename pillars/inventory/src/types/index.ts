/**
 * The type catalogue module (ADR-002 D5): types are defined in code here and
 * projected into a versioned descriptor served to clients. Internal to the
 * pillar — the command layer (A3/A4) and the sync routes (A5) import from
 * here directly; nothing here is re-exported through `@pops/inventory`'s
 * public `src/contract` surface.
 */
export {
  defineType,
  typeFieldsSchema,
  TypeDefinitionError,
  TYPE_CAPABILITIES,
} from './define-type.js';
export type {
  FieldDefinition,
  TypeDefinition,
  TypeCapability,
  DefineTypeInput,
} from './define-type.js';

export { fieldValueSchema, FIELD_KINDS } from './values.js';
export type {
  FieldKind,
  FieldValue,
  FieldValueByKind,
  MeasurementValue,
  RangeValue,
} from './values.js';

export {
  DIMENSIONS,
  UNITS,
  unitBySymbol,
  isKnownUnit,
  unitsForDimension,
  convert,
  UnitDimensionMismatchError,
} from './units.js';
export type { Dimension, UnitDefinition } from './units.js';

export {
  INVENTORY_TYPES,
  findType,
  bookType,
  cableType,
  chargerType,
  bulbType,
  tapeType,
  storageBoxType,
  furnitureType,
} from './catalogue.js';

export { projectCatalogue, findIncompatibilities } from './descriptor.js';
export type { CatalogueDescriptor, CatalogueIncompatibility } from './descriptor.js';

export { TYPE_MIGRATIONS, hasMigration } from './type-migrations.js';
export type { TypeMigrationRecord } from './type-migrations.js';
