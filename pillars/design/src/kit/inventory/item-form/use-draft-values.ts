import { useCallback, useState } from 'react';

import { type ItemFormOpening } from './item-form-opening';
import { itemToFormValues } from './item-record';
import { defaultValues, type ItemFormValues } from './types';

/**
 * The form's field values plus dirty-tracking against the values it opened
 * with. The initial snapshot is captured once, in `useState`'s lazy
 * initializer, rather than a ref: it is read on every render to compute
 * `isDirty`, and a ref read during render is a React Compiler correctness
 * hazard even when, as here, the ref is never reassigned.
 */
export function useDraftValues(opening: ItemFormOpening) {
  const [values, setValues] = useState<ItemFormValues>(() => ({
    ...(opening.item ? itemToFormValues(opening.item) : defaultValues),
    ...opening.initialValues,
  }));
  const [initialSnapshot] = useState(values);

  const onChange = useCallback(
    <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const isDirty = (Object.keys(values) as (keyof ItemFormValues)[]).some(
    (key) => values[key] !== initialSnapshot[key]
  );

  return { values, onChange, isDirty };
}
