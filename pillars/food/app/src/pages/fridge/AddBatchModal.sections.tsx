import { DateInput, Input, Select, type SelectOption } from '@pops/ui';

import { type AddFormState } from './AddBatchModal.ingredientSection.js';
import { FieldRow, NotesField, RadioRow } from './form-controls.js';

/**
 * JSX sub-sections for `AddBatchModal` — kept here so the modal file
 * itself stays under the `max-lines` budget. `IngredientPickerSection`
 * lives in its own file for the same reason.
 */
import type { ReactElement } from 'react';

import type {
  BatchLocation,
  BatchUnit,
  ManualBatchSourceType,
} from '../../food-api-shared-types.js';

const SOURCE_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'gift', label: 'Gift' },
  { value: 'other', label: 'Other' },
] as const;

const LOCATION_OPTIONS = [
  { value: 'pantry', label: 'Pantry' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'other', label: 'Other' },
] as const;

const UNIT_OPTIONS: SelectOption[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'count', label: 'count' },
];

export function PrepAndQtySection({ state }: { state: AddFormState }): ReactElement {
  const prepStateOptions: SelectOption[] = [
    { value: '', label: '— none —' },
    ...state.prepStates.map((p) => ({ value: String(p.id), label: p.name })),
  ];
  return (
    <>
      <Select
        label="Prep state (optional)"
        value={state.form.prepStateId}
        onChange={(e) => state.setForm({ ...state.form, prepStateId: e.target.value })}
        options={prepStateOptions}
      />
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Quantity">
          <Input
            type="number"
            step="any"
            min="0"
            value={state.form.qty}
            onChange={(e) => state.setForm({ ...state.form, qty: e.target.value })}
            required
          />
        </FieldRow>
        <Select
          label="Unit"
          value={state.form.unit}
          onChange={(e) => state.setForm({ ...state.form, unit: e.target.value as BatchUnit })}
          options={UNIT_OPTIONS}
        />
      </div>
    </>
  );
}

export function SourceAndLocationSection({ state }: { state: AddFormState }): ReactElement {
  return (
    <>
      <FieldRow label="Source">
        <RadioRow
          name="source"
          value={state.form.sourceType}
          options={SOURCE_OPTIONS}
          onChange={(v) => state.setForm({ ...state.form, sourceType: v as ManualBatchSourceType })}
        />
      </FieldRow>
      <FieldRow label="Location">
        <RadioRow
          name="location"
          value={state.form.location}
          options={LOCATION_OPTIONS}
          onChange={(v) => state.setForm({ ...state.form, location: v as BatchLocation })}
        />
      </FieldRow>
    </>
  );
}

export function DateAndNotesSection({ state }: { state: AddFormState }): ReactElement {
  const set = (patch: Partial<AddFormState['form']>): void =>
    state.setForm({ ...state.form, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Produced">
          <DateInput
            value={state.form.producedAt}
            onChange={(e) => set({ producedAt: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Expires (optional)">
          <DateInput
            value={state.form.expiresAt}
            onChange={(e) => set({ expiresAt: e.target.value })}
          />
        </FieldRow>
      </div>
      <NotesField
        label="Notes (optional)"
        value={state.form.notes}
        onChange={(notes) => set({ notes })}
      />
    </>
  );
}
