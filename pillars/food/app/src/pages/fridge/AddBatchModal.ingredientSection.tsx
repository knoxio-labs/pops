import { Input, Select, type SelectOption } from '@pops/ui';

import { FieldRow } from './form-controls.js';
import { type useAddBatchForm } from './useAddBatchForm.js';

/**
 * Ingredient + variant pickers for `AddBatchModal` — split out of
 * `AddBatchModal.sections.tsx` to keep that file under the `max-lines`
 * budget.
 */
import type { ReactElement } from 'react';

import type { BatchUnit } from '../../food-api-shared-types.js';

export type AddFormState = ReturnType<typeof useAddBatchForm>;

export function buildVariantChange(
  state: AddFormState,
  value: string
): Parameters<AddFormState['setForm']>[0] {
  const variant = state.variants.find((v) => String(v.id) === value);
  return {
    ...state.form,
    variantId: value,
    unit: (variant?.defaultUnit as BatchUnit | undefined) ?? state.form.unit,
  };
}

export function IngredientPickerSection({ state }: { state: AddFormState }): ReactElement {
  const ingredientOptions: SelectOption[] = [
    { value: '', label: 'Pick an ingredient…' },
    ...state.ingredients.map((ing) => ({
      value: String(ing.id),
      label: `${ing.name} (${ing.slug})`,
    })),
  ];
  const variantOptions: SelectOption[] = [
    { value: '', label: 'Pick a variant…' },
    ...state.variants.map((v) => ({ value: String(v.id), label: `${v.name} (${v.slug})` })),
  ];
  return (
    <>
      <FieldRow label="Search ingredient">
        <Input
          value={state.form.search}
          placeholder="tomato"
          onChange={(e) => state.setForm({ ...state.form, search: e.target.value })}
        />
      </FieldRow>
      <Select
        label="Ingredient"
        value={state.form.ingredientId}
        onChange={(e) =>
          state.setForm({ ...state.form, ingredientId: e.target.value, variantId: '' })
        }
        options={ingredientOptions}
      />
      <Select
        label="Variant"
        value={state.form.variantId}
        onChange={(e) => state.setForm(buildVariantChange(state, e.target.value))}
        options={variantOptions}
        disabled={state.form.ingredientId.length === 0}
      />
    </>
  );
}
