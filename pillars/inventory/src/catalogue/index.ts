/** Persisted type-catalogue reads, canonical values and protocol-1 compatibility. */
export {
  loadCatalogue,
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
  UnresolvedItemType,
  UnresolvedItemTypeField,
} from './catalogue.js';
export {
  MAX_TYPE_TREE_DEPTH,
  ancestorIds,
  descendantIds,
  resolveTypeTree,
  typeChain,
} from './catalogue-tree.js';
export type { TypeChain } from './catalogue-tree.js';
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
export { canonicalizeValue, parseCanonicalValue } from './value-dispatch.js';
export { PRIMITIVE_KINDS, ValueValidationError } from './value-codec.js';
export {
  findCatalogueType,
  assertIncomingReferencesPermitType,
  ItemFieldSetError,
  readItemFieldValues,
  replaceValidatedItemFieldValues,
  validateItemFieldValues,
  validateItemFieldValuesForType,
} from './item-values.js';
export {
  readEffectiveItemFieldValues,
  readEffectiveItemFieldValuesForItems,
} from './effective-item-values.js';
export { clearComputedValueCache, invalidateComputedItem } from './computed-value-runtime-cache.js';
export type { EffectiveItemFieldValue } from './item-value-types.js';
export type {
  CanonicalItemFieldValueInput,
  ItemFieldValueInput,
  ReadItemFieldValue,
  ReadReferenceWireValue,
  ReferenceTargetState,
} from './item-values.js';
export { classifyCatalogueCompatibility } from './compatibility.js';
export { sameFieldShape } from './compatibility-fields.js';
export { replacingField, replacingType } from './catalogue-lineage.js';
export type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
  CatalogueCompatibilityResult,
} from './compatibility.js';
export type {
  CanonicalValue,
  FieldCardinality,
  FieldStorage,
  PrimitiveKind,
  PrimitiveWireValue,
  ValueFieldDefinition,
  ValueValidationCode,
} from './value-codec.js';
export { ComputedValueCache } from './expression-cache.js';
export type { ComputedCacheSubject } from './expression-cache.js';
export {
  assertAcyclicExpressionGraph,
  buildExpressionDependencyGraph,
  collectInvalidatedExpressions,
  expressionFieldKey,
} from './expression-dependencies.js';
export { evaluateComputedValue } from './computed-values.js';
export { evaluateExpression } from './expression-evaluator.js';
export { EXPRESSION_V1_OPS, parseExpression } from './expression-parser.js';
export { validateCatalogueExpressions } from './expression-validator.js';
export {
  ExpressionValidationError,
  type EffectiveComputedValue,
  type EvaluatedDependency,
  type ExpressionDependency,
  type ExpressionEvaluation,
  type ExpressionFieldKey,
  type ExpressionSnapshot,
  type ExpressionSnapshotItem,
  type ExpressionUnavailableReason,
  type ExpressionV1,
  type ExpressionValueType,
  type SnapshotFieldValue,
  type ValidatedExpression,
} from './expression-types.js';
