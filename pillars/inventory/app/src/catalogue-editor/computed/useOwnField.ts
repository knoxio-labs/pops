import { decimalPlacesFromInput } from '../decimal-places';
import { useFieldFormContext } from '../FieldFormContext';

import type { ExpressionField } from '@pops/inventory/expression';

/** Builds the current computed field descriptor, including unsaved display precision. */
export function useOwnField(): ExpressionField {
  const form = useFieldFormContext();
  const decimalPlaces = decimalPlacesFromInput(form.decimalPlaces);
  return {
    id: form.field?.id ?? '',
    label: form.label.trim() === '' ? 'This field' : form.label.trim(),
    kind: form.kind,
    cardinality: 'one',
    storage: 'computed',
    ...(decimalPlaces === null ? {} : { decimalPlaces }),
    options: (form.field?.enumOptions ?? []).map((option) => ({
      id: option.id,
      label: option.label,
    })),
  };
}
