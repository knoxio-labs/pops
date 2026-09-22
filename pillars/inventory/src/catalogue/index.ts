/** Persisted type-catalogue reads, canonical values and protocol-1 compatibility. */
export {
  loadPublishedCatalogue,
  resolveProtocol1Type,
  resolveProtocol1TypeById,
  resolvePublishedType,
  CatalogueDataError,
} from './catalogue.js';
export type {
  PersistedCatalogue,
  PersistedCatalogueRevision,
  PersistedEnumOption,
  PersistedItemType,
  PersistedItemTypeField,
  PersistedTypeLookup,
} from './catalogue.js';
export {
  patchItemFieldValues,
  replaceItemFieldValues,
  validateProtocol1Fields,
} from './protocol-1-values.js';
export { clearItemFieldValues, copyItemFieldValues } from './protocol-1-copy.js';
export { loadProtocol1Fields } from './protocol-1-read.js';
export { Protocol1ValueError } from './protocol-1-types.js';
export { projectProtocol1Catalogue } from './protocol-1-catalogue.js';
export type {
  Protocol1CatalogueDescriptor,
  Protocol1CatalogueField,
  Protocol1CatalogueType,
  Protocol1Unit,
} from './protocol-1-catalogue.js';
export type {
  CanonicalItemFieldValues,
  Protocol1Fields,
  Protocol1FieldValue,
  Protocol1MeasurementValue,
  Protocol1RangeValue,
} from './protocol-1-types.js';
export {
  canonicalizeValue,
  parseCanonicalValue,
  PRIMITIVE_KINDS,
  ValueValidationError,
} from './value-codec.js';
export type {
  CanonicalValue,
  FieldCardinality,
  FieldStorage,
  PrimitiveKind,
  PrimitiveWireValue,
  ValueFieldDefinition,
  ValueValidationCode,
} from './value-codec.js';
