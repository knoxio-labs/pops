import { decimalPlacesFromPresentation } from '../../catalogue-editor/decimal-places';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { FormFieldDef } from '../../pages/item-form/field-model';

/** Adapts a catalogue field to the shared item-form validation and input contracts. */
export function bulkFormField(field: CatalogueType['fields'][number]): FormFieldDef {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    kind: field.kind,
    cardinality: field.cardinality,
    required: field.required,
    storage: field.storage,
    allowOverride: field.allowOverride,
    help: field.help,
    fixedUnit: field.fixedUnit,
    decimalPlaces: decimalPlacesFromPresentation(field.presentation),
    enumOptions: field.enumOptions,
    referenceKinds: field.referenceKinds,
    referenceTypeIds: field.referenceTypeIds,
    expression: field.expression,
  };
}
