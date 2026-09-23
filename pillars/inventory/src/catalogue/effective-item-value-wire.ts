import type { EffectiveComputedValue } from './expression-types.js';
import type { EffectiveItemFieldValue, ReadItemFieldValue } from './item-value-types.js';

/** Projects one evaluated computed field onto its effective item-value shape. */
export function computedWire(
  fieldId: string,
  value: EffectiveComputedValue
): EffectiveItemFieldValue {
  return value.state === 'value'
    ? { fieldId, state: 'value', values: value.values, provenance: value.provenance }
    : {
        fieldId,
        state: 'unavailable',
        reason: value.reason,
        failedFieldId: value.fieldId,
        traversedItemIds: value.traversedItemIds,
        provenance: value.provenance,
      };
}

/** Projects one persisted stored field onto its effective item-value shape. */
export function storedWire(value: ReadItemFieldValue): EffectiveItemFieldValue {
  return {
    fieldId: value.fieldId,
    state: 'value',
    values: value.values,
    provenance: { source: 'stored', catalogueRevision: value.catalogueRevision },
  };
}
